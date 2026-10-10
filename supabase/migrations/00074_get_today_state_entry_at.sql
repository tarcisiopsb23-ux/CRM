-- Adiciona entry_at e break_out_at ao retorno de rep_p_get_today_state
-- Corrige bug de fuso: now_local via timezone() tem epoch errado para subtrações
-- Usar now() (UTC) para cálculos de elapsed; now_local apenas para exibição

CREATE OR REPLACE FUNCTION rep_p_get_today_state()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  org_id        UUID;
  uid           UUID;
  today         DATE;
  now_utc       TIMESTAMPTZ;  -- epoch correto para cálculos
  now_local     TIMESTAMPTZ;  -- apenas para exibição/retorno
  exempt        BOOLEAN;
  last_type     rep_p_punch_type;
  last_at       TIMESTAMPTZ;
  entry_at      TIMESTAMPTZ;
  break_out_at  TIMESTAMPTZ;
  final_out_at  TIMESTAMPTZ;
  has_entry     BOOLEAN;
  has_final     BOOLEAN;
  alerts        TEXT[] := ARRAY[]::TEXT[];
  next_allowed  TEXT[] := ARRAY[]::TEXT[];
  elapsed_entry INTERVAL;
  elapsed_break INTERVAL;
  -- Regra de 12h entre jornadas
  last_final_prev TIMESTAMPTZ;
BEGIN
  uid       := auth.uid();
  org_id    := get_user_organization_id();
  today     := rep_p_today_date();
  now_utc   := now();
  now_local := rep_p_now_local();
  exempt    := rep_p_user_is_exempt(uid);

  SELECT e.punch_type, e.occurred_at INTO last_type, last_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
  ORDER BY e.occurred_at DESC LIMIT 1;

  SELECT e.occurred_at INTO entry_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'entrada'
  ORDER BY e.occurred_at ASC LIMIT 1;

  SELECT e.occurred_at INTO break_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_intervalo'
  ORDER BY e.occurred_at ASC LIMIT 1;

  SELECT e.occurred_at INTO final_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_final'
  ORDER BY e.occurred_at DESC LIMIT 1;

  has_entry := entry_at IS NOT NULL;
  has_final := final_out_at IS NOT NULL;

  -- Última saida_final de dias anteriores (regra de 12h entre jornadas)
  SELECT e.occurred_at INTO last_final_prev
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND e.punch_type = 'saida_final'
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date < today
  ORDER BY e.occurred_at DESC LIMIT 1;

  -- Alertas
  IF has_entry AND entry_at IS NOT NULL THEN
    elapsed_entry := now_utc - entry_at;

    IF break_out_at IS NULL THEN
      -- Alerta a partir de 4h (mínimo para saída intervalo)
      IF elapsed_entry >= interval '4 hours' AND elapsed_entry < interval '6 hours 30 minutes' THEN
        alerts := alerts || ARRAY['Você pode registrar a saída para intervalo agora.'];
      END IF;
      -- Alerta de prazo máximo se >= 6h30 (sem tolerância)
      IF elapsed_entry >= interval '6 hours 30 minutes' THEN
        IF rep_p_has_valid_limit_auth(uid, today, 'late_break') THEN
          alerts := alerts || ARRAY['Prazo máximo de intervalo atingido (6h30). Autorização ativa — registre agora.'];
        ELSE
          alerts := alerts || ARRAY['Prazo máximo de intervalo atingido (6h30). Solicite autorização de admin/owner.'];
        END IF;
      END IF;
    END IF;

    -- Alerta de jornada próxima de 8h (a partir de 7h30)
    IF elapsed_entry >= interval '7 hours 30 minutes' AND NOT has_final THEN
      alerts := alerts || ARRAY['Sua jornada está próxima de 8 horas. Registre a saída final.'];
    END IF;
  END IF;

  IF break_out_at IS NOT NULL AND last_type = 'saida_intervalo' THEN
    elapsed_break := now_utc - break_out_at;
    -- Alerta a partir de 1h (mínimo para retorno)
    IF elapsed_break >= interval '1 hour' AND elapsed_break < interval '2 hours' THEN
      alerts := alerts || ARRAY['Você pode registrar o retorno do intervalo agora.'];
    END IF;
    -- Alerta de prazo máximo se >= 2h (sem tolerância)
    IF elapsed_break >= interval '2 hours' THEN
      IF rep_p_has_valid_limit_auth(uid, today, 'late_return') THEN
        alerts := alerts || ARRAY['Prazo máximo de retorno atingido (2h). Autorização ativa — registre agora.'];
      ELSE
        alerts := alerts || ARRAY['Prazo máximo de retorno atingido (2h). Solicite autorização de admin/owner.'];
      END IF;
    END IF;
  END IF;

  -- next_allowed
  IF has_final THEN
    next_allowed := ARRAY[]::TEXT[];
  ELSIF last_type IS NULL THEN
    next_allowed := ARRAY['entrada'];
  ELSIF last_type = 'entrada' THEN
    next_allowed := ARRAY['saida_intervalo', 'saida_final'];
  ELSIF last_type = 'saida_intervalo' THEN
    next_allowed := ARRAY['retorno_intervalo'];
  ELSIF last_type = 'retorno_intervalo' THEN
    next_allowed := ARRAY['saida_final'];
  ELSIF last_type = 'saida_final' THEN
    next_allowed := ARRAY[]::TEXT[];
  END IF;

  RETURN json_build_object(
    'today_date',         today::text,
    'now_local',          now_local::text,
    'exempt',             exempt,
    'has_entry',          has_entry,
    'has_final_exit',     has_final,
    'last_punch_type',    COALESCE(last_type::text, NULL),
    'last_punch_at',      COALESCE(last_at::text, NULL),
    -- Flags calculadas no banco — sem risco de fuso no frontend
    -- saida_intervalo: mín 4h exato, máx 6h30 exato
    'can_break',          has_entry AND break_out_at IS NULL AND (now_utc - entry_at) >= interval '4 hours',
    -- retorno_intervalo: mín 1h exato, máx 2h exato
    'can_return',         break_out_at IS NOT NULL AND last_type = 'saida_intervalo' AND (now_utc - break_out_at) >= interval '1 hour',
    -- saida_final: janela 7h55–8h05 (mensagem referencia 8h)
    'can_final',          has_entry AND NOT has_final AND (now_utc - entry_at) >= interval '7 hours 55 minutes',
    -- entrada: livre se não há saida_final anterior, ou se já passaram 12h
    'can_entry',          last_final_prev IS NULL OR (now_utc - last_final_prev) >= interval '12 hours',
    'entry_allowed_at',   COALESCE(TO_CHAR((last_final_prev + interval '12 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'last_final_display', COALESCE(TO_CHAR(last_final_prev AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    -- Horários de liberação formatados (fuso SP) — sempre mostram o limite exato
    'break_allowed_at',   COALESCE(TO_CHAR((entry_at + interval '4 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'break_max_at',       COALESCE(TO_CHAR((entry_at + interval '6 hours 30 minutes') AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'return_allowed_at',  COALESCE(TO_CHAR((break_out_at + interval '1 hour') AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'return_max_at',      COALESCE(TO_CHAR((break_out_at + interval '2 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    -- saida_final: exibe horário das 8h (não 7h55)
    'final_allowed_at',   COALESCE(TO_CHAR((entry_at + interval '8 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'entry_time_display', COALESCE(TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'break_time_display', COALESCE(TO_CHAR(break_out_at AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI'), NULL),
    'alerts',             alerts,
    'next_allowed',       next_allowed
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION rep_p_get_today_state() TO authenticated;

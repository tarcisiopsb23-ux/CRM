-- =============================================================================
-- Fix: next_allowed logic e bloqueio após saída final
--
-- Problemas corrigidos:
-- 1. next_allowed mostrava 'saida_final' logo após entrada (antes de 4h)
--    → Agora só mostra 'saida_final' se já passou do intervalo OU se já
--      completou 4h sem intervalo (permitindo pular intervalo após 4h)
-- 2. Garantir que has_final_exit seja retornado corretamente
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION rep_p_get_today_state()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id        UUID;
  uid           UUID;
  today         DATE;
  now_local     TIMESTAMPTZ;
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
  has_done_break BOOLEAN;
BEGIN
  uid       := auth.uid();
  org_id    := get_user_organization_id();
  today     := rep_p_today_date();
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

  has_entry     := entry_at IS NOT NULL;
  has_final     := final_out_at IS NOT NULL;
  has_done_break := break_out_at IS NOT NULL;

  -- Calcular tempo decorrido desde a entrada
  IF entry_at IS NOT NULL THEN
    elapsed_entry := now_local - entry_at;
  END IF;

  -- Alertas
  IF has_entry AND entry_at IS NOT NULL AND NOT has_done_break THEN
    IF elapsed_entry >= interval '6 hours' THEN
      alerts := alerts || ARRAY['Sua jornada contínua atingiu 6 horas. Registre o intervalo.'];
    END IF;
    IF elapsed_entry >= interval '6 hours 30 minutes' AND elapsed_entry <= interval '6 hours 35 minutes' THEN
      alerts := alerts || ARRAY['Atenção: você tem até 5 minutos para registrar o intervalo sem autorização.'];
    END IF;
    IF elapsed_entry > interval '6 hours 35 minutes' THEN
      IF rep_p_has_valid_limit_auth(uid, today, 'late_break') THEN
        alerts := alerts || ARRAY['Autorização de intervalo tardio ativa. Registre agora (expira em breve).'];
      ELSE
        alerts := alerts || ARRAY['Intervalo tardio: solicite autorização de admin/owner para registrar.'];
      END IF;
    END IF;
    IF elapsed_entry >= interval '8 hours' AND NOT has_final THEN
      alerts := alerts || ARRAY['Você atingiu 8 horas de jornada. Registre a saída ou solicite hora extra.'];
    END IF;
  END IF;

  IF break_out_at IS NOT NULL AND last_type = 'saida_intervalo' THEN
    elapsed_break := now_local - break_out_at;
    IF elapsed_break >= interval '2 hours' AND elapsed_break <= interval '2 hours 5 minutes' THEN
      alerts := alerts || ARRAY['Atenção: você tem até 5 minutos para retornar do intervalo sem autorização.'];
    END IF;
    IF elapsed_break > interval '2 hours 5 minutes' THEN
      IF rep_p_has_valid_limit_auth(uid, today, 'late_return') THEN
        alerts := alerts || ARRAY['Autorização de retorno tardio ativa. Registre agora (expira em breve).'];
      ELSE
        alerts := alerts || ARRAY['Retorno tardio: solicite autorização de admin/owner para registrar.'];
      END IF;
    END IF;
  END IF;

  -- ── next_allowed ──────────────────────────────────────────────────────────
  -- Lógica:
  --   Sem nenhuma marcação → entrada
  --   Última = entrada:
  --     - Se < 4h → só saida_intervalo (não pode sair ainda)
  --     - Se >= 4h e < 6h35 → saida_intervalo + saida_final
  --     - Se >= 6h35 (intervalo tardio) → saida_intervalo (com auth) + saida_final
  --   Última = saida_intervalo → retorno_intervalo
  --   Última = retorno_intervalo → saida_final
  --   Última = saida_final → [] (jornada encerrada)
  IF has_final THEN
    next_allowed := ARRAY[]::TEXT[];
  ELSIF last_type IS NULL THEN
    next_allowed := ARRAY['entrada'];
  ELSIF last_type = 'entrada' THEN
    -- Só libera saida_final após 4h de trabalho (mínimo para intervalo)
    IF elapsed_entry IS NOT NULL AND elapsed_entry >= interval '4 hours' THEN
      next_allowed := ARRAY['saida_intervalo', 'saida_final'];
    ELSE
      -- Antes de 4h: só pode ir para intervalo (mas o banco vai bloquear se < 4h)
      -- Mostramos saida_intervalo para o usuário saber o que vem a seguir
      next_allowed := ARRAY['saida_intervalo'];
    END IF;
  ELSIF last_type = 'saida_intervalo' THEN
    next_allowed := ARRAY['retorno_intervalo'];
  ELSIF last_type = 'retorno_intervalo' THEN
    next_allowed := ARRAY['saida_final'];
  ELSIF last_type = 'saida_final' THEN
    next_allowed := ARRAY[]::TEXT[];
  END IF;

  RETURN json_build_object(
    'today_date',      today::text,
    'now_local',       now_local::text,
    'exempt',          exempt,
    'has_entry',       has_entry,
    'has_final_exit',  has_final,
    'last_punch_type', COALESCE(last_type::text, NULL),
    'last_punch_at',   COALESCE(last_at::text, NULL),
    'alerts',          alerts,
    'next_allowed',    next_allowed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rep_p_get_today_state() TO authenticated;

COMMIT;

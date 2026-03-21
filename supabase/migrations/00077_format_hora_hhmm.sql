-- Altera formato de hora de "XXhXX" para "XX:XXh" em todas as funções de ponto
-- Afeta: rep_p_get_today_state e rep_p_register_punch

-- ─────────────────────────────────────────────────────────────────────────────
-- rep_p_get_today_state
-- ─────────────────────────────────────────────────────────────────────────────
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
  now_utc       TIMESTAMPTZ;
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

  SELECT e.occurred_at INTO last_final_prev
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND e.punch_type = 'saida_final'
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date < today
  ORDER BY e.occurred_at DESC LIMIT 1;

  IF has_entry AND entry_at IS NOT NULL THEN
    elapsed_entry := now_utc - entry_at;

    IF break_out_at IS NULL THEN
      IF elapsed_entry >= interval '4 hours' AND elapsed_entry < interval '6 hours 30 minutes' THEN
        alerts := alerts || ARRAY['Você pode registrar a saída para intervalo agora.'];
      END IF;
      IF elapsed_entry >= interval '6 hours 30 minutes' THEN
        IF rep_p_has_valid_limit_auth(uid, today, 'late_break') THEN
          alerts := alerts || ARRAY['Prazo máximo de intervalo atingido (6h30). Autorização ativa — registre agora.'];
        ELSE
          alerts := alerts || ARRAY['Prazo máximo de intervalo atingido (6h30). Solicite autorização de admin/owner.'];
        END IF;
      END IF;
    END IF;

    IF elapsed_entry >= interval '7 hours 30 minutes' AND NOT has_final THEN
      alerts := alerts || ARRAY['Sua jornada está próxima de 8 horas. Registre a saída final.'];
    END IF;
  END IF;

  IF break_out_at IS NOT NULL AND last_type = 'saida_intervalo' THEN
    elapsed_break := now_utc - break_out_at;
    IF elapsed_break >= interval '1 hour' AND elapsed_break < interval '2 hours' THEN
      alerts := alerts || ARRAY['Você pode registrar o retorno do intervalo agora.'];
    END IF;
    IF elapsed_break >= interval '2 hours' THEN
      IF rep_p_has_valid_limit_auth(uid, today, 'late_return') THEN
        alerts := alerts || ARRAY['Prazo máximo de retorno atingido (2h). Autorização ativa — registre agora.'];
      ELSE
        alerts := alerts || ARRAY['Prazo máximo de retorno atingido (2h). Solicite autorização de admin/owner.'];
      END IF;
    END IF;
  END IF;

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
    'can_break',          has_entry AND break_out_at IS NULL AND (now_utc - entry_at) >= interval '4 hours',
    'can_return',         break_out_at IS NOT NULL AND last_type = 'saida_intervalo' AND (now_utc - break_out_at) >= interval '1 hour',
    'can_final',          has_entry AND NOT has_final AND (now_utc - entry_at) >= interval '7 hours 55 minutes',
    'can_entry',          last_final_prev IS NULL OR (now_utc - last_final_prev) >= interval '12 hours',
    'entry_allowed_at',   COALESCE(TO_CHAR((last_final_prev + interval '12 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'last_final_display', COALESCE(TO_CHAR(last_final_prev AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'break_allowed_at',   COALESCE(TO_CHAR((entry_at + interval '4 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'break_max_at',       COALESCE(TO_CHAR((entry_at + interval '6 hours 30 minutes') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'return_allowed_at',  COALESCE(TO_CHAR((break_out_at + interval '1 hour') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'return_max_at',      COALESCE(TO_CHAR((break_out_at + interval '2 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'final_allowed_at',   COALESCE(TO_CHAR((entry_at + interval '8 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'entry_time_display', COALESCE(TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'break_time_display', COALESCE(TO_CHAR(break_out_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'), NULL),
    'alerts',             alerts,
    'next_allowed',       next_allowed
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION rep_p_get_today_state() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- rep_p_register_punch — apenas as mensagens de RAISE EXCEPTION são alteradas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rep_p_register_punch(
  p_type          rep_p_punch_type,
  p_device        TEXT    DEFAULT NULL,
  p_origin        rep_p_origin DEFAULT 'web',
  p_geo           JSONB   DEFAULT NULL,
  p_ack_late_break BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  org_id           UUID;
  uid              UUID;
  today            DATE;
  now_utc          TIMESTAMPTZ;
  now_local        TIMESTAMPTZ;
  last_type        rep_p_punch_type;
  last_at          TIMESTAMPTZ;
  entry_at         TIMESTAMPTZ;
  break_out_at     TIMESTAMPTZ;
  punch_id         UUID;
  ip_addr          TEXT;
  ua               TEXT;
  entry_count      INT;
  exit_count       INT;
  has_final        BOOLEAN;
  allow_reentry    BOOLEAN;
  elapsed_entry    INTERVAL;
  elapsed_break    INTERVAL;
  ot_auth_min      INT;
  last_final_at    TIMESTAMPTZ;
  any_punch_ever   BOOLEAN;
  elapsed_since_final INTERVAL;
BEGIN
  uid       := auth.uid();
  org_id    := get_user_organization_id();
  today     := rep_p_today_date();
  now_utc   := now();
  now_local := rep_p_now_local();
  ip_addr   := COALESCE(rep_p_request_ip(), NULL);
  ua        := COALESCE(rep_p_request_header('user-agent'), NULL);

  IF rep_p_user_is_exempt(uid) THEN
    RAISE EXCEPTION 'Usuário isento de registro de ponto';
  END IF;

  SELECT e.punch_type, e.occurred_at
  INTO last_type, last_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
  ORDER BY e.occurred_at DESC LIMIT 1;

  SELECT e.occurred_at INTO entry_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'entrada'
  ORDER BY e.occurred_at ASC LIMIT 1;

  SELECT e.occurred_at INTO break_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_intervalo'
  ORDER BY e.occurred_at ASC LIMIT 1;

  SELECT
    COUNT(*) FILTER (WHERE punch_type = 'entrada'),
    COUNT(*) FILTER (WHERE punch_type IN ('saida_intervalo', 'saida_final'))
  INTO entry_count, exit_count
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today;

  has_final := EXISTS (
    SELECT 1 FROM rep_p_effective_punches e
    WHERE e.organization_id = org_id
      AND e.user_id = uid
      AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
      AND e.punch_type = 'saida_final'
  );

  -- ── ENTRADA ──────────────────────────────────────────────────────────────
  IF p_type = 'entrada' THEN

    IF has_final THEN
      allow_reentry := rep_p_has_unused_reentry_authorization(uid, today);
      IF NOT allow_reentry THEN
        RAISE EXCEPTION 'Nova entrada após saída final exige autorização de admin/owner';
      END IF;

    ELSIF last_type IS NOT NULL THEN
      RAISE EXCEPTION 'Sequência inválida para entrada';

    ELSE
      SELECT e.occurred_at INTO last_final_at
      FROM rep_p_effective_punches e
      WHERE e.organization_id = org_id
        AND e.user_id = uid
        AND e.punch_type = 'saida_final'
        AND (timezone('America/Sao_Paulo', e.occurred_at))::date < today
      ORDER BY e.occurred_at DESC LIMIT 1;

      IF last_final_at IS NOT NULL THEN
        elapsed_since_final := now_utc - last_final_at;

        IF elapsed_since_final < interval '12 hours' THEN
          RAISE EXCEPTION 'Entrada autorizada a partir das % — intervalo mínimo de 12h desde a última saída (saída às %)',
            TO_CHAR((last_final_at + interval '12 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'),
            TO_CHAR(last_final_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
        END IF;

      ELSE
        SELECT EXISTS (
          SELECT 1 FROM rep_p_effective_punches e
          WHERE e.organization_id = org_id
            AND e.user_id = uid
        ) INTO any_punch_ever;
        NULL;
      END IF;
    END IF;

    INSERT INTO rep_p_punches (
      organization_id, user_id, occurred_at, punch_type,
      ip, device, user_agent, origin, geo, metadata, created_by
    ) VALUES (
      org_id, uid, now(), 'entrada',
      ip_addr, p_device, ua, p_origin, p_geo,
      jsonb_build_object('flow', 'self'), uid
    ) RETURNING id INTO punch_id;

    IF has_final THEN
      PERFORM rep_p_use_reentry_authorization(uid, today, punch_id);
    END IF;

    RETURN json_build_object('id', punch_id::text, 'type', 'entrada', 'occurred_at', now_local::text);
  END IF;

  IF last_type IS NULL THEN
    RAISE EXCEPTION 'É necessário registrar entrada antes de outras marcações';
  END IF;

  IF has_final THEN
    RAISE EXCEPTION 'Saída final já registrada. Acesso bloqueado.';
  END IF;

  -- ── SAÍDA INTERVALO ───────────────────────────────────────────────────────
  IF p_type = 'saida_intervalo' THEN
    IF last_type <> 'entrada' THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'sequencia_invalida',
        jsonb_build_object('last_type', last_type::text, 'attempt', 'saida_intervalo'));
      RAISE EXCEPTION 'Sequência inválida para saída de intervalo';
    END IF;

    IF entry_at IS NULL THEN
      RAISE EXCEPTION 'Entrada não encontrada para o dia';
    END IF;

    elapsed_entry := now_utc - entry_at;

    IF elapsed_entry < interval '4 hours' THEN
      RAISE EXCEPTION 'Saída para intervalo autorizada a partir das % (entrada às %)',
        TO_CHAR((entry_at + interval '4 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'),
        TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
    END IF;

    IF elapsed_entry > interval '6 hours 30 minutes' THEN
      IF NOT rep_p_has_valid_limit_auth(uid, today, 'late_break') THEN
        INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
        VALUES (org_id, uid, 'intervalo_tardio',
          jsonb_build_object('hours_since_entry', ROUND(EXTRACT(EPOCH FROM elapsed_entry)/3600.0, 2)));
        RAISE EXCEPTION 'Saída para intervalo encerrada às % — prazo máximo atingido (entrada às %)',
          TO_CHAR((entry_at + interval '6 hours 30 minutes') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'),
          TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
      END IF;
    END IF;

    INSERT INTO rep_p_punches (
      organization_id, user_id, occurred_at, punch_type,
      ip, device, user_agent, origin, geo, metadata, created_by
    ) VALUES (
      org_id, uid, now(), 'saida_intervalo',
      ip_addr, p_device, ua, p_origin, p_geo,
      jsonb_build_object('flow', 'self'), uid
    ) RETURNING id INTO punch_id;

    IF elapsed_entry > interval '6 hours 30 minutes' THEN
      PERFORM rep_p_use_limit_auth(uid, today, 'late_break', punch_id);
    END IF;

    RETURN json_build_object('id', punch_id::text, 'type', 'saida_intervalo', 'occurred_at', now_local::text);
  END IF;

  -- ── RETORNO INTERVALO ─────────────────────────────────────────────────────
  IF p_type = 'retorno_intervalo' THEN
    IF last_type <> 'saida_intervalo' THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'sequencia_invalida',
        jsonb_build_object('last_type', last_type::text, 'attempt', 'retorno_intervalo'));
      RAISE EXCEPTION 'Sequência inválida para retorno do intervalo';
    END IF;

    IF break_out_at IS NULL THEN
      RAISE EXCEPTION 'Saída para intervalo não encontrada';
    END IF;

    elapsed_break := now_utc - break_out_at;

    IF elapsed_break < interval '1 hour' THEN
      RAISE EXCEPTION 'Retorno autorizado a partir das % (saída às %)',
        TO_CHAR((break_out_at + interval '1 hour') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'),
        TO_CHAR(break_out_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
    END IF;

    IF elapsed_break > interval '2 hours' THEN
      IF NOT rep_p_has_valid_limit_auth(uid, today, 'late_return') THEN
        RAISE EXCEPTION 'Retorno encerrado às % — prazo máximo atingido (saída às %)',
          TO_CHAR((break_out_at + interval '2 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'),
          TO_CHAR(break_out_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
      END IF;
    END IF;

    INSERT INTO rep_p_punches (
      organization_id, user_id, occurred_at, punch_type,
      ip, device, user_agent, origin, geo, metadata, created_by
    ) VALUES (
      org_id, uid, now(), 'retorno_intervalo',
      ip_addr, p_device, ua, p_origin, p_geo,
      jsonb_build_object('flow', 'self'), uid
    ) RETURNING id INTO punch_id;

    IF elapsed_break > interval '2 hours' THEN
      PERFORM rep_p_use_limit_auth(uid, today, 'late_return', punch_id);
    END IF;

    RETURN json_build_object('id', punch_id::text, 'type', 'retorno_intervalo', 'occurred_at', now_local::text);
  END IF;

  -- ── SAÍDA FINAL ───────────────────────────────────────────────────────────
  IF p_type = 'saida_final' THEN
    IF last_type NOT IN ('entrada', 'retorno_intervalo') THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'sequencia_invalida',
        jsonb_build_object('last_type', last_type::text, 'attempt', 'saida_final'));
      RAISE EXCEPTION 'Sequência inválida para saída final';
    END IF;

    IF entry_at IS NOT NULL THEN
      elapsed_entry := now_utc - entry_at;

      IF elapsed_entry < interval '7 hours 55 minutes' THEN
        RAISE EXCEPTION 'Saída final autorizada a partir das % — prazo de 8 horas (entrada às %)',
          TO_CHAR((entry_at + interval '8 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"'),
          TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
      END IF;

      IF elapsed_entry > interval '8 hours 5 minutes' THEN
        SELECT authorized_minutes INTO ot_auth_min
        FROM rep_p_overtime_authorizations
        WHERE organization_id = org_id
          AND user_id = uid
          AND work_date = today
          AND status = 'aprovado'
        LIMIT 1;

        IF ot_auth_min IS NULL THEN
          INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
          VALUES (org_id, uid, 'jornada_diaria_acima_8h',
            jsonb_build_object('hours_since_entry', ROUND(EXTRACT(EPOCH FROM elapsed_entry)/3600.0, 2)));
          RAISE EXCEPTION 'Saída após 8 horas requer autorização de hora extra de admin/owner (entrada às %)',
            TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24":"MI"h"');
        END IF;

        IF elapsed_entry > (interval '8 hours' + (ot_auth_min || ' minutes')::interval + interval '5 minutes') THEN
          RAISE EXCEPTION 'Jornada excede o limite de hora extra autorizado (% min)', ot_auth_min;
        END IF;
      END IF;
    END IF;

    INSERT INTO rep_p_punches (
      organization_id, user_id, occurred_at, punch_type,
      ip, device, user_agent, origin, geo, metadata, created_by
    ) VALUES (
      org_id, uid, now(), 'saida_final',
      ip_addr, p_device, ua, p_origin, p_geo,
      jsonb_build_object('flow', 'self'), uid
    ) RETURNING id INTO punch_id;

    RETURN json_build_object('id', punch_id::text, 'type', 'saida_final', 'occurred_at', now_local::text);
  END IF;

  RAISE EXCEPTION 'Tipo de marcação inválido: %', p_type;
END;
$func$;

GRANT EXECUTE ON FUNCTION rep_p_register_punch(rep_p_punch_type, TEXT, rep_p_origin, JSONB, BOOLEAN) TO authenticated;

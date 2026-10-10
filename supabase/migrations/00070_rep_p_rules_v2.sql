-- =============================================================================
-- REP-P Rules v2: Regras de negócio atualizadas
--
-- 1. Admin/owner são isentos — mensagem específica ao tentar registrar
-- 2. Acesso bloqueado sem entrada registrada (já existia no TimeclockGuard)
-- 3. Saída intervalo: mín 4h, máx 6h30 (com tolerância 5min = 6h35)
--    Após 6h35 exige autorização de admin/owner
-- 4. Retorno intervalo: mín 1h, máx 2h (com tolerância 5min = 2h05)
--    Após 2h05 exige autorização de admin/owner
-- 5. Saída final: máx 8h total (com tolerância 5min = 8h05)
--    Após 8h05 exige autorização de hora extra com quantidade de horas
-- 6. Hora extra: admin/owner autoriza informando quantidade de horas
-- 7. Após autorização, usuário tem 5 minutos para registrar
-- 8. Tolerância de 5 minutos em todos os limites de saída/entrada
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Adicionar coluna authorized_minutes em rep_p_overtime_authorizations
--    para que admin informe quantas horas extras foram autorizadas
-- -----------------------------------------------------------------------------
ALTER TABLE rep_p_overtime_authorizations
  ADD COLUMN IF NOT EXISTS authorized_minutes INT;

-- -----------------------------------------------------------------------------
-- 2. Tabela de autorizações de limite (intervalo tardio, retorno tardio, etc.)
--    Usada quando usuário precisa de liberação para registrar fora do horário
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rep_p_limit_authorizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  for_date        DATE NOT NULL,
  auth_type       TEXT NOT NULL, -- 'late_break', 'late_return', 'overtime'
  justification   TEXT NOT NULL,
  authorized_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  authorized_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL, -- 5 minutos após authorized_at
  used_at         TIMESTAMPTZ,
  used_by_punch_id UUID REFERENCES rep_p_punches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rep_p_limit_auth_user_date
  ON rep_p_limit_authorizations (organization_id, user_id, for_date, auth_type);

ALTER TABLE rep_p_limit_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rep_p_limit_auth_select ON rep_p_limit_authorizations;
CREATE POLICY rep_p_limit_auth_select ON rep_p_limit_authorizations FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_id = auth.uid()
      OR user_has_role(ARRAY['owner', 'admin']::user_role[])
    )
  );

-- -----------------------------------------------------------------------------
-- 3. RPC: admin autoriza limite (intervalo tardio, retorno tardio, hora extra)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_admin_authorize_limit(
  p_user_id     UUID,
  p_for_date    DATE,
  p_auth_type   TEXT,  -- 'late_break' | 'late_return' | 'overtime'
  p_justification TEXT,
  p_authorized_minutes INT DEFAULT NULL  -- obrigatório para 'overtime'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  new_id UUID;
BEGIN
  org_id := get_user_organization_id();

  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para autorizar limites de ponto';
  END IF;

  IF p_justification IS NULL OR length(trim(p_justification)) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória (mínimo 5 caracteres)';
  END IF;

  IF p_auth_type = 'overtime' AND (p_authorized_minutes IS NULL OR p_authorized_minutes <= 0) THEN
    RAISE EXCEPTION 'Para hora extra, informe a quantidade de minutos autorizados';
  END IF;

  IF p_auth_type NOT IN ('late_break', 'late_return', 'overtime') THEN
    RAISE EXCEPTION 'Tipo de autorização inválido';
  END IF;

  INSERT INTO rep_p_limit_authorizations (
    organization_id, user_id, for_date, auth_type,
    justification, authorized_by, expires_at
  )
  VALUES (
    org_id, p_user_id, p_for_date, p_auth_type,
    p_justification, auth.uid(),
    now() + interval '5 minutes'
  )
  RETURNING id INTO new_id;

  -- Para hora extra, também registra em rep_p_overtime_authorizations
  IF p_auth_type = 'overtime' THEN
    INSERT INTO rep_p_overtime_authorizations (
      organization_id, user_id, work_date,
      minutes_requested, authorized_minutes,
      justification, status, authorized_at, authorized_by, updated_at
    )
    VALUES (
      org_id, p_user_id, p_for_date,
      p_authorized_minutes, p_authorized_minutes,
      p_justification, 'aprovado', now(), auth.uid(), now()
    )
    ON CONFLICT (user_id, work_date) DO UPDATE SET
      authorized_minutes = EXCLUDED.authorized_minutes,
      justification      = EXCLUDED.justification,
      status             = 'aprovado',
      authorized_at      = now(),
      authorized_by      = EXCLUDED.authorized_by,
      updated_at         = now();
  END IF;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rep_p_admin_authorize_limit(UUID, DATE, TEXT, TEXT, INT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Helper: verifica se há autorização de limite válida (não expirada, não usada)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_has_valid_limit_auth(
  p_user_id   UUID,
  p_date      DATE,
  p_auth_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rep_p_limit_authorizations a
    WHERE a.organization_id = get_user_organization_id()
      AND a.user_id   = p_user_id
      AND a.for_date  = p_date
      AND a.auth_type = p_auth_type
      AND a.used_at   IS NULL
      AND a.expires_at > now()
  )
$$;

-- -----------------------------------------------------------------------------
-- 5. Helper: marca autorização de limite como usada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_use_limit_auth(
  p_user_id    UUID,
  p_date       DATE,
  p_auth_type  TEXT,
  p_punch_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rep_p_limit_authorizations
  SET used_at = now(), used_by_punch_id = p_punch_id
  WHERE id = (
    SELECT id FROM rep_p_limit_authorizations
    WHERE organization_id = get_user_organization_id()
      AND user_id   = p_user_id
      AND for_date  = p_date
      AND auth_type = p_auth_type
      AND used_at   IS NULL
      AND expires_at > now()
    ORDER BY authorized_at DESC
    LIMIT 1
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Recriar rep_p_register_punch com todas as novas regras
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_register_punch(
  p_type          rep_p_punch_type,
  p_device        TEXT    DEFAULT NULL,
  p_origin        rep_p_origin DEFAULT 'web',
  p_geo           JSONB   DEFAULT NULL,
  p_ack_late_break BOOLEAN DEFAULT FALSE  -- mantido por compatibilidade, ignorado
)
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
  last_type     rep_p_punch_type;
  last_at       TIMESTAMPTZ;
  entry_at      TIMESTAMPTZ;
  break_out_at  TIMESTAMPTZ;
  punch_id      UUID;
  ip_addr       TEXT;
  ua            TEXT;
  entry_count   INT;
  exit_count    INT;
  has_final     BOOLEAN;
  allow_reentry BOOLEAN;
  elapsed_entry INTERVAL;
  elapsed_break INTERVAL;
  ot_auth_min   INT;
BEGIN
  uid       := auth.uid();
  org_id    := get_user_organization_id();
  today     := rep_p_today_date();
  now_local := rep_p_now_local();
  ip_addr   := COALESCE(rep_p_request_ip(), NULL);
  ua        := COALESCE(rep_p_request_header('user-agent'), NULL);

  -- Regra 1: admin/owner são isentos — não registram ponto
  IF rep_p_user_is_exempt(uid) THEN
    RAISE EXCEPTION 'Usuário isento de registro de ponto';
  END IF;

  -- Buscar última marcação do dia
  SELECT e.punch_type, e.occurred_at
  INTO last_type, last_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  -- Buscar entrada do dia
  SELECT e.occurred_at INTO entry_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'entrada'
  ORDER BY e.occurred_at ASC
  LIMIT 1;

  -- Buscar saída para intervalo
  SELECT e.occurred_at INTO break_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_intervalo'
  ORDER BY e.occurred_at ASC
  LIMIT 1;

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
      -- Reentrada após saída final: exige autorização
      allow_reentry := rep_p_has_unused_reentry_authorization(uid, today);
      IF NOT allow_reentry THEN
        RAISE EXCEPTION 'Nova entrada após saída final exige autorização de admin/owner';
      END IF;
    ELSIF last_type IS NOT NULL THEN
      RAISE EXCEPTION 'Sequência inválida para entrada';
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

  -- Validações comuns para qualquer marcação após entrada
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

    elapsed_entry := now_local - entry_at;

    -- Mínimo 4h (sem tolerância — é um mínimo, não um máximo)
    IF elapsed_entry < interval '4 hours' THEN
      RAISE EXCEPTION 'Intervalo só é permitido a partir das % (entrada às %)',
        TO_CHAR((entry_at + interval '4 hours') AT TIME ZONE 'America/Sao_Paulo', 'HH24h"'"'MI'),
        TO_CHAR(entry_at AT TIME ZONE 'America/Sao_Paulo', 'HH24h"'"'MI');
    END IF;

    -- Máximo 6h30 + tolerância 5min = 6h35
    IF elapsed_entry > interval '6 hours 35 minutes' THEN
      -- Verifica autorização de admin
      IF NOT rep_p_has_valid_limit_auth(uid, today, 'late_break') THEN
        INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
        VALUES (org_id, uid, 'intervalo_tardio',
          jsonb_build_object('hours_since_entry', ROUND(EXTRACT(EPOCH FROM elapsed_entry)/3600.0, 2)));
        RAISE EXCEPTION 'Saída para intervalo após 6h30 requer autorização de admin/owner';
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

    -- Marcar autorização como usada se foi necessária
    IF elapsed_entry > interval '6 hours 35 minutes' THEN
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

    elapsed_break := now_local - break_out_at;

    -- Mínimo 1h
    IF elapsed_break < interval '1 hour' THEN
      RAISE EXCEPTION 'Retorno só é permitido a partir das % (saída às %)',
        TO_CHAR((break_out_at + interval '1 hour') AT TIME ZONE 'America/Sao_Paulo', 'HH24h"'"'MI'),
        TO_CHAR(break_out_at AT TIME ZONE 'America/Sao_Paulo', 'HH24h"'"'MI');
    END IF;

    -- Máximo 2h + tolerância 5min = 2h05
    IF elapsed_break > interval '2 hours 5 minutes' THEN
      IF NOT rep_p_has_valid_limit_auth(uid, today, 'late_return') THEN
        RAISE EXCEPTION 'Retorno após 2 horas de intervalo requer autorização de admin/owner';
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

    IF elapsed_break > interval '2 hours 5 minutes' THEN
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
      elapsed_entry := now_local - entry_at;

      -- Máximo 8h + tolerância 5min = 8h05
      IF elapsed_entry > interval '8 hours 5 minutes' THEN
        -- Verifica autorização de hora extra
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
          RAISE EXCEPTION 'Saída após 8 horas requer autorização de hora extra de admin/owner';
        END IF;

        -- Verifica se não ultrapassou o limite autorizado (8h + minutos autorizados + 5min tolerância)
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
$$;

-- -----------------------------------------------------------------------------
-- 7. Atualizar rep_p_get_today_state para retornar info de isenção e alertas
--    com as novas regras de tolerância
-- -----------------------------------------------------------------------------
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

  has_entry := entry_at IS NOT NULL;
  has_final := final_out_at IS NOT NULL;

  -- Alertas baseados nas novas regras
  IF has_entry AND entry_at IS NOT NULL THEN
    elapsed_entry := now_local - entry_at;

    IF break_out_at IS NULL THEN
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
    'today_date',     today::text,
    'now_local',      now_local::text,
    'exempt',         exempt,
    'has_entry',      has_entry,
    'has_final_exit', has_final,
    'last_punch_type', COALESCE(last_type::text, NULL),
    'last_punch_at',  COALESCE(last_at::text, NULL),
    'alerts',         alerts,
    'next_allowed',   next_allowed
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION rep_p_admin_authorize_limit(UUID, DATE, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_has_valid_limit_auth(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_register_punch(rep_p_punch_type, TEXT, rep_p_origin, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_get_today_state() TO authenticated;

COMMIT;

-- =============================================================================
-- REP-P (Portaria MTP 671/2021) - Controle de Ponto por Programa
-- Imutabilidade: marcações não são alteradas/excluídas; ajustes são eventos separados.
-- Integridade: hash encadeado (prev_hash -> integrity_hash) em marcações e ações administrativas.
-- =============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rep_p_punch_type') THEN
    CREATE TYPE rep_p_punch_type AS ENUM ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida_final');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rep_p_origin') THEN
    CREATE TYPE rep_p_origin AS ENUM ('web', 'mobile');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rep_p_admin_action_type') THEN
    CREATE TYPE rep_p_admin_action_type AS ENUM ('criar', 'corrigir', 'anular', 'autorizar_nova_entrada');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rep_p_inconsistency_type') THEN
    CREATE TYPE rep_p_inconsistency_type AS ENUM (
      'intervalo_tardio',
      'jornada_continua_acima_6h',
      'jornada_diaria_acima_8h',
      'sequencia_invalida',
      'excedeu_limite_diario'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Helpers (data/hora local e extração de IP/UA)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_now_local()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT timezone('America/Sao_Paulo', now())
$$;

CREATE OR REPLACE FUNCTION rep_p_today_date()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('America/Sao_Paulo', now()))::date
$$;

CREATE OR REPLACE FUNCTION rep_p_request_header(header_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.headers', true)::json ->> lower(header_name)),
    (current_setting('request.headers', true)::json ->> header_name)
  )
$$;

CREATE OR REPLACE FUNCTION rep_p_request_ip()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(split_part(COALESCE(rep_p_request_header('x-forwarded-for'), ''), ',', 1), '')
$$;

CREATE OR REPLACE FUNCTION rep_p_user_is_exempt(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = p_user_id
      AND (
        p.role IN ('owner', 'admin', 'manager')
        OR UPPER(COALESCE(p.metadata->>'job_title', p.metadata->>'cargo', '')) IN ('OWNER', 'CEO', 'CFO', 'COO', 'CMO', 'GERENTE', 'GERENTES')
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- Tabelas (imutáveis)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rep_p_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  punch_type rep_p_punch_type NOT NULL,
  ip TEXT,
  device TEXT,
  user_agent TEXT,
  origin rep_p_origin NOT NULL DEFAULT 'web',
  geo JSONB,
  metadata JSONB,
  prev_hash TEXT,
  integrity_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rep_p_punches_org_user_time ON rep_p_punches (organization_id, user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rep_p_punches_org_time ON rep_p_punches (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rep_p_punches_user_time ON rep_p_punches (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS rep_p_admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  punch_id UUID REFERENCES rep_p_punches(id) ON DELETE SET NULL,
  action_type rep_p_admin_action_type NOT NULL,
  old_values JSONB,
  new_values JSONB,
  justification TEXT NOT NULL,
  action_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prev_hash TEXT,
  integrity_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rep_p_admin_actions_org_time ON rep_p_admin_actions (organization_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_rep_p_admin_actions_punch ON rep_p_admin_actions (punch_id, action_at DESC);

CREATE TABLE IF NOT EXISTS rep_p_reentry_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  for_date DATE NOT NULL,
  justification TEXT NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  used_by_punch_id UUID REFERENCES rep_p_punches(id) ON DELETE SET NULL,
  prev_hash TEXT,
  integrity_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rep_p_reentry_org_user_date ON rep_p_reentry_authorizations (organization_id, user_id, for_date DESC);

CREATE TABLE IF NOT EXISTS rep_p_inconsistencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  punch_id UUID REFERENCES rep_p_punches(id) ON DELETE SET NULL,
  type rep_p_inconsistency_type NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rep_p_inconsistencies_org_time ON rep_p_inconsistencies (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rep_p_inconsistencies_user_time ON rep_p_inconsistencies (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Hash encadeado (integridade)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_hash_record(payload TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(payload, 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION rep_p_set_punch_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev TEXT;
  payload TEXT;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  SELECT p.integrity_hash INTO prev
  FROM rep_p_punches p
  WHERE p.organization_id = NEW.organization_id
    AND p.user_id = NEW.user_id
  ORDER BY p.created_at DESC
  LIMIT 1;

  NEW.prev_hash := prev;

  payload :=
    COALESCE(NEW.id::text, '') || '|' ||
    COALESCE(NEW.organization_id::text, '') || '|' ||
    COALESCE(NEW.user_id::text, '') || '|' ||
    COALESCE(NEW.occurred_at::text, '') || '|' ||
    COALESCE(NEW.punch_type::text, '') || '|' ||
    COALESCE(NEW.ip, '') || '|' ||
    COALESCE(NEW.device, '') || '|' ||
    COALESCE(NEW.user_agent, '') || '|' ||
    COALESCE(NEW.origin::text, '') || '|' ||
    COALESCE(NEW.geo::text, '') || '|' ||
    COALESCE(NEW.metadata::text, '') || '|' ||
    COALESCE(NEW.prev_hash, '');

  NEW.integrity_hash := rep_p_hash_record(payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rep_p_set_punch_hash ON rep_p_punches;
CREATE TRIGGER trg_rep_p_set_punch_hash
  BEFORE INSERT ON rep_p_punches
  FOR EACH ROW EXECUTE FUNCTION rep_p_set_punch_hash();

CREATE OR REPLACE FUNCTION rep_p_set_action_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev TEXT;
  payload TEXT;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  SELECT a.integrity_hash INTO prev
  FROM rep_p_admin_actions a
  WHERE a.organization_id = NEW.organization_id
  ORDER BY a.action_at DESC
  LIMIT 1;

  NEW.prev_hash := prev;

  payload :=
    COALESCE(NEW.id::text, '') || '|' ||
    COALESCE(NEW.organization_id::text, '') || '|' ||
    COALESCE(NEW.punch_id::text, '') || '|' ||
    COALESCE(NEW.action_type::text, '') || '|' ||
    COALESCE(NEW.old_values::text, '') || '|' ||
    COALESCE(NEW.new_values::text, '') || '|' ||
    COALESCE(NEW.justification, '') || '|' ||
    COALESCE(NEW.action_at::text, '') || '|' ||
    COALESCE(NEW.action_by::text, '') || '|' ||
    COALESCE(NEW.prev_hash, '');

  NEW.integrity_hash := rep_p_hash_record(payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rep_p_set_action_hash ON rep_p_admin_actions;
CREATE TRIGGER trg_rep_p_set_action_hash
  BEFORE INSERT ON rep_p_admin_actions
  FOR EACH ROW EXECUTE FUNCTION rep_p_set_action_hash();

CREATE OR REPLACE FUNCTION rep_p_set_reentry_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev TEXT;
  payload TEXT;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  SELECT r.integrity_hash INTO prev
  FROM rep_p_reentry_authorizations r
  WHERE r.organization_id = NEW.organization_id
  ORDER BY r.authorized_at DESC
  LIMIT 1;

  NEW.prev_hash := prev;

  payload :=
    COALESCE(NEW.id::text, '') || '|' ||
    COALESCE(NEW.organization_id::text, '') || '|' ||
    COALESCE(NEW.user_id::text, '') || '|' ||
    COALESCE(NEW.for_date::text, '') || '|' ||
    COALESCE(NEW.justification, '') || '|' ||
    COALESCE(NEW.authorized_at::text, '') || '|' ||
    COALESCE(NEW.authorized_by::text, '') || '|' ||
    COALESCE(NEW.used_at::text, '') || '|' ||
    COALESCE(NEW.used_by_punch_id::text, '') || '|' ||
    COALESCE(NEW.prev_hash, '');

  NEW.integrity_hash := rep_p_hash_record(payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rep_p_set_reentry_hash ON rep_p_reentry_authorizations;
CREATE TRIGGER trg_rep_p_set_reentry_hash
  BEFORE INSERT ON rep_p_reentry_authorizations
  FOR EACH ROW EXECUTE FUNCTION rep_p_set_reentry_hash();

-- -----------------------------------------------------------------------------
-- Views para UI (status e histórico por registro)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW rep_p_punches_with_status AS
WITH last_action AS (
  SELECT DISTINCT ON (a.punch_id)
    a.punch_id,
    a.action_type,
    a.justification,
    a.action_at,
    a.action_by,
    a.old_values,
    a.new_values
  FROM rep_p_admin_actions a
  WHERE a.punch_id IS NOT NULL
  ORDER BY a.punch_id, a.action_at DESC
)
SELECT
  p.id,
  p.organization_id,
  p.user_id,
  p.occurred_at,
  p.punch_type,
  p.ip,
  p.device,
  p.user_agent,
  p.origin,
  p.geo,
  p.metadata,
  p.prev_hash,
  p.integrity_hash,
  p.created_at,
  p.created_by,
  CASE
    WHEN la.action_type = 'anular' THEN 'anulado'
    WHEN la.action_type = 'corrigir' THEN 'corrigido'
    ELSE 'ativo'
  END AS status,
  la.action_at AS alterado_em,
  la.justification AS justificativa,
  la.action_by AS alterado_por,
  la.action_type AS tipo_alteracao,
  la.old_values AS valores_anteriores,
  la.new_values AS valores_novos
FROM rep_p_punches p
LEFT JOIN last_action la ON la.punch_id = p.id;

CREATE OR REPLACE VIEW rep_p_effective_punches AS
SELECT *
FROM rep_p_punches_with_status
WHERE status = 'ativo';

CREATE OR REPLACE VIEW rep_p_daily_report AS
WITH punches AS (
  SELECT
    organization_id,
    user_id,
    (timezone('America/Sao_Paulo', occurred_at))::date AS work_date,
    punch_type,
    occurred_at
  FROM rep_p_effective_punches
),
agg AS (
  SELECT
    organization_id,
    user_id,
    work_date,
    MIN(occurred_at) FILTER (WHERE punch_type = 'entrada') AS entrada_at,
    MIN(occurred_at) FILTER (WHERE punch_type = 'saida_intervalo') AS saida_intervalo_at,
    MIN(occurred_at) FILTER (WHERE punch_type = 'retorno_intervalo') AS retorno_intervalo_at,
    MAX(occurred_at) FILTER (WHERE punch_type = 'saida_final') AS saida_final_at
  FROM punches
  GROUP BY organization_id, user_id, work_date
),
calc AS (
  SELECT
    a.*,
    CASE
      WHEN a.entrada_at IS NULL THEN 0
      WHEN a.saida_intervalo_at IS NOT NULL AND a.retorno_intervalo_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (COALESCE(a.saida_final_at, now()) - a.entrada_at))
        - EXTRACT(EPOCH FROM (a.retorno_intervalo_at - a.saida_intervalo_at))
      WHEN a.saida_intervalo_at IS NOT NULL AND a.retorno_intervalo_at IS NULL THEN
        EXTRACT(EPOCH FROM (a.saida_intervalo_at - a.entrada_at))
      ELSE
        EXTRACT(EPOCH FROM (COALESCE(a.saida_final_at, now()) - a.entrada_at))
    END AS work_seconds,
    CASE
      WHEN a.saida_intervalo_at IS NOT NULL AND a.retorno_intervalo_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (a.retorno_intervalo_at - a.saida_intervalo_at))
      ELSE 0
    END AS break_seconds
  FROM agg a
)
SELECT
  c.organization_id,
  c.user_id,
  c.work_date,
  c.entrada_at,
  c.saida_intervalo_at,
  c.retorno_intervalo_at,
  c.saida_final_at,
  ROUND((c.work_seconds / 3600.0)::numeric, 2) AS worked_hours,
  ROUND((c.break_seconds / 60.0)::numeric, 0) AS break_minutes,
  COALESCE((
    SELECT COUNT(*)
    FROM rep_p_inconsistencies i
    WHERE i.organization_id = c.organization_id
      AND i.user_id = c.user_id
      AND (timezone('America/Sao_Paulo', i.created_at))::date = c.work_date
  ), 0) AS inconsistencies_count,
  CASE
    WHEN c.entrada_at IS NULL THEN 'sem_entrada'
    WHEN c.saida_final_at IS NULL AND c.work_date < rep_p_today_date() THEN 'incompleto'
    WHEN c.saida_final_at IS NULL THEN 'em_andamento'
    ELSE 'fechado'
  END AS day_status
FROM calc c;

CREATE OR REPLACE VIEW rep_p_monthly_report AS
SELECT
  organization_id,
  user_id,
  date_trunc('month', work_date)::date AS month_ref,
  COUNT(*) AS days_count,
  ROUND(SUM(worked_hours)::numeric, 2) AS total_worked_hours,
  SUM(inconsistencies_count) AS inconsistencies_count
FROM rep_p_daily_report
GROUP BY organization_id, user_id, date_trunc('month', work_date)::date;

CREATE OR REPLACE VIEW rep_p_inconsistencies_report AS
SELECT
  i.id,
  i.organization_id,
  i.user_id,
  p.full_name AS user_name,
  i.punch_id,
  i.type,
  i.details,
  i.created_at
FROM rep_p_inconsistencies i
LEFT JOIN profiles p ON p.id = i.user_id;

CREATE OR REPLACE VIEW rep_p_admin_changes_report AS
SELECT
  a.id,
  a.organization_id,
  a.action_type,
  a.punch_id,
  pr.full_name AS action_by_name,
  a.action_by,
  a.action_at,
  a.justification,
  a.old_values,
  a.new_values,
  a.integrity_hash,
  pu.full_name AS target_user_name,
  p.user_id AS target_user_id,
  p.occurred_at AS punch_occurred_at,
  p.punch_type AS punch_type
FROM rep_p_admin_actions a
LEFT JOIN profiles pr ON pr.id = a.action_by
LEFT JOIN rep_p_punches p ON p.id = a.punch_id
LEFT JOIN profiles pu ON pu.id = p.user_id;

-- -----------------------------------------------------------------------------
-- Auditoria automática (usa audit_changes() existente)
-- -----------------------------------------------------------------------------
ALTER TABLE rep_p_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_p_admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_p_reentry_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_p_inconsistencies ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS audit_rep_p_punches ON rep_p_punches;
CREATE TRIGGER audit_rep_p_punches
  AFTER INSERT OR UPDATE OR DELETE ON rep_p_punches
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_rep_p_admin_actions ON rep_p_admin_actions;
CREATE TRIGGER audit_rep_p_admin_actions
  AFTER INSERT OR UPDATE OR DELETE ON rep_p_admin_actions
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_rep_p_reentry_authorizations ON rep_p_reentry_authorizations;
CREATE TRIGGER audit_rep_p_reentry_authorizations
  AFTER INSERT OR UPDATE OR DELETE ON rep_p_reentry_authorizations
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

DROP TRIGGER IF EXISTS audit_rep_p_inconsistencies ON rep_p_inconsistencies;
CREATE TRIGGER audit_rep_p_inconsistencies
  AFTER INSERT OR UPDATE OR DELETE ON rep_p_inconsistencies
  FOR EACH ROW EXECUTE FUNCTION audit_changes();

-- -----------------------------------------------------------------------------
-- RLS (somente leitura; escrita via RPC SECURITY DEFINER)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rep_p_punches_select ON rep_p_punches;
CREATE POLICY rep_p_punches_select ON rep_p_punches FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_id = auth.uid()
      OR user_has_role(ARRAY['owner', 'admin']::user_role[])
    )
  );

DROP POLICY IF EXISTS rep_p_admin_actions_select ON rep_p_admin_actions;
CREATE POLICY rep_p_admin_actions_select ON rep_p_admin_actions FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_has_role(ARRAY['owner', 'admin']::user_role[])
      OR EXISTS (
        SELECT 1
        FROM rep_p_punches p
        WHERE p.id = rep_p_admin_actions.punch_id
          AND p.user_id = auth.uid()
          AND p.organization_id = get_user_organization_id()
      )
    )
  );

DROP POLICY IF EXISTS rep_p_reentry_authorizations_select ON rep_p_reentry_authorizations;
CREATE POLICY rep_p_reentry_authorizations_select ON rep_p_reentry_authorizations FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_has_role(ARRAY['owner', 'admin']::user_role[])
      OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS rep_p_inconsistencies_select ON rep_p_inconsistencies;
CREATE POLICY rep_p_inconsistencies_select ON rep_p_inconsistencies FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_has_role(ARRAY['owner', 'admin']::user_role[])
      OR user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RPC: estado do dia e registro de marcações (com validações)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_get_today_state()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  uid UUID;
  today DATE;
  now_local TIMESTAMPTZ;
  exempt BOOLEAN;
  last_type rep_p_punch_type;
  last_at TIMESTAMPTZ;
  entry_at TIMESTAMPTZ;
  break_out_at TIMESTAMPTZ;
  final_out_at TIMESTAMPTZ;
  has_entry BOOLEAN;
  has_final BOOLEAN;
  alerts TEXT[] := ARRAY[]::TEXT[];
  next_allowed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  uid := auth.uid();
  org_id := get_user_organization_id();
  today := rep_p_today_date();
  now_local := rep_p_now_local();
  exempt := rep_p_user_is_exempt(uid);

  SELECT e.punch_type, e.occurred_at
  INTO last_type, last_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  SELECT e.occurred_at
  INTO entry_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'entrada'
  ORDER BY e.occurred_at ASC
  LIMIT 1;

  SELECT e.occurred_at
  INTO break_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_intervalo'
  ORDER BY e.occurred_at ASC
  LIMIT 1;

  SELECT e.occurred_at
  INTO final_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_final'
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  has_entry := entry_at IS NOT NULL;
  has_final := final_out_at IS NOT NULL;

  IF has_entry AND break_out_at IS NULL THEN
    IF now_local - entry_at >= interval '6 hours' THEN
      alerts := alerts || ARRAY['Sua jornada contínua atingiu 6 horas. É necessário realizar intervalo.'];
    END IF;
  END IF;

  IF has_entry THEN
    IF now_local - entry_at >= interval '8 hours' THEN
      alerts := alerts || ARRAY['Você atingiu 8 horas de jornada diária.'];
    END IF;
  END IF;

  IF has_final THEN
    next_allowed := ARRAY[]::TEXT[];
  ELSE
    IF last_type IS NULL THEN
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
  END IF;

  RETURN json_build_object(
    'today_date', today::text,
    'now_local', now_local::text,
    'exempt', exempt,
    'has_entry', has_entry,
    'has_final_exit', has_final,
    'last_punch_type', COALESCE(last_type::text, NULL),
    'last_punch_at', COALESCE(last_at::text, NULL),
    'alerts', alerts,
    'next_allowed', next_allowed
  );
END;
$$;

CREATE OR REPLACE FUNCTION rep_p_has_unused_reentry_authorization(p_user_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rep_p_reentry_authorizations a
    WHERE a.organization_id = get_user_organization_id()
      AND a.user_id = p_user_id
      AND a.for_date = p_date
      AND a.used_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION rep_p_use_reentry_authorization(p_user_id UUID, p_date DATE, p_punch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE rep_p_reentry_authorizations a
  SET used_at = now(),
      used_by_punch_id = p_punch_id
  WHERE a.id = (
    SELECT x.id
    FROM rep_p_reentry_authorizations x
    WHERE x.organization_id = get_user_organization_id()
      AND x.user_id = p_user_id
      AND x.for_date = p_date
      AND x.used_at IS NULL
    ORDER BY x.authorized_at DESC
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION rep_p_register_punch(
  p_type rep_p_punch_type,
  p_device TEXT DEFAULT NULL,
  p_origin rep_p_origin DEFAULT 'web',
  p_geo JSONB DEFAULT NULL,
  p_ack_late_break BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  uid UUID;
  today DATE;
  now_local TIMESTAMPTZ;
  last_type rep_p_punch_type;
  last_at TIMESTAMPTZ;
  entry_at TIMESTAMPTZ;
  break_out_at TIMESTAMPTZ;
  punch_id UUID;
  ip_addr TEXT;
  ua TEXT;
  entry_count INT;
  exit_count INT;
  has_final BOOLEAN;
  allow_reentry BOOLEAN;
BEGIN
  uid := auth.uid();
  org_id := get_user_organization_id();
  today := rep_p_today_date();
  now_local := rep_p_now_local();

  ip_addr := COALESCE(rep_p_request_ip(), NULL);
  ua := COALESCE(rep_p_request_header('user-agent'), NULL);

  SELECT e.punch_type, e.occurred_at
  INTO last_type, last_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  SELECT e.occurred_at
  INTO entry_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'entrada'
  ORDER BY e.occurred_at ASC
  LIMIT 1;

  SELECT e.occurred_at
  INTO break_out_at
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
    AND e.punch_type = 'saida_intervalo'
  ORDER BY e.occurred_at ASC
  LIMIT 1;

  SELECT COUNT(*) FILTER (WHERE punch_type = 'entrada'),
         COUNT(*) FILTER (WHERE punch_type IN ('saida_intervalo', 'saida_final'))
  INTO entry_count, exit_count
  FROM rep_p_effective_punches e
  WHERE e.organization_id = org_id
    AND e.user_id = uid
    AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today;

  has_final := EXISTS (
    SELECT 1
    FROM rep_p_effective_punches e
    WHERE e.organization_id = org_id
      AND e.user_id = uid
      AND (timezone('America/Sao_Paulo', e.occurred_at))::date = today
      AND e.punch_type = 'saida_final'
  );

  IF entry_count > 2 OR exit_count > 2 THEN
    INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
    VALUES (org_id, uid, 'excedeu_limite_diario', jsonb_build_object('entries', entry_count, 'exits', exit_count));
    RAISE EXCEPTION 'Limite diário excedido';
  END IF;

  IF p_type = 'entrada' THEN
    IF entry_count >= 2 THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'excedeu_limite_diario', jsonb_build_object('entries', entry_count, 'attempt', 'entrada'));
      RAISE EXCEPTION 'Limite diário de entradas atingido';
    END IF;
    IF last_type IS NOT NULL AND last_type <> 'saida_final' THEN
      RAISE EXCEPTION 'Sequência inválida para entrada';
    END IF;

    IF last_type = 'saida_final' THEN
      allow_reentry := rep_p_has_unused_reentry_authorization(uid, today);
      IF NOT allow_reentry THEN
        RAISE EXCEPTION 'Nova entrada após saída final exige autorização';
      END IF;
    END IF;

    INSERT INTO rep_p_punches (
      organization_id,
      user_id,
      occurred_at,
      punch_type,
      ip,
      device,
      user_agent,
      origin,
      geo,
      metadata,
      created_by
    )
    VALUES (
      org_id,
      uid,
      now(),
      'entrada',
      ip_addr,
      p_device,
      ua,
      p_origin,
      p_geo,
      jsonb_build_object('flow', 'self'),
      uid
    )
    RETURNING id INTO punch_id;

    IF last_type = 'saida_final' THEN
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

  IF p_type = 'saida_intervalo' THEN
    IF exit_count >= 2 THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'excedeu_limite_diario', jsonb_build_object('exits', exit_count, 'attempt', 'saida_intervalo'));
      RAISE EXCEPTION 'Limite diário de saídas atingido';
    END IF;
    IF last_type <> 'entrada' THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'sequencia_invalida', jsonb_build_object('last_type', last_type::text, 'attempt', 'saida_intervalo'));
      RAISE EXCEPTION 'Sequência inválida para saída de intervalo';
    END IF;

    IF entry_at IS NULL THEN
      RAISE EXCEPTION 'Entrada não encontrada para o dia';
    END IF;

    IF (now_local - entry_at) < interval '4 hours' THEN
      RAISE EXCEPTION 'Intervalo só é permitido após 4 horas da entrada';
    END IF;

    IF (now_local - entry_at) > interval '6 hours 30 minutes' AND NOT p_ack_late_break THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'intervalo_tardio', jsonb_build_object('hours_since_entry', EXTRACT(EPOCH FROM (now_local - entry_at))/3600.0));
      RAISE EXCEPTION 'Intervalo após 6h30 requer confirmação';
    END IF;

    INSERT INTO rep_p_punches (
      organization_id,
      user_id,
      occurred_at,
      punch_type,
      ip,
      device,
      user_agent,
      origin,
      geo,
      metadata,
      created_by
    )
    VALUES (
      org_id,
      uid,
      now(),
      'saida_intervalo',
      ip_addr,
      p_device,
      ua,
      p_origin,
      p_geo,
      jsonb_build_object('flow', 'self'),
      uid
    )
    RETURNING id INTO punch_id;

    RETURN json_build_object('id', punch_id::text, 'type', 'saida_intervalo', 'occurred_at', now_local::text);
  END IF;

  IF p_type = 'retorno_intervalo' THEN
    IF last_type <> 'saida_intervalo' THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'sequencia_invalida', jsonb_build_object('last_type', last_type::text, 'attempt', 'retorno_intervalo'));
      RAISE EXCEPTION 'Sequência inválida para retorno do intervalo';
    END IF;

    IF break_out_at IS NULL THEN
      RAISE EXCEPTION 'Saída para intervalo não encontrada';
    END IF;

    IF (now_local - break_out_at) < interval '1 hour' THEN
      RAISE EXCEPTION 'Tempo mínimo de intervalo é 1 hora';
    END IF;

    IF (now_local - break_out_at) > interval '2 hours' THEN
      RAISE EXCEPTION 'Tempo máximo de intervalo é 2 horas';
    END IF;

    INSERT INTO rep_p_punches (
      organization_id,
      user_id,
      occurred_at,
      punch_type,
      ip,
      device,
      user_agent,
      origin,
      geo,
      metadata,
      created_by
    )
    VALUES (
      org_id,
      uid,
      now(),
      'retorno_intervalo',
      ip_addr,
      p_device,
      ua,
      p_origin,
      p_geo,
      jsonb_build_object('flow', 'self'),
      uid
    )
    RETURNING id INTO punch_id;

    RETURN json_build_object('id', punch_id::text, 'type', 'retorno_intervalo', 'occurred_at', now_local::text);
  END IF;

  IF p_type = 'saida_final' THEN
    IF exit_count >= 2 THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'excedeu_limite_diario', jsonb_build_object('exits', exit_count, 'attempt', 'saida_final'));
      RAISE EXCEPTION 'Limite diário de saídas atingido';
    END IF;
    IF last_type NOT IN ('entrada', 'retorno_intervalo') THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, type, details)
      VALUES (org_id, uid, 'sequencia_invalida', jsonb_build_object('last_type', last_type::text, 'attempt', 'saida_final'));
      RAISE EXCEPTION 'Sequência inválida para saída final';
    END IF;

    INSERT INTO rep_p_punches (
      organization_id,
      user_id,
      occurred_at,
      punch_type,
      ip,
      device,
      user_agent,
      origin,
      geo,
      metadata,
      created_by
    )
    VALUES (
      org_id,
      uid,
      now(),
      'saida_final',
      ip_addr,
      p_device,
      ua,
      p_origin,
      p_geo,
      jsonb_build_object('flow', 'self'),
      uid
    )
    RETURNING id INTO punch_id;

    IF entry_at IS NOT NULL AND (now_local - entry_at) >= interval '8 hours' THEN
      INSERT INTO rep_p_inconsistencies (organization_id, user_id, punch_id, type, details)
      VALUES (org_id, uid, punch_id, 'jornada_diaria_acima_8h', jsonb_build_object('hours_since_entry', EXTRACT(EPOCH FROM (now_local - entry_at))/3600.0));
    END IF;

    RETURN json_build_object('id', punch_id::text, 'type', 'saida_final', 'occurred_at', now_local::text);
  END IF;

  RAISE EXCEPTION 'Tipo de marcação inválido';
END;
$$;

CREATE OR REPLACE FUNCTION rep_p_admin_create_punch(
  p_user_id UUID,
  p_occurred_at TIMESTAMPTZ,
  p_type rep_p_punch_type,
  p_justification TEXT,
  p_device TEXT DEFAULT NULL,
  p_origin rep_p_origin DEFAULT 'web',
  p_geo JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  punch_id UUID;
  ip_addr TEXT;
  ua TEXT;
BEGIN
  org_id := get_user_organization_id();
  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para ação administrativa';
  END IF;
  IF p_justification IS NULL OR length(trim(p_justification)) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória';
  END IF;

  ip_addr := COALESCE(rep_p_request_ip(), NULL);
  ua := COALESCE(rep_p_request_header('user-agent'), NULL);

  INSERT INTO rep_p_punches (
    organization_id,
    user_id,
    occurred_at,
    punch_type,
    ip,
    device,
    user_agent,
    origin,
    geo,
    metadata,
    created_by
  )
  VALUES (
    org_id,
    p_user_id,
    p_occurred_at,
    p_type,
    ip_addr,
    p_device,
    ua,
    p_origin,
    p_geo,
    jsonb_build_object('flow', 'admin', 'manual', true),
    auth.uid()
  )
  RETURNING id INTO punch_id;

  INSERT INTO rep_p_admin_actions (
    organization_id,
    punch_id,
    action_type,
    old_values,
    new_values,
    justification,
    action_by
  )
  VALUES (
    org_id,
    punch_id,
    'criar',
    NULL,
    jsonb_build_object('occurred_at', p_occurred_at, 'punch_type', p_type::text),
    p_justification,
    auth.uid()
  );

  RETURN json_build_object('id', punch_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION rep_p_admin_void_punch(
  p_punch_id UUID,
  p_justification TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  row_old JSONB;
BEGIN
  org_id := get_user_organization_id();
  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para ação administrativa';
  END IF;
  IF p_justification IS NULL OR length(trim(p_justification)) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória';
  END IF;

  SELECT to_jsonb(p.*) INTO row_old
  FROM rep_p_punches p
  WHERE p.id = p_punch_id
    AND p.organization_id = org_id;

  IF row_old IS NULL THEN
    RAISE EXCEPTION 'Registro não encontrado';
  END IF;

  INSERT INTO rep_p_admin_actions (
    organization_id,
    punch_id,
    action_type,
    old_values,
    new_values,
    justification,
    action_by
  )
  VALUES (
    org_id,
    p_punch_id,
    'anular',
    row_old,
    jsonb_build_object('status', 'anulado'),
    p_justification,
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION rep_p_admin_correct_punch(
  p_punch_id UUID,
  p_new_occurred_at TIMESTAMPTZ,
  p_new_type rep_p_punch_type,
  p_justification TEXT,
  p_device TEXT DEFAULT NULL,
  p_origin rep_p_origin DEFAULT 'web',
  p_geo JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  uid UUID;
  old_row rep_p_punches%ROWTYPE;
  new_id UUID;
  ip_addr TEXT;
  ua TEXT;
BEGIN
  uid := auth.uid();
  org_id := get_user_organization_id();
  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para ação administrativa';
  END IF;
  IF p_justification IS NULL OR length(trim(p_justification)) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória';
  END IF;

  SELECT * INTO old_row
  FROM rep_p_punches p
  WHERE p.id = p_punch_id
    AND p.organization_id = org_id;

  IF old_row.id IS NULL THEN
    RAISE EXCEPTION 'Registro não encontrado';
  END IF;

  ip_addr := COALESCE(rep_p_request_ip(), NULL);
  ua := COALESCE(rep_p_request_header('user-agent'), NULL);

  INSERT INTO rep_p_punches (
    organization_id,
    user_id,
    occurred_at,
    punch_type,
    ip,
    device,
    user_agent,
    origin,
    geo,
    metadata,
    created_by
  )
  VALUES (
    org_id,
    old_row.user_id,
    p_new_occurred_at,
    p_new_type,
    ip_addr,
    p_device,
    ua,
    p_origin,
    p_geo,
    jsonb_build_object('flow', 'admin', 'corrects', old_row.id),
    uid
  )
  RETURNING id INTO new_id;

  INSERT INTO rep_p_admin_actions (
    organization_id,
    punch_id,
    action_type,
    old_values,
    new_values,
    justification,
    action_by
  )
  VALUES (
    org_id,
    old_row.id,
    'corrigir',
    jsonb_build_object('occurred_at', old_row.occurred_at, 'punch_type', old_row.punch_type::text),
    jsonb_build_object('occurred_at', p_new_occurred_at, 'punch_type', p_new_type::text, 'new_punch_id', new_id),
    p_justification,
    uid
  );

  RETURN json_build_object('new_punch_id', new_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION rep_p_admin_authorize_reentry(
  p_user_id UUID,
  p_for_date DATE,
  p_justification TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  auth_id UUID;
  new_id UUID;
BEGIN
  org_id := get_user_organization_id();
  auth_id := auth.uid();
  IF NOT user_has_role(ARRAY['owner', 'admin']::user_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para ação administrativa';
  END IF;
  IF p_justification IS NULL OR length(trim(p_justification)) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória';
  END IF;
  IF p_for_date IS NULL THEN
    RAISE EXCEPTION 'Data inválida';
  END IF;

  INSERT INTO rep_p_reentry_authorizations (
    organization_id,
    user_id,
    for_date,
    justification,
    authorized_by
  )
  VALUES (
    org_id,
    p_user_id,
    p_for_date,
    p_justification,
    auth_id
  )
  RETURNING id INTO new_id;

  INSERT INTO rep_p_admin_actions (
    organization_id,
    punch_id,
    action_type,
    old_values,
    new_values,
    justification,
    action_by
  )
  VALUES (
    org_id,
    NULL,
    'autorizar_nova_entrada',
    NULL,
    jsonb_build_object('user_id', p_user_id, 'for_date', p_for_date::text, 'authorization_id', new_id::text),
    p_justification,
    auth_id
  );

  RETURN new_id;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION rep_p_get_today_state() TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_register_punch(rep_p_punch_type, TEXT, rep_p_origin, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_admin_create_punch(UUID, TIMESTAMPTZ, rep_p_punch_type, TEXT, TEXT, rep_p_origin, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_admin_void_punch(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_admin_correct_punch(UUID, TIMESTAMPTZ, rep_p_punch_type, TEXT, TEXT, rep_p_origin, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rep_p_admin_authorize_reentry(UUID, DATE, TEXT) TO authenticated;

COMMIT;

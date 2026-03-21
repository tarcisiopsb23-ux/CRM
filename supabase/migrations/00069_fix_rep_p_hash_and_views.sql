-- =============================================================================
-- Fix REP-P: digest não encontrado + cannot drop columns from view
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Corrigir rep_p_hash_record
--    No Supabase, pgcrypto fica no schema "extensions", nao em "public".
--    A funcao precisa de SET search_path que inclua "extensions" para
--    encontrar digest(). Usamos plpgsql com search_path explicito.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rep_p_hash_record(payload TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $func$
BEGIN
  RETURN encode(digest(payload, 'sha256'), 'hex');
END;
$func$;

-- -----------------------------------------------------------------------------
-- 2. Garantir rep_p_settings com todas as colunas necessarias
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rep_p_settings (
  organization_id        UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  standard_start_time    TIME         NOT NULL DEFAULT '08:00',
  standard_work_hours    NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  standard_break_minutes INT          NOT NULL DEFAULT 60
    CHECK (standard_break_minutes >= 60 AND standard_break_minutes <= 120),
  overtime_requires_approval BOOLEAN  NOT NULL DEFAULT true,
  weekly_work_hours      NUMERIC(4,2) NOT NULL DEFAULT 44.00,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE rep_p_settings ADD COLUMN IF NOT EXISTS standard_break_minutes INT NOT NULL DEFAULT 60;
ALTER TABLE rep_p_settings ADD COLUMN IF NOT EXISTS weekly_work_hours NUMERIC(4,2) NOT NULL DEFAULT 44.00;
ALTER TABLE rep_p_settings ADD COLUMN IF NOT EXISTS overtime_requires_approval BOOLEAN NOT NULL DEFAULT true;

-- -----------------------------------------------------------------------------
-- 3. Garantir rep_p_overtime_authorizations existe
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rep_p_overtime_authorizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  work_date         DATE NOT NULL,
  minutes_requested INT  NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente',
  justification     TEXT NOT NULL,
  authorized_at     TIMESTAMPTZ,
  authorized_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, work_date)
);

-- -----------------------------------------------------------------------------
-- 4. Dropar toda a cadeia de views dependentes (CASCADE)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS rep_p_clt_compliance_report CASCADE;
DROP VIEW IF EXISTS rep_p_weekly_report         CASCADE;
DROP VIEW IF EXISTS rep_p_monthly_report        CASCADE;
DROP VIEW IF EXISTS rep_p_daily_report          CASCADE;
DROP VIEW IF EXISTS rep_p_effective_punches     CASCADE;
DROP VIEW IF EXISTS rep_p_punches_with_status   CASCADE;

-- -----------------------------------------------------------------------------
-- 5. rep_p_punches_with_status (view base)
-- -----------------------------------------------------------------------------
CREATE VIEW rep_p_punches_with_status AS
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
    WHEN la.action_type = 'anular'   THEN 'anulado'
    WHEN la.action_type = 'corrigir' THEN 'corrigido'
    ELSE 'ativo'
  END AS status,
  la.action_at     AS alterado_em,
  la.justification AS justificativa,
  la.action_by     AS alterado_por,
  la.action_type   AS tipo_alteracao,
  la.old_values    AS valores_anteriores,
  la.new_values    AS valores_novos
FROM rep_p_punches p
LEFT JOIN last_action la ON la.punch_id = p.id;

-- -----------------------------------------------------------------------------
-- 6. rep_p_effective_punches
-- -----------------------------------------------------------------------------
CREATE VIEW rep_p_effective_punches AS
SELECT * FROM rep_p_punches_with_status WHERE status = 'ativo';

-- -----------------------------------------------------------------------------
-- 7. rep_p_daily_report
-- -----------------------------------------------------------------------------
CREATE VIEW rep_p_daily_report AS
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
    MIN(occurred_at) FILTER (WHERE punch_type = 'entrada')           AS entrada_at,
    MIN(occurred_at) FILTER (WHERE punch_type = 'saida_intervalo')   AS saida_intervalo_at,
    MIN(occurred_at) FILTER (WHERE punch_type = 'retorno_intervalo') AS retorno_intervalo_at,
    MAX(occurred_at) FILTER (WHERE punch_type = 'saida_final')       AS saida_final_at
  FROM punches
  GROUP BY organization_id, user_id, work_date
),
calc AS (
  SELECT
    a.*,
    s.standard_start_time,
    s.standard_work_hours,
    s.standard_break_minutes,
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
  LEFT JOIN rep_p_settings s ON s.organization_id = a.organization_id
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
  ROUND((c.break_seconds / 60.0)::numeric, 0)  AS break_minutes,
  GREATEST(0, ROUND((c.break_seconds / 60.0) - COALESCE(c.standard_break_minutes, 60), 0)) AS delay_minutes,
  GREATEST(0, ROUND((c.work_seconds / 60.0) - (COALESCE(c.standard_work_hours, 8.00) * 60.0), 0)) AS overtime_minutes,
  COALESCE(ov.status, 'pendente') AS overtime_status,
  ov.justification                AS overtime_justification,
  ov.authorized_by                AS overtime_authorized_by,
  COALESCE((
    SELECT COUNT(*)
    FROM rep_p_inconsistencies i
    WHERE i.organization_id = c.organization_id
      AND i.user_id = c.user_id
      AND (timezone('America/Sao_Paulo', i.created_at))::date = c.work_date
  ), 0) AS inconsistencies_count,
  CASE
    WHEN c.entrada_at IS NULL                                           THEN 'sem_entrada'
    WHEN c.saida_final_at IS NULL AND c.work_date < rep_p_today_date() THEN 'incompleto'
    WHEN c.saida_final_at IS NULL                                       THEN 'em_andamento'
    ELSE 'fechado'
  END AS day_status
FROM calc c
LEFT JOIN rep_p_overtime_authorizations ov
  ON ov.user_id = c.user_id AND ov.work_date = c.work_date;

-- -----------------------------------------------------------------------------
-- 8. rep_p_monthly_report
-- -----------------------------------------------------------------------------
CREATE VIEW rep_p_monthly_report AS
SELECT
  organization_id,
  user_id,
  date_trunc('month', work_date)::date AS month_ref,
  COUNT(*)                             AS days_count,
  ROUND(SUM(worked_hours)::numeric, 2) AS total_worked_hours,
  SUM(inconsistencies_count)           AS inconsistencies_count,
  SUM(delay_minutes)                   AS total_delay_minutes,
  SUM(overtime_minutes) FILTER (WHERE overtime_status = 'aprovado') AS total_approved_overtime_minutes,
  SUM(overtime_minutes) FILTER (WHERE overtime_status = 'pendente') AS total_pending_overtime_minutes
FROM rep_p_daily_report
GROUP BY organization_id, user_id, date_trunc('month', work_date)::date;

-- -----------------------------------------------------------------------------
-- 9. rep_p_weekly_report
-- -----------------------------------------------------------------------------
CREATE VIEW rep_p_weekly_report AS
WITH daily_agg AS (
  SELECT
    organization_id,
    user_id,
    date_trunc('week', work_date)::date AS week_start,
    SUM(worked_hours)                   AS weekly_worked_hours,
    SUM(delay_minutes)                  AS weekly_delay_minutes,
    SUM(overtime_minutes) FILTER (WHERE overtime_status = 'aprovado') AS weekly_approved_overtime_minutes
  FROM rep_p_daily_report
  GROUP BY organization_id, user_id, date_trunc('week', work_date)::date
)
SELECT
  da.*,
  s.weekly_work_hours                                                AS expected_weekly_hours,
  ROUND((da.weekly_worked_hours - s.weekly_work_hours)::numeric, 2) AS weekly_balance_hours,
  CASE
    WHEN da.weekly_worked_hours < s.weekly_work_hours THEN true
    ELSE false
  END AS has_negative_hours
FROM daily_agg da
LEFT JOIN rep_p_settings s ON s.organization_id = da.organization_id;

-- -----------------------------------------------------------------------------
-- 10. rep_p_clt_compliance_report
-- -----------------------------------------------------------------------------
CREATE VIEW rep_p_clt_compliance_report AS
SELECT
  r.organization_id,
  r.user_id,
  p.full_name AS user_name,
  r.work_date,
  r.worked_hours,
  r.delay_minutes,
  r.overtime_minutes,
  r.overtime_status,
  r.day_status,
  CASE
    WHEN r.worked_hours < s.standard_work_hours AND r.day_status = 'fechado' THEN true
    ELSE false
  END AS is_short_day
FROM rep_p_daily_report r
JOIN profiles p ON p.id = r.user_id
LEFT JOIN rep_p_settings s ON s.organization_id = r.organization_id;

COMMIT;

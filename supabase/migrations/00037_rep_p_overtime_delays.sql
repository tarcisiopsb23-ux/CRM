-- =============================================================================
-- REP-P Extension: Overtime, Delays, and Settings
-- =============================================================================

BEGIN;

-- 1. Add 'autorizar_hora_extra' to rep_p_admin_action_type
-- Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block 
-- if we are not careful. However, Supabase migrations handle this.
ALTER TYPE rep_p_admin_action_type ADD VALUE IF NOT EXISTS 'autorizar_hora_extra';

-- 2. New Enum for Overtime Status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rep_p_overtime_status') THEN
    CREATE TYPE rep_p_overtime_status AS ENUM ('pendente', 'aprovado', 'rejeitado');
  END IF;
END $$;

-- 3. Ponto Settings Table
CREATE TABLE IF NOT EXISTS rep_p_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  standard_start_time TIME NOT NULL DEFAULT '08:00',
  standard_work_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
  standard_break_minutes INT NOT NULL DEFAULT 60 CHECK (standard_break_minutes >= 60 AND standard_break_minutes <= 120),
  overtime_requires_approval BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Overtime Authorizations Table
CREATE TABLE IF NOT EXISTS rep_p_overtime_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  minutes_requested INT NOT NULL,
  status rep_p_overtime_status NOT NULL DEFAULT 'pendente',
  justification TEXT NOT NULL,
  authorized_at TIMESTAMPTZ,
  authorized_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, work_date)
);

-- 5. RLS for new tables
ALTER TABLE rep_p_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_p_overtime_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY rep_p_settings_select ON rep_p_settings FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY rep_p_settings_all ON rep_p_settings FOR ALL
  USING (user_has_role(ARRAY['owner', 'admin']::user_role[]));

CREATE POLICY rep_p_overtime_select ON rep_p_overtime_authorizations FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      user_id = auth.uid()
      OR user_has_role(ARRAY['owner', 'admin', 'manager']::user_role[])
    )
  );

CREATE POLICY rep_p_overtime_insert ON rep_p_overtime_authorizations FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND (user_id = auth.uid() OR user_has_role(ARRAY['owner', 'admin', 'manager']::user_role[]))
  );

CREATE POLICY rep_p_overtime_update ON rep_p_overtime_authorizations FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin', 'manager']::user_role[])
  );

-- 6. Recreate Daily Report View with Overtime and Delays
DROP VIEW IF EXISTS rep_p_daily_report CASCADE;
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
  ROUND((c.break_seconds / 60.0)::numeric, 0) AS break_minutes,
  -- Atraso em minutos (apenas excedente do intervalo, ignorando hora de entrada)
  GREATEST(0, ROUND((c.break_seconds / 60.0) - COALESCE(c.standard_break_minutes, 60), 0)) AS delay_minutes,
  -- Hora Extra em minutos (acima da jornada padrão)
  GREATEST(0, ROUND((c.work_seconds / 60.0) - (COALESCE(c.standard_work_hours, 8.00) * 60.0), 0)) AS overtime_minutes,
  COALESCE(ov.status, 'pendente') AS overtime_status,
  ov.justification AS overtime_justification,
  ov.authorized_by AS overtime_authorized_by,
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
FROM calc c
LEFT JOIN rep_p_overtime_authorizations ov ON ov.user_id = c.user_id AND ov.work_date = c.work_date;

-- 7. Update Monthly Report View
CREATE VIEW rep_p_monthly_report AS
SELECT
  organization_id,
  user_id,
  date_trunc('month', work_date)::date AS month_ref,
  COUNT(*) AS days_count,
  ROUND(SUM(worked_hours)::numeric, 2) AS total_worked_hours,
  SUM(inconsistencies_count) AS inconsistencies_count,
  SUM(delay_minutes) AS total_delay_minutes,
  SUM(overtime_minutes) FILTER (WHERE overtime_status = 'aprovado') AS total_approved_overtime_minutes,
  SUM(overtime_minutes) FILTER (WHERE overtime_status = 'pendente') AS total_pending_overtime_minutes
FROM rep_p_daily_report
GROUP BY organization_id, user_id, date_trunc('month', work_date)::date;

COMMIT;

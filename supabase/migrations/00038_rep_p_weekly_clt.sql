-- =============================================================================
-- REP-P Extension: Weekly 44h limit and CLT Reports
-- =============================================================================

BEGIN;

-- 1. Update rep_p_settings with weekly hours
ALTER TABLE rep_p_settings ADD COLUMN IF NOT EXISTS weekly_work_hours NUMERIC(4,2) NOT NULL DEFAULT 44.00;

-- 2. Create Weekly Report View
DROP VIEW IF EXISTS rep_p_weekly_report CASCADE;
CREATE VIEW rep_p_weekly_report AS
WITH daily_agg AS (
  SELECT
    organization_id,
    user_id,
    date_trunc('week', work_date)::date AS week_start,
    SUM(worked_hours) AS weekly_worked_hours,
    SUM(delay_minutes) AS weekly_delay_minutes,
    SUM(overtime_minutes) FILTER (WHERE overtime_status = 'aprovado') AS weekly_approved_overtime_minutes
  FROM rep_p_daily_report
  GROUP BY organization_id, user_id, date_trunc('week', work_date)::date
)
SELECT
  da.*,
  s.weekly_work_hours AS expected_weekly_hours,
  ROUND((da.weekly_worked_hours - s.weekly_work_hours)::numeric, 2) AS weekly_balance_hours,
  CASE 
    WHEN da.weekly_worked_hours < s.weekly_work_hours THEN true 
    ELSE false 
  END AS has_negative_hours
FROM daily_agg da
LEFT JOIN rep_p_settings s ON s.organization_id = da.organization_id;

-- 3. Add 'clt' to ReportTemplate is handled in frontend, but we can prepare the view
-- for the CLT report which focuses on compliance and balances.
CREATE OR REPLACE VIEW rep_p_clt_compliance_report AS
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
    WHEN r.worked_hours < (s.standard_work_hours) AND r.day_status = 'fechado' THEN true
    ELSE false
  END AS is_short_day
FROM rep_p_daily_report r
JOIN profiles p ON p.id = r.user_id
LEFT JOIN rep_p_settings s ON s.organization_id = r.organization_id;

COMMIT;

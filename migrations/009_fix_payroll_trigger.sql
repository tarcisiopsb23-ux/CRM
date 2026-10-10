-- Ensure sync function and trigger are up-to-date for existing installations
-- This migration corrects the trigger/function that previously attempted to
-- insert explicit values into the generated column `total_value`, causing
-- errors when payroll entries were created.

-- Recreate the sync function with safe upsert logic (no explicit total_value)
CREATE OR REPLACE FUNCTION sync_payroll_to_expenses()
RETURNS TRIGGER AS $$
DECLARE
  month_start DATE;
  v_organization_id UUID;
  v_total_base NUMERIC;
  v_total_commission NUMERIC;
  v_total_bonus NUMERIC;
  v_total_overtime NUMERIC;
  v_total_discounts NUMERIC;
  v_existing_id UUID;
BEGIN
  month_start := date_trunc('month', NEW.reference_date)::date;
  v_organization_id := NEW.organization_id;

  SELECT
    COALESCE(SUM(base_salary), 0),
    COALESCE(SUM(commission), 0),
    COALESCE(SUM(bonus), 0),
    COALESCE(SUM(overtime), 0),
    COALESCE(SUM(discounts), 0)
  INTO v_total_base, v_total_commission, v_total_bonus, v_total_overtime, v_total_discounts
  FROM payrolls
  WHERE organization_id = v_organization_id
    AND date_trunc('month', reference_date)::date = month_start;

  SELECT id INTO v_existing_id
  FROM payroll_expenses
  WHERE organization_id = v_organization_id
    AND date_trunc('month', reference_date)::date = month_start
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE payroll_expenses
    SET
      base_salary = v_total_base,
      commission = v_total_commission,
      bonus = v_total_bonus,
      overtime = v_total_overtime,
      discounts = v_total_discounts,
      updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO payroll_expenses (
      organization_id,
      reference_date,
      base_salary,
      commission,
      bonus,
      overtime,
      discounts,
      status
    ) VALUES (
      v_organization_id,
      month_start,
      v_total_base,
      v_total_commission,
      v_total_bonus,
      v_total_overtime,
      v_total_discounts,
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- recreate the trigger to ensure it calls the updated function
DROP TRIGGER IF EXISTS trg_sync_payroll_to_expenses ON payrolls;
CREATE TRIGGER trg_sync_payroll_to_expenses
AFTER INSERT OR UPDATE ON payrolls
FOR EACH ROW
EXECUTE FUNCTION sync_payroll_to_expenses();

-- Create payroll_expenses table for financial tracking
-- This table aggregates payroll data and syncs with the payrolls table
-- Used to provide comprehensive financial information about payroll expenses

CREATE TABLE IF NOT EXISTS payroll_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  base_salary NUMERIC(10, 2) DEFAULT 0,
  commission NUMERIC(10, 2) DEFAULT 0,
  bonus NUMERIC(10, 2) DEFAULT 0,
  overtime NUMERIC(10, 2) DEFAULT 0,
  discounts NUMERIC(10, 2) DEFAULT 0,
  total_value NUMERIC(10, 2) GENERATED ALWAYS AS (
    base_salary + commission + bonus + overtime - discounts
  ) STORED,
  status TEXT DEFAULT 'pending', -- pending, paid
  paid_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for payroll_expenses
ALTER TABLE payroll_expenses ENABLE ROW LEVEL SECURITY;

-- Only admins and owners can manage payroll expenses
DROP POLICY IF EXISTS "Admins can manage payroll_expenses" ON payroll_expenses;
CREATE POLICY "Admins can manage payroll_expenses" ON payroll_expenses
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'admin')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'admin')));

-- Users can view payroll expenses for their organization (via team membership)
DROP POLICY IF EXISTS "Team members can view payroll_expenses" ON payroll_expenses;
CREATE POLICY "Team members can view payroll_expenses" ON payroll_expenses
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Function to automatically aggregate payroll data into payroll_expenses
-- This keeps payroll_expenses in sync when payrolls are created or updated
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
  -- Calculate the first day of the month for the reference date
  month_start := date_trunc('month', NEW.reference_date)::date;
  v_organization_id := NEW.organization_id;
  
  -- Aggregate all payroll data for the month
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

  -- Check if payroll_expenses record exists for this month
  SELECT id INTO v_existing_id
  FROM payroll_expenses
  WHERE organization_id = v_organization_id
    AND date_trunc('month', reference_date)::date = month_start
  LIMIT 1;

  -- Update existing record or insert new one
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

-- Trigger to sync payroll changes to payroll_expenses
DROP TRIGGER IF EXISTS trg_sync_payroll_to_expenses ON payrolls;
CREATE TRIGGER trg_sync_payroll_to_expenses
AFTER INSERT OR UPDATE ON payrolls
FOR EACH ROW
EXECUTE FUNCTION sync_payroll_to_expenses();

-- ensure payroll management policy allows managers
DROP POLICY IF EXISTS "Admins can manage payrolls" ON payrolls;
CREATE POLICY "Admins can manage payrolls" ON payrolls
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'admin', 'manager')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('owner', 'admin', 'manager')));

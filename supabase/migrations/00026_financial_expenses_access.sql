BEGIN;

-- Despesas (supplier_expenses) visíveis apenas para owner/admin.
-- Para gerentes/membros, expor apenas inadimplência via função agregada.

DROP POLICY IF EXISTS supplier_expenses_all ON supplier_expenses;

CREATE POLICY supplier_expenses_select_admin_only
ON supplier_expenses
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

CREATE POLICY supplier_expenses_insert_admin_only
ON supplier_expenses
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

CREATE POLICY supplier_expenses_update_admin_only
ON supplier_expenses
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

CREATE POLICY supplier_expenses_delete_admin_only
ON supplier_expenses
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND user_has_role(ARRAY['owner','admin']::user_role[])
);

CREATE OR REPLACE FUNCTION finance_get_delinquency()
RETURNS TABLE (
  overdue_payments_total NUMERIC,
  overdue_expenses_total NUMERIC,
  overdue_total NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE((
      SELECT SUM(p.value)
      FROM payments p
      WHERE p.organization_id = get_user_organization_id()
        AND p.due_date < (NOW() AT TIME ZONE 'UTC')::date
        AND p.paid_at IS NULL
    ), 0) AS overdue_payments_total,
    COALESCE((
      SELECT SUM(e.value)
      FROM supplier_expenses e
      WHERE e.organization_id = get_user_organization_id()
        AND e.due_date < (NOW() AT TIME ZONE 'UTC')::date
        AND e.paid_at IS NULL
        AND e.status <> 'cancelado'
    ), 0) AS overdue_expenses_total,
    COALESCE((
      SELECT SUM(p.value)
      FROM payments p
      WHERE p.organization_id = get_user_organization_id()
        AND p.due_date < (NOW() AT TIME ZONE 'UTC')::date
        AND p.paid_at IS NULL
    ), 0) + COALESCE((
      SELECT SUM(e.value)
      FROM supplier_expenses e
      WHERE e.organization_id = get_user_organization_id()
        AND e.due_date < (NOW() AT TIME ZONE 'UTC')::date
        AND e.paid_at IS NULL
        AND e.status <> 'cancelado'
    ), 0) AS overdue_total
$$;

GRANT EXECUTE ON FUNCTION finance_get_delinquency() TO authenticated;

COMMIT;


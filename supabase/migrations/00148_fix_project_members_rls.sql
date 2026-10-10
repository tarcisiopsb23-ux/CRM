-- Fix: project_members RLS policy was doing a subquery into projects
-- which has its own RLS, causing 400 errors for authenticated users.
-- The subquery into projects triggers projects RLS which can cause issues.
-- Use a direct organization_id check via a SECURITY DEFINER helper instead.

DROP POLICY IF EXISTS project_members_all ON project_members;
DROP POLICY IF EXISTS project_members_select ON project_members;
DROP POLICY IF EXISTS project_members_write ON project_members;

-- Use SET LOCAL to bypass RLS on the subquery by using SECURITY DEFINER function
-- my_org_id() is already SECURITY DEFINER and returns the user's org_id directly

CREATE POLICY project_members_select ON project_members
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id = my_org_id()
    )
  );

CREATE POLICY project_members_insert ON project_members
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id = my_org_id()
    )
  );

CREATE POLICY project_members_update ON project_members
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id = my_org_id()
    )
  );

CREATE POLICY project_members_delete ON project_members
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE organization_id = my_org_id()
    )
  );

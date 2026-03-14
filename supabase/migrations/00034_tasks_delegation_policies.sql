BEGIN;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_all ON tasks;
DROP POLICY IF EXISTS tasks_select_delegated ON tasks;
DROP POLICY IF EXISTS tasks_insert_delegated ON tasks;
DROP POLICY IF EXISTS tasks_update_delegated ON tasks;
DROP POLICY IF EXISTS tasks_delete_delegated ON tasks;

CREATE POLICY tasks_select_delegated
ON tasks
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = tasks.project_id
      AND p.organization_id = get_user_organization_id()
      AND can_access_delegated(p.team_id, p.assigned_to, TRUE)
  )
);

CREATE POLICY tasks_insert_delegated
ON tasks
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = tasks.project_id
      AND p.organization_id = get_user_organization_id()
      AND can_manage_delegated(p.team_id, p.assigned_to, FALSE)
  )
);

CREATE POLICY tasks_update_delegated
ON tasks
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = tasks.project_id
      AND p.organization_id = get_user_organization_id()
      AND can_manage_delegated(p.team_id, p.assigned_to, FALSE)
  )
)
WITH CHECK (
  organization_id = get_user_organization_id()
  AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = tasks.project_id
      AND p.organization_id = get_user_organization_id()
      AND can_manage_delegated(p.team_id, p.assigned_to, FALSE)
  )
);

CREATE POLICY tasks_delete_delegated
ON tasks
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.id = tasks.project_id
      AND p.organization_id = get_user_organization_id()
      AND can_manage_delegated(p.team_id, p.assigned_to, FALSE)
  )
);

COMMIT;

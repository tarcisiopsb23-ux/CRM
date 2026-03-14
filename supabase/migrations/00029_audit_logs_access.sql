BEGIN;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select
ON audit_logs
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    user_has_role(ARRAY['owner','admin']::user_role[])
    OR (
      user_has_role(ARRAY['manager']::user_role[])
      AND changed_by IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM team_members tm_me
        JOIN team_members tm_actor
          ON tm_actor.team_id = tm_me.team_id
        WHERE tm_me.profile_id = auth.uid()
          AND tm_actor.profile_id = audit_logs.changed_by
      )
    )
  )
);

CREATE OR REPLACE VIEW audit_logs_view AS
SELECT
  a.id,
  a.table_name,
  a.record_id,
  a.action,
  a.changed_by,
  p.full_name AS changed_by_name,
  a.changed_at,
  a.changes,
  a.organization_id
FROM audit_logs a
LEFT JOIN profiles p ON p.id = a.changed_by
WHERE a.organization_id = get_user_organization_id()
  AND (
    user_has_role(ARRAY['owner','admin']::user_role[])
    OR (
      user_has_role(ARRAY['manager']::user_role[])
      AND a.changed_by IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM team_members tm_me
        JOIN team_members tm_actor
          ON tm_actor.team_id = tm_me.team_id
        WHERE tm_me.profile_id = auth.uid()
          AND tm_actor.profile_id = a.changed_by
      )
    )
  );

COMMIT;


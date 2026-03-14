BEGIN;

-- Compatibilidade: enquanto a UI de Projetos/Agenda não define team_id/assigned_to,
-- permitir que manager/member gerenciem registros "agência" (team_id/assigned_to nulos).

DROP POLICY IF EXISTS projects_insert_delegated ON projects;
DROP POLICY IF EXISTS projects_update_delegated ON projects;
DROP POLICY IF EXISTS projects_delete_delegated ON projects;

CREATE POLICY projects_insert_delegated
ON projects
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY projects_update_delegated
ON projects
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY projects_delete_delegated
ON projects
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, TRUE)
);

DROP POLICY IF EXISTS events_insert_delegated ON events;
DROP POLICY IF EXISTS events_update_delegated ON events;
DROP POLICY IF EXISTS events_delete_delegated ON events;

CREATE POLICY events_insert_delegated
ON events
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY events_update_delegated
ON events
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY events_delete_delegated
ON events
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, TRUE)
);

COMMIT;


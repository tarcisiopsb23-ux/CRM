BEGIN;

-- -----------------------------------------------------------------------------
-- Helpers: equipes do usuário e compartilhamento de equipe
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_team_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT tm.team_id), ARRAY[]::uuid[])
  FROM team_members tm
  WHERE tm.profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION user_shares_team_with(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm_me
    JOIN team_members tm_other
      ON tm_other.team_id = tm_me.team_id
    WHERE tm_me.profile_id = auth.uid()
      AND tm_other.profile_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION can_access_delegated(p_team_id UUID, p_assigned_to UUID, p_company_visible BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  r user_role;
BEGIN
  SELECT role INTO r FROM profiles WHERE id = auth.uid();
  IF r IS NULL THEN
    RETURN FALSE;
  END IF;
  IF r = 'owner' OR r = 'admin' THEN
    RETURN TRUE;
  END IF;
  IF r = 'viewer' THEN
    RETURN FALSE;
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF p_assigned_to = auth.uid() THEN
      RETURN TRUE;
    END IF;
    RETURN user_shares_team_with(p_assigned_to);
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF r = 'manager' THEN
      RETURN TRUE;
    END IF;
    RETURN p_team_id = ANY(get_user_team_ids());
  END IF;

  RETURN p_company_visible AND (r = 'manager' OR r = 'member');
END;
$$;

CREATE OR REPLACE FUNCTION can_manage_delegated(p_team_id UUID, p_assigned_to UUID, p_company_manage BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  r user_role;
BEGIN
  SELECT role INTO r FROM profiles WHERE id = auth.uid();
  IF r IS NULL THEN
    RETURN FALSE;
  END IF;
  IF r = 'owner' OR r = 'admin' THEN
    RETURN TRUE;
  END IF;
  IF r = 'viewer' THEN
    RETURN FALSE;
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF p_assigned_to = auth.uid() THEN
      RETURN TRUE;
    END IF;
    RETURN user_shares_team_with(p_assigned_to);
  END IF;

  IF p_team_id IS NOT NULL THEN
    RETURN p_team_id = ANY(get_user_team_ids());
  END IF;

  RETURN p_company_manage AND (r = 'manager' OR r = 'member');
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_team_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION user_shares_team_with(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_delegated(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_delegated(UUID, UUID, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- Projects: adicionar delegação (team_id/assigned_to) + constraints
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects' AND column_name='team_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects' AND column_name='assigned_to'
  ) THEN
    ALTER TABLE projects ADD COLUMN assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_delegation_oneof') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_delegation_oneof CHECK (NOT (team_id IS NOT NULL AND assigned_to IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_assigned_to ON projects(assigned_to);

-- -----------------------------------------------------------------------------
-- Events: adicionar delegação (team_id/assigned_to) + constraints
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='events' AND column_name='team_id'
  ) THEN
    ALTER TABLE events ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='events' AND column_name='assigned_to'
  ) THEN
    ALTER TABLE events ADD COLUMN assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='events_delegation_oneof') THEN
    ALTER TABLE events ADD CONSTRAINT events_delegation_oneof CHECK (NOT (team_id IS NOT NULL AND assigned_to IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_team_id ON events(team_id);
CREATE INDEX IF NOT EXISTS idx_events_assigned_to ON events(assigned_to);

-- -----------------------------------------------------------------------------
-- Goals: reforçar delegação (usa team_id/assigned_to já existentes)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='goals_delegation_oneof') THEN
    ALTER TABLE goals ADD CONSTRAINT goals_delegation_oneof CHECK (NOT (team_id IS NOT NULL AND assigned_to IS NOT NULL));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- RLS: Goals (delegação: agência/equipe/colaborador)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS goals_all ON goals;

CREATE POLICY goals_select_delegated
ON goals
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND can_access_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY goals_insert_delegated
ON goals
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

CREATE POLICY goals_update_delegated
ON goals
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

CREATE POLICY goals_delete_delegated
ON goals
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

-- -----------------------------------------------------------------------------
-- RLS: Projects (delegação por team_id/assigned_to; company visível por enquanto)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS projects_all ON projects;

CREATE POLICY projects_select_delegated
ON projects
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND can_access_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY projects_insert_delegated
ON projects
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

CREATE POLICY projects_update_delegated
ON projects
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

CREATE POLICY projects_delete_delegated
ON projects
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

-- -----------------------------------------------------------------------------
-- RLS: Events (delegação por team_id/assigned_to; company visível por enquanto)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS events_all ON events;

CREATE POLICY events_select_delegated
ON events
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND can_access_delegated(team_id, assigned_to, TRUE)
);

CREATE POLICY events_insert_delegated
ON events
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

CREATE POLICY events_update_delegated
ON events
FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

CREATE POLICY events_delete_delegated
ON events
FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND can_manage_delegated(team_id, assigned_to, FALSE)
);

COMMIT;


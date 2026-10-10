-- =============================================================================
-- DEFINITIVE FIX: project_members access and auto-population
-- =============================================================================

-- 1. Drop all previous attempts at fixing project_members RLS
DROP POLICY IF EXISTS project_members_all    ON project_members;
DROP POLICY IF EXISTS project_members_select ON project_members;
DROP POLICY IF EXISTS project_members_insert ON project_members;
DROP POLICY IF EXISTS project_members_update ON project_members;
DROP POLICY IF EXISTS project_members_delete ON project_members;
DROP POLICY IF EXISTS project_members_write  ON project_members;

-- 2. Simple, flat RLS policies using get_user_organization_id() directly
--    No subquery into projects — avoids RLS recursion entirely.
--    We add organization_id column to project_members for direct org check.

-- Add organization_id to project_members if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_members'
      AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE project_members
      ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

    -- Backfill from projects table
    UPDATE project_members pm
    SET organization_id = p.organization_id
    FROM projects p
    WHERE p.id = pm.project_id;

    -- Make it NOT NULL after backfill
    ALTER TABLE project_members ALTER COLUMN organization_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_project_members_org_id
      ON project_members (organization_id);
  END IF;
END $$;

-- 3. New flat RLS policies — no subquery, no recursion
CREATE POLICY project_members_select ON project_members
  FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY project_members_insert ON project_members
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY project_members_update ON project_members
  FOR UPDATE
  USING (organization_id = get_user_organization_id());

CREATE POLICY project_members_delete ON project_members
  FOR DELETE
  USING (organization_id = get_user_organization_id());

-- 4. Drop and recreate get_project_members RPC with correct dollar-quoting
DROP FUNCTION IF EXISTS get_project_members(uuid);

CREATE OR REPLACE FUNCTION get_project_members(p_project_id uuid)
RETURNS TABLE (
  id           uuid,
  project_id   uuid,
  profile_id   uuid,
  organization_id uuid,
  role         text,
  joined_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
      AND p.organization_id = get_user_organization_id()
  ) THEN
    RAISE EXCEPTION 'Access denied to project %', p_project_id;
  END IF;

  RETURN QUERY
  SELECT
    pm.id,
    pm.project_id,
    pm.profile_id,
    pm.organization_id,
    pm.role::text,
    pm.joined_at
  FROM project_members pm
  WHERE pm.project_id = p_project_id
  ORDER BY pm.joined_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_members(uuid) TO authenticated;

-- 5. Grant execute on all chat/project RPCs
GRANT EXECUTE ON FUNCTION provision_general_channel(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION create_project_chat_group(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_counts()              TO authenticated;

-- 6. Trigger: auto-populate project_members when project is created/updated
--    Handles: assigned_to (individual), team_id (team members), responsible_type='agency'

CREATE OR REPLACE FUNCTION sync_project_members()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := NEW.organization_id;

  -- Handle assigned_to (individual)
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO project_members (project_id, profile_id, organization_id, role)
    VALUES (NEW.id, NEW.assigned_to, v_org_id, 'member')
    ON CONFLICT (project_id, profile_id) DO NOTHING;
  END IF;

  -- Handle team_id: add all team members
  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO project_members (project_id, profile_id, organization_id, role)
    SELECT NEW.id, tm.profile_id, v_org_id, 'member'
    FROM team_members tm
    WHERE tm.team_id = NEW.team_id
    ON CONFLICT (project_id, profile_id) DO NOTHING;
  END IF;

  -- Handle responsible_type = 'agency': add all org members with role >= member
  IF (NEW.metadata->>'responsible_type') = 'agency' THEN
    INSERT INTO project_members (project_id, profile_id, organization_id, role)
    SELECT NEW.id, p.id, v_org_id, 'member'
    FROM profiles p
    WHERE p.organization_id = v_org_id
      AND p.role IN ('owner', 'admin', 'manager', 'member')
      AND p.is_active = true
    ON CONFLICT (project_id, profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_project_members ON projects;
CREATE TRIGGER trg_sync_project_members
AFTER INSERT OR UPDATE OF assigned_to, team_id, metadata ON projects
FOR EACH ROW EXECUTE FUNCTION sync_project_members();

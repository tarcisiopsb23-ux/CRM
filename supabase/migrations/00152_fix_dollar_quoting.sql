-- Fix: migrations 00149 and 00151 used single $ instead of $$ for dollar-quoting.
-- This caused functions to be created with invalid/empty bodies.
-- Recreating all affected functions with correct $$ quoting.

-- ============================================================
-- 1. get_project_members — SECURITY DEFINER RPC
-- ============================================================
DROP FUNCTION IF EXISTS get_project_members(uuid);

CREATE OR REPLACE FUNCTION get_project_members(p_project_id uuid)
RETURNS TABLE (
  id              uuid,
  project_id      uuid,
  profile_id      uuid,
  organization_id uuid,
  role            text,
  joined_at       timestamptz
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

-- ============================================================
-- 2. sync_project_members — trigger function
-- ============================================================
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

  -- Handle responsible_type = 'agency': add all org members
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

-- ============================================================
-- 3. Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION provision_general_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_project_chat_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_counts()             TO authenticated;

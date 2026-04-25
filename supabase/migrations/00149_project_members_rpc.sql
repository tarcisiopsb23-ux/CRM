-- Create a SECURITY DEFINER RPC to fetch project members,
-- bypassing RLS issues with the project_members table.
-- This is the most reliable approach when RLS subqueries cause 400 errors.

CREATE OR REPLACE FUNCTION get_project_members(p_project_id uuid)
RETURNS TABLE (
  id        uuid,
  project_id uuid,
  profile_id uuid,
  role      text,
  joined_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  -- Verify the caller belongs to the same org as the project
  IF NOT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
      AND p.organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pm.id,
    pm.project_id,
    pm.profile_id,
    pm.role::text,
    pm.joined_at
  FROM project_members pm
  WHERE pm.project_id = p_project_id
  ORDER BY pm.joined_at ASC;
END;
$$;

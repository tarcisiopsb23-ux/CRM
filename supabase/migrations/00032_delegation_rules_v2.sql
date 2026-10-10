BEGIN;

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
    IF r = 'manager' THEN
      RETURN TRUE;
    END IF;
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

  IF NOT p_company_visible THEN
    RETURN FALSE;
  END IF;

  RETURN r = 'manager';
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

  RETURN p_company_manage AND r = 'manager';
END;
$$;

COMMIT;


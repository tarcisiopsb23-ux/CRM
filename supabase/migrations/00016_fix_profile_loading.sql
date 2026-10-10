-- =============================================================================
-- MAESTR.IA - Fix profile loading (bypass RLS for own profile)
-- =============================================================================
-- Root cause: Profile fetch can fail silently due to RLS edge cases.
-- Solution: RPC get_my_profile() returns current user's profile via SECURITY DEFINER,
-- guaranteeing the app can always load the profile when the user is authenticated.
-- =============================================================================

-- 1. Ensure get_user_organization_id has explicit search_path (safety)
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

-- 2. RPC: get current user's profile (bypasses RLS - used by frontend AuthContext)
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_profile json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT to_jsonb(p)::json INTO v_profile
  FROM profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
  RETURN v_profile;
END;
$$;

-- Grant execute to authenticated users (JWT required)
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

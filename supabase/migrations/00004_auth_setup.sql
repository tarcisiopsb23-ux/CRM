-- =============================================================================
-- MAESTR.IA - Supabase Auth & Profile Setup
-- =============================================================================
-- Auto-creates profile on signup. Optionally creates default organization.
-- =============================================================================

-- Trigger function: create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_slug TEXT;
BEGIN
  -- Generate unique slug from email (before @)
  org_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9]', '', 'g'));
  IF LENGTH(org_slug) < 3 THEN
    org_slug := 'org-' || REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', '');
  END IF;
  -- Ensure slug uniqueness
  org_slug := org_slug || '-' || SUBSTRING(NEW.id::text, 1, 8);

  -- Create default organization for new user (they become owner)
  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)) || '''s Organization',
    org_slug
  )
  RETURNING id INTO new_org_id;

  -- Create profile linked to auth.users
  INSERT INTO public.profiles (id, organization_id, full_name, email, role)
  VALUES (
    NEW.id,
    new_org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    'owner'
  );

  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- RLS: Profiles SELECT for own profile (before org assignment)
-- =============================================================================
-- Allow users to read their own profile (even if org is null)
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id = get_user_organization_id())
  );

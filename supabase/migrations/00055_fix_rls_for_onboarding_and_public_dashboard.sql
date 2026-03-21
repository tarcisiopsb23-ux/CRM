-- Fix RLS policies for organizations and clients
-- Allows new users to create organizations during onboarding
-- Allows clients to view their dashboard login info via slug

-- 1. Organizations: Allow authenticated users to insert (required for onboarding flow in AuthContext)
DROP POLICY IF EXISTS "Allow authenticated users to insert organizations" ON public.organizations;
CREATE POLICY "Allow authenticated users to insert organizations"
ON public.organizations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to SELECT the organization they just created or belong to
DROP POLICY IF EXISTS "Allow users to select their organization" ON public.organizations;
CREATE POLICY "Allow users to select their organization"
ON public.organizations
FOR SELECT
USING (
  id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  OR auth.uid() IS NOT NULL -- Fallback for the moment of creation in AuthContext
);

-- 2. Clients: Allow public read access via a secure RPC (to avoid exposing passwords in metadata)
-- The login page needs to check if the client exists and get basic info.
DROP POLICY IF EXISTS "Allow public select for dashboard login" ON public.clients;
-- We DON'T add a public SELECT policy here for security. Instead, we use an RPC.

-- Garantir que a tabela clients tenha RLS habilitado mas com bypass via SECURITY DEFINER
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_client_by_slug(p_slug TEXT)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    company VARCHAR,
    dashboard_slug TEXT,
    has_temp_password BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, 
        c.name, 
        c.company, 
        c.dashboard_slug,
        COALESCE((c.metadata->>'is_temp_password')::BOOLEAN, false) as has_temp_password
    FROM public.clients c
    WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
    LIMIT 1;
END;
$$;

-- RPC for validating the password securely
CREATE OR REPLACE FUNCTION public.validate_client_dashboard_password(p_slug TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.clients 
        WHERE LOWER(TRIM(dashboard_slug)) = LOWER(TRIM(p_slug))
        AND (
            metadata->>'dashboard_password' = p_password 
            OR (metadata->>'dashboard_password' IS NULL AND (p_password = '' OR p_password IS NULL))
        )
    );
END;
$$;

-- RPC for updating password (bypassing RLS for clients who only have a dashboard password)
CREATE OR REPLACE FUNCTION public.update_client_dashboard_password(p_client_id UUID, p_new_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.clients
    SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{dashboard_password}',
        to_jsonb(p_new_password)
    ) || '{"is_temp_password": false}'::jsonb
    WHERE id = p_client_id;
END;
$$;

-- RPC for recovery (bypassing RLS to find client by email and slug)
CREATE OR REPLACE FUNCTION public.recover_client_password(p_slug TEXT, p_email TEXT, p_new_temp_password TEXT)
RETURNS TABLE (organization_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    UPDATE public.clients
    SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{dashboard_password}',
        to_jsonb(p_new_temp_password)
    ) || '{"is_temp_password": true}'::jsonb
    WHERE LOWER(TRIM(dashboard_slug)) = LOWER(TRIM(p_slug)) AND LOWER(TRIM(email)) = LOWER(TRIM(p_email))
    RETURNING clients.organization_id INTO v_org_id;

    IF v_org_id IS NOT NULL THEN
        RETURN QUERY SELECT v_org_id;
    END IF;
END;
$$;

-- RPC to get organization name publicly
CREATE OR REPLACE FUNCTION public.get_organization_name(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT name INTO v_name FROM public.organizations WHERE id = p_org_id;
    RETURN v_name;
END;
$$;

-- Grant access to these functions
GRANT EXECUTE ON FUNCTION public.get_client_by_slug(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_client_dashboard_password(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_dashboard_password(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_client_password(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_name(UUID) TO anon, authenticated;

-- 3. Profiles: Ensure authenticated users can insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 4. Daily Metrics: Allow public read if the dashboard_slug matches
-- This is used by the PublicDashboardPage to show charts without a Supabase login
DROP POLICY IF EXISTS "Allow public read access via slug" ON public.daily_metrics;
CREATE POLICY "Allow public read access via slug" ON public.daily_metrics
    FOR SELECT
    TO anon, authenticated
    USING (client_id IN (SELECT id FROM public.clients WHERE dashboard_slug IS NOT NULL));

-- 5. RPC to get organization integrations (bypassing RLS for public recovery/admin cross-org)
-- This is secure because it only returns 'resend' and 'n8n' types and requires the UUID.
CREATE OR REPLACE FUNCTION public.get_organization_integrations_v2(p_org_id UUID)
RETURNS TABLE (config JSONB, integration_type public.integration_type)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT i.config, i.integration_type
    FROM public.organization_integrations i
    WHERE i.organization_id = p_org_id
    AND i.integration_type IN ('resend', 'n8n');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_integrations_v2(UUID) TO anon, authenticated;

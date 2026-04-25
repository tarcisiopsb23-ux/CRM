-- =============================================================================
-- Migration 00132: Fix custom_access_token_hook — rename 'role' claim to 'app_role'
--
-- Root cause: The hook was injecting `role: 'member'` into the JWT claims.
-- Supabase/PostgREST interprets the `role` claim as a PostgreSQL database role
-- and tries to execute `SET ROLE member`, which fails because 'member' is only
-- an enum value, not a PostgreSQL role.
--
-- Fix: rename the claim key from 'role' to 'app_role' so it is treated as an
-- application-level claim and not a database role switch.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id TEXT;
  v_app_role  TEXT;
BEGIN
  -- Extract tenant_id and app role from user_metadata
  v_tenant_id := event->'claims'->'user_metadata'->>'tenant_id';
  v_app_role  := COALESCE(event->'claims'->'user_metadata'->>'role', 'member');

  -- Inject claims into JWT
  -- NOTE: use 'app_role' (not 'role') to avoid Supabase/PostgREST treating it
  -- as a PostgreSQL database role and issuing SET ROLE <value>.
  RETURN jsonb_set(
    jsonb_set(
      event,
      '{claims,tenant_id}',
      CASE WHEN v_tenant_id IS NOT NULL
        THEN to_jsonb(v_tenant_id)
        ELSE 'null'::jsonb
      END
    ),
    '{claims,app_role}',
    to_jsonb(v_app_role)
  );
END;
$$;

-- Re-grant permissions (idempotent)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

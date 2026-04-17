-- Migration: 20260516000005_is_agency_owner.sql
-- Adiciona 'owner' como role reconhecido em is_agency_user()
-- para que usuários de suporte com role=owner tenham acesso completo via RLS.

CREATE OR REPLACE FUNCTION public.is_agency_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'app_role') IN ('agency', 'support', 'owner')
    OR (auth.jwt() ->> 'role')     IN ('agency', 'support', 'owner')  -- fallback tokens antigos
$$;

-- Atualizar o JWT hook para normalizar 'owner' para app_role corretamente
-- (is_support=true agora grava role='owner' no user_metadata)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id TEXT;
  v_role      TEXT;
BEGIN
  v_tenant_id := event->'claims'->'user_metadata'->>'tenant_id';
  v_role      := COALESCE(event->'claims'->'user_metadata'->>'role', 'member');

  -- Usuários da agência SEM tenant_id → app_role = 'agency'
  IF v_tenant_id IS NULL AND v_role IN ('owner', 'admin', 'manager', 'member', 'support', 'agency') THEN
    RETURN jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(event, '{claims,tenant_id}', 'null'::jsonb),
          '{claims,app_role}', '"agency"'::jsonb
        ),
        '{claims,agency_role}', to_jsonb(v_role)
      ),
      '{claims,role}', '"authenticated"'::jsonb
    );
  END IF;

  -- Usuários de suporte COM tenant_id e role=owner → app_role = 'owner'
  IF v_role IN ('owner', 'agency', 'support') THEN
    RETURN jsonb_set(
      jsonb_set(
        jsonb_set(event, '{claims,tenant_id}', to_jsonb(v_tenant_id)),
        '{claims,app_role}', to_jsonb(v_role)
      ),
      '{claims,role}', '"authenticated"'::jsonb
    );
  END IF;

  -- Usuários normais do CRM (admin/member)
  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(event, '{claims,tenant_id}',
        CASE WHEN v_tenant_id IS NOT NULL THEN to_jsonb(v_tenant_id) ELSE 'null'::jsonb END
      ),
      '{claims,app_role}', to_jsonb(v_role)
    ),
    '{claims,role}', '"authenticated"'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

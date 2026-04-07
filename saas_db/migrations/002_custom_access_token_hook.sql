-- Migration: 002_custom_access_token_hook.sql
-- Cria a função de hook JWT para injetar tenant_id e role como custom claims
--
-- Como registrar no Supabase Dashboard (SaaS):
--   1. Acesse o projeto SaaS no Supabase Dashboard
--   2. Vá em Authentication > Hooks
--   3. Em "Custom Access Token Hook", selecione:
--      - Schema: public
--      - Function: custom_access_token_hook
--   4. Salve e teste fazendo login com um usuário que tenha tenant_id no user_metadata

-- Hook: custom_access_token_hook
-- Injeta tenant_id e role do user_metadata como custom claims no JWT
-- Registrar este hook no Supabase Dashboard:
--   Authentication > Hooks > Custom Access Token Hook
--   Schema: public, Function: custom_access_token_hook

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id TEXT;
  v_role      TEXT;
BEGIN
  -- Extrai tenant_id e role do user_metadata
  v_tenant_id := event->'claims'->'user_metadata'->>'tenant_id';
  v_role      := COALESCE(event->'claims'->'user_metadata'->>'role', 'member');

  -- Usuário de suporte: role='support', tenant_id=null
  -- Usuário normal: role='admin' ou 'member', tenant_id=UUID do tenant

  -- Injeta os claims no JWT
  RETURN jsonb_set(
    jsonb_set(
      event,
      '{claims,tenant_id}',
      CASE WHEN v_tenant_id IS NOT NULL
        THEN to_jsonb(v_tenant_id)
        ELSE 'null'::jsonb
      END
    ),
    '{claims,role}',
    to_jsonb(v_role)
  );
END;
$$;

-- Conceder permissão para o Supabase Auth invocar a função
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

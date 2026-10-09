-- Migration: 20260501000009_crm_auth_hook.sql
--
-- Cria o custom_access_token_hook no CRM_DB.
-- Injeta tenant_id e role nos JWTs emitidos pelo CRM Auth.
--
-- Roles reconhecidos:
--   Roles do CRM (usuários dos tenants):
--     'admin'  — administrador do tenant
--     'member' — membro do tenant
--
--   Roles do Maestr.ia (equipe da agência — acesso a todos os tenants):
--     'owner'   — dono da agência
--     'admin'   — administrador da agência  (mesmo nome, contexto diferente)
--     'manager' — gerente da agência
--     'member'  — membro da agência         (mesmo nome, contexto diferente)
--     'viewer'  — visualizador (SEM acesso ao CRM)
--
--   Role especial:
--     'support' — alias legado, equivalente a roles da agência
--
-- Usuários da agência (owner/admin/manager/member) têm tenant_id = null no JWT.
-- O CRM trata qualquer usuário com tenant_id = null como "agência" (bypass de RLS).
-- O role 'viewer' é bloqueado no login — não tem acesso ao CRM.
--
-- Após aplicar esta migration:
--   1. Vá em Authentication > Hooks no Dashboard do CRM
--   2. Ative o "Custom Access Token Hook"
--   3. Schema: public, Function: custom_access_token_hook

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

  -- Usuários da agência (sem tenant_id) recebem role normalizado como 'agency'
  -- para simplificar as políticas RLS. O role original fica em 'agency_role'.
  -- Exceção: 'viewer' não tem acesso ao CRM — mantém role original para bloqueio no login.
  IF v_tenant_id IS NULL AND v_role IN ('owner', 'admin', 'manager', 'member', 'support') THEN
    RETURN jsonb_set(
      jsonb_set(
        jsonb_set(
          event,
          '{claims,tenant_id}',
          'null'::jsonb
        ),
        '{claims,role}',
        '"agency"'::jsonb
      ),
      '{claims,agency_role}',
      to_jsonb(v_role)
    );
  END IF;

  -- Usuários normais do CRM (com tenant_id) ou viewer
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

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

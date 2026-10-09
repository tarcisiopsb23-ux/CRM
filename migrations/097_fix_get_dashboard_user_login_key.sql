-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 097: Fix get_dashboard_user_by_login_key — varchar→text cast
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLEMA: a função declara RETURNS TABLE com colunas TEXT, mas a tabela
-- clients tem colunas VARCHAR(255) (company, client_supabase_url,
-- client_supabase_anon_key, name). PostgreSQL é estrito — sem cast explícito
-- a função lança "structure of query does not match function result type"
-- (error 42804), que a Edge Function client-dashboard-auth trata como usuário
-- não encontrado e retorna 401.
--
-- SOLUÇÃO: recriar a função com ::text em todas as colunas VARCHAR.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_dashboard_user_by_login_key(
  p_login_key TEXT
)
RETURNS TABLE (
  dashboard_user_id        UUID,
  auth_user_id             UUID,
  client_id                UUID,
  organization_id          UUID,
  client_slug              TEXT,
  real_email               TEXT,
  full_name                TEXT,
  role                     TEXT,
  active                   BOOLEAN,
  is_support               BOOLEAN,
  client_name              TEXT,
  client_company           TEXT,
  client_supabase_url      TEXT,
  client_supabase_anon_key TEXT,
  show_ia_content          BOOLEAN,
  c8_control_enabled       BOOLEAN,
  modules_config           JSONB,
  metadata                 JSONB,
  migration_completed      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    du.id                                          AS dashboard_user_id,
    du.auth_user_id,
    du.client_id,
    du.organization_id,
    du.client_slug::TEXT,
    du.real_email::TEXT,
    du.full_name::TEXT,
    du.role::TEXT,
    du.active,
    COALESCE(du.is_support, false),
    c.name::TEXT                                   AS client_name,
    c.company::TEXT                                AS client_company,
    c.client_supabase_url::TEXT,
    c.client_supabase_anon_key::TEXT,
    COALESCE(c.show_ia_content,   false)           AS show_ia_content,
    COALESCE(c.c8_control_enabled, false)          AS c8_control_enabled,
    COALESCE(p.modules_config, '{}'::JSONB)        AS modules_config,
    COALESCE(c.metadata,       '{}'::JSONB)        AS metadata,
    COALESCE(ms.status = 'completed', false)       AS migration_completed
  FROM  public.dashboard_users du
  JOIN  public.clients c         ON c.id  = du.client_id
  LEFT JOIN public.crm_client_plans p
                                  ON p.client_id = du.client_id
  LEFT JOIN public.client_migration_status ms
                                  ON ms.client_id = du.client_id
  WHERE du.login_key = lower(trim(p_login_key))
    AND du.active    = true
  LIMIT 1;
END;
$$;

-- Mantém as mesmas permissões da migration 074
REVOKE ALL   ON FUNCTION public.get_dashboard_user_by_login_key(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_user_by_login_key(TEXT) TO authenticated, service_role;

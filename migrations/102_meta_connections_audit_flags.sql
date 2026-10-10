-- =============================================================================
-- Migration 102: Auditoria de conexões Meta + Feature Flags
--
-- Tabelas:
--   1. meta_connection_audit  — log imutável de ações em meta_connections
--   2. meta_feature_flags     — flags de habilitação por organização
--
-- Idempotência: IF NOT EXISTS / OR REPLACE em todas as instruções.
-- =============================================================================

-- ── 1. meta_connection_audit ──────────────────────────────────────────────────
-- Log imutável. Apenas INSERT é permitido.
-- NUNCA armazena token, access_token, secret ou qualquer credencial.

CREATE TABLE IF NOT EXISTS public.meta_connection_audit (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         UUID        REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Ação auditada
  action                TEXT        NOT NULL
                        CHECK (action IN (
                          'manual_connection_created',
                          'manual_token_replaced',
                          'manual_connection_validated',
                          'manual_connection_failed',
                          'oauth_connection_created',
                          'connection_migrated_to_oauth',
                          'connection_migrated_from_oauth',
                          'connection_deactivated',
                          'connection_disconnected',
                          'connection_reactivated',
                          'health_check_passed',
                          'health_check_failed',
                          'token_expired'
                        )),

  -- Contexto de migração de método
  previous_method       TEXT,
  new_method            TEXT,

  -- Quem executou
  performed_by          UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_by_role     TEXT,

  -- Detalhes seguros (NUNCA inclui token, secret, ou dado sensível)
  details               JSONB       DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_audit_connection
  ON public.meta_connection_audit(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_audit_org
  ON public.meta_connection_audit(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_audit_action
  ON public.meta_connection_audit(action, created_at DESC);

ALTER TABLE public.meta_connection_audit ENABLE ROW LEVEL SECURITY;

-- Leitura: owner/admin da própria organização
DROP POLICY IF EXISTS "meta_audit_select" ON public.meta_connection_audit;
CREATE POLICY "meta_audit_select"
  ON public.meta_connection_audit FOR SELECT TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

-- Inserção: apenas via service_role (Edge Functions) — usuários não inserem diretamente
DROP POLICY IF EXISTS "meta_audit_insert" ON public.meta_connection_audit;
CREATE POLICY "meta_audit_insert"
  ON public.meta_connection_audit FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

-- Sem UPDATE ou DELETE — log é imutável
GRANT SELECT, INSERT ON public.meta_connection_audit TO authenticated;

COMMENT ON TABLE public.meta_connection_audit IS
  'Log imutável de ações em conexões Meta. Nunca armazena tokens ou secrets.';

-- ── 2. meta_feature_flags ─────────────────────────────────────────────────────
-- Controle de habilitação de métodos de conexão por organização.
-- Se não houver linha para uma org, os defaults se aplicam:
--   oauth_enabled = true, manual_enabled = true (owner/admin only), embedded_signup_enabled = false

CREATE TABLE IF NOT EXISTS public.meta_feature_flags (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID        NOT NULL UNIQUE
                              REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Conexão OAuth (fluxo oficial Meta)
  oauth_enabled               BOOLEAN     NOT NULL DEFAULT true,

  -- Conexão manual (apenas owner/admin)
  manual_enabled              BOOLEAN     NOT NULL DEFAULT true,
  manual_visible_to_members   BOOLEAN     NOT NULL DEFAULT false,

  -- Embedded Signup (futuro)
  embedded_signup_enabled     BOOLEAN     NOT NULL DEFAULT false,

  -- Ambientes disponíveis
  allow_development_env       BOOLEAN     NOT NULL DEFAULT true,
  allow_review_env            BOOLEAN     NOT NULL DEFAULT true,

  updated_by                  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_meta_feature_flags_updated_at ON public.meta_feature_flags;
CREATE TRIGGER trg_meta_feature_flags_updated_at
  BEFORE UPDATE ON public.meta_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.meta_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_flags_select" ON public.meta_feature_flags;
CREATE POLICY "meta_flags_select"
  ON public.meta_feature_flags FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "meta_flags_write" ON public.meta_feature_flags;
CREATE POLICY "meta_flags_write"
  ON public.meta_feature_flags FOR ALL TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

GRANT SELECT, INSERT, UPDATE ON public.meta_feature_flags TO authenticated;

-- ── 3. RPC: get_meta_feature_flags ───────────────────────────────────────────
-- Retorna as flags efetivas para uma organização.
-- Se não houver linha, retorna os defaults.

CREATE OR REPLACE FUNCTION public.get_meta_feature_flags(p_organization_id UUID)
RETURNS TABLE (
  oauth_enabled               BOOLEAN,
  manual_enabled              BOOLEAN,
  manual_visible_to_members   BOOLEAN,
  embedded_signup_enabled     BOOLEAN,
  allow_development_env       BOOLEAN,
  allow_review_env            BOOLEAN
)
SECURITY DEFINER
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(f.oauth_enabled,             true)  AS oauth_enabled,
    COALESCE(f.manual_enabled,            true)  AS manual_enabled,
    COALESCE(f.manual_visible_to_members, false) AS manual_visible_to_members,
    COALESCE(f.embedded_signup_enabled,   false) AS embedded_signup_enabled,
    COALESCE(f.allow_development_env,     true)  AS allow_development_env,
    COALESCE(f.allow_review_env,          true)  AS allow_review_env
  FROM (SELECT p_organization_id AS oid) AS ref
  LEFT JOIN public.meta_feature_flags f ON f.organization_id = ref.oid;
$$;

GRANT EXECUTE ON FUNCTION public.get_meta_feature_flags TO authenticated;

-- ── 4. Registra ───────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('102_meta_connections_audit_flags', now())
ON CONFLICT (version) DO NOTHING;

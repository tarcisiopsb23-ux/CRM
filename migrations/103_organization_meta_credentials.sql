-- =============================================================================
-- Migration 103: Token da agência Meta + campo use_agency_token
--
-- Permite que conexões Meta de clientes reutilizem o token do System User
-- da agência, em vez de exigir um token por cliente.
--
-- Tabelas:
--   1. organization_meta_credentials — armazena o token da agência (criptografado)
--   2. ALTER meta_connections — adiciona use_agency_token
--
-- Idempotente: IF NOT EXISTS em todas as instruções.
-- =============================================================================

-- ── 1. Token global da agência ────────────────────────────────────────────────
-- Uma organização pode ter múltiplas credenciais Meta (ex: System User principal
-- + credencial de backup), mas normalmente terá apenas uma ativa.

CREATE TABLE IF NOT EXISTS public.organization_meta_credentials (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação
  display_name            TEXT        NOT NULL DEFAULT 'Token da Agência',
  token_type              TEXT        NOT NULL DEFAULT 'system_user'
                          CHECK (token_type IN ('system_user','user','page','app')),

  -- Token criptografado AES-GCM via CRYPTO_SECRET — NUNCA exposto ao frontend
  access_token_encrypted  TEXT,
  token_is_set            BOOLEAN     NOT NULL DEFAULT false,

  -- Metadados do token (sem dados sensíveis)
  meta_user_id            TEXT,         -- ID do System User ou usuário Meta
  business_id             TEXT,         -- Business Manager ID
  token_expires_at        TIMESTAMPTZ,  -- null = não expira (system user token)
  token_last_validated_at TIMESTAMPTZ,

  -- Preview mascarado para exibição — ex: EAAG••••••••1B2
  token_preview           TEXT,

  -- Saúde
  health_status           TEXT        DEFAULT 'unknown'
                          CHECK (health_status IN ('healthy','warning','failed','unknown')),
  last_health_check_at    TIMESTAMPTZ,

  -- Controle
  is_active               BOOLEAN     NOT NULL DEFAULT true,
  created_by              UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by              UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_meta_creds_active
  ON public.organization_meta_credentials(organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_org_meta_creds_org
  ON public.organization_meta_credentials(organization_id);

DROP TRIGGER IF EXISTS trg_org_meta_creds_updated_at ON public.organization_meta_credentials;
CREATE TRIGGER trg_org_meta_creds_updated_at
  BEFORE UPDATE ON public.organization_meta_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.organization_meta_credentials ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro autenticado da org pode ver (sem o token)
DROP POLICY IF EXISTS "org_meta_creds_select" ON public.organization_meta_credentials;
CREATE POLICY "org_meta_creds_select"
  ON public.organization_meta_credentials FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

-- Escrita: apenas owner/admin
DROP POLICY IF EXISTS "org_meta_creds_write" ON public.organization_meta_credentials;
CREATE POLICY "org_meta_creds_write"
  ON public.organization_meta_credentials FOR ALL TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_meta_credentials TO authenticated;

-- View segura — nunca expõe access_token_encrypted
CREATE OR REPLACE VIEW public.organization_meta_credentials_safe
WITH (security_invoker = true) AS
  SELECT
    id, organization_id, display_name, token_type,
    token_is_set, meta_user_id, business_id,
    token_expires_at, token_last_validated_at,
    token_preview, health_status, last_health_check_at,
    is_active, created_by, updated_by, created_at, updated_at
  FROM public.organization_meta_credentials;

GRANT SELECT ON public.organization_meta_credentials_safe TO authenticated;

-- ── 2. Adiciona use_agency_token em meta_connections ─────────────────────────

ALTER TABLE public.meta_connections
  ADD COLUMN IF NOT EXISTS use_agency_token BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meta_connections.use_agency_token IS
  'Quando true, a credencial é resolvida a partir de organization_meta_credentials '
  '(token do System User da agência) em vez de access_token_encrypted desta conexão.';

-- ── 3. RPC: get_org_meta_credential ──────────────────────────────────────────
-- Retorna o token criptografado da agência para uso EXCLUSIVO em Edge Functions.
-- Revogada para roles não-service_role.

CREATE OR REPLACE FUNCTION public.get_org_meta_credential(p_organization_id UUID)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT access_token_encrypted
  INTO   v_token
  FROM   public.organization_meta_credentials
  WHERE  organization_id = p_organization_id
    AND  is_active = true
    AND  access_token_encrypted IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_token IS NULL THEN
    RAISE EXCEPTION 'org_meta_credential_not_found';
  END IF;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_meta_credential FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_meta_credential FROM authenticated;
REVOKE ALL ON FUNCTION public.get_org_meta_credential FROM anon;

-- ── 4. Grants ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.organization_meta_credentials IS
  'Token Meta global da agência (System User ou User Token). '
  'O campo access_token_encrypted nunca é exposto ao frontend — usar a view _safe.';

-- ── 5. Registra ───────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('103_organization_meta_credentials', now())
ON CONFLICT (version) DO NOTHING;

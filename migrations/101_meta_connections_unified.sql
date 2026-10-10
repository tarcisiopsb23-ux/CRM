-- =============================================================================
-- Migration 101: Tabela unificada meta_connections
--
-- Contexto:
--   Centraliza TODAS as conexões Meta (Facebook, Instagram, WhatsApp) do C8
--   Control, independentemente do método de provisionamento (OAuth, Manual,
--   Embedded Signup). Substitui o modelo anterior onde oauth_tokens era a única
--   tabela e não tinha estrutura para IDs de ativos Meta específicos.
--
--   ESTA migration NÃO remove nem altera oauth_tokens, meta_ad_accounts ou
--   meta_review_connections. Ela é ADITIVA.
--
-- Segurança do token:
--   O campo access_token_encrypted armazena o token cifrado com AES-GCM
--   via Deno.crypto na Edge Function meta-manual-connect. A chave vive
--   exclusivamente na variável de ambiente CRYPTO_SECRET do Supabase.
--   Para conexões OAuth o campo armazena o token diretamente, protegido
--   pelo mesmo RLS (service_role exclusivo via Edge Function).
--
-- Idempotência: todas as instruções usam IF NOT EXISTS / OR REPLACE.
-- =============================================================================

-- ── 1. Tabela principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_connections (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Isolamento multi-tenant
  organization_id             UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by                  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Provedor e método
  provider                    TEXT        NOT NULL
                              CHECK (provider IN ('facebook','instagram','whatsapp','meta_multi')),
  connection_method           TEXT        NOT NULL DEFAULT 'oauth'
                              CHECK (connection_method IN ('oauth','manual','embedded_signup')),
  connection_environment      TEXT        NOT NULL DEFAULT 'production'
                              CHECK (connection_environment IN ('production','development','review')),

  -- Estado
  status                      TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN (
                                'active','inactive','expired','error',
                                'revoked','needs_reauthentication','disconnected'
                              )),
  display_name                TEXT,

  -- Identidade Meta
  meta_user_id                TEXT,
  business_id                 TEXT,

  -- Ativos Facebook
  facebook_page_id            TEXT,
  facebook_page_name          TEXT,

  -- Ativos Instagram
  instagram_account_id        TEXT,
  instagram_username          TEXT,

  -- Ativos WhatsApp Business
  waba_id                     TEXT,
  whatsapp_phone_number_id    TEXT,
  whatsapp_display_phone_number TEXT,

  -- Ativos Ads
  ad_account_id               TEXT,
  catalog_id                  TEXT,

  -- Credencial — NUNCA exposta ao frontend
  -- Para conexões manuais: AES-GCM ciphertext (base64) via CRYPTO_SECRET
  -- Para OAuth: token longo do Meta (protegido por RLS service_role-only)
  access_token_encrypted      TEXT,
  token_type                  TEXT        DEFAULT 'user'
                              CHECK (token_type IN ('user','page','system','app')),
  token_expires_at            TIMESTAMPTZ,
  token_last_validated_at     TIMESTAMPTZ,

  -- Saúde e sync
  last_sync_at                TIMESTAMPTZ,
  last_error                  TEXT,
  health_status               TEXT        DEFAULT 'unknown'
                              CHECK (health_status IN ('healthy','warning','failed','unknown')),
  health_details              JSONB       DEFAULT '{}',
  last_health_check_at        TIMESTAMPTZ,

  -- Migração de método (para rastrear manual → oauth)
  previous_connection_method  TEXT,
  migration_at                TIMESTAMPTZ,
  migration_by                UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Referência cruzada: conexão OAuth que originou este registro (quando method=oauth)
  oauth_token_id              UUID        REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meta_connections_org
  ON public.meta_connections(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_meta_connections_provider
  ON public.meta_connections(organization_id, provider, connection_method);

CREATE INDEX IF NOT EXISTS idx_meta_connections_page_id
  ON public.meta_connections(organization_id, facebook_page_id)
  WHERE facebook_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_connections_instagram
  ON public.meta_connections(organization_id, instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_connections_waba
  ON public.meta_connections(organization_id, waba_id)
  WHERE waba_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_connections_phone
  ON public.meta_connections(organization_id, whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_connections_status
  ON public.meta_connections(status, token_expires_at)
  WHERE status IN ('active','needs_reauthentication');

-- ── 3. Trigger updated_at ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_meta_connections_updated_at ON public.meta_connections;
CREATE TRIGGER trg_meta_connections_updated_at
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- Leitura: membros autenticados da própria organização
-- O campo access_token_encrypted NUNCA deve ser retornado ao frontend —
-- garantimos isso via view segura abaixo (seção 6).
DROP POLICY IF EXISTS "meta_connections_select" ON public.meta_connections;
CREATE POLICY "meta_connections_select"
  ON public.meta_connections FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

-- Inserção/atualização: apenas owner/admin via Edge Function (service_role).
-- Usuários autenticados comuns não inserem diretamente — usam Edge Functions.
DROP POLICY IF EXISTS "meta_connections_insert" ON public.meta_connections;
CREATE POLICY "meta_connections_insert"
  ON public.meta_connections FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

DROP POLICY IF EXISTS "meta_connections_update" ON public.meta_connections;
CREATE POLICY "meta_connections_update"
  ON public.meta_connections FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

DROP POLICY IF EXISTS "meta_connections_delete" ON public.meta_connections;
CREATE POLICY "meta_connections_delete"
  ON public.meta_connections FOR DELETE TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

-- ── 5. View segura (sem token) ────────────────────────────────────────────────
-- Retorna todos os campos EXCETO access_token_encrypted.
-- O frontend SEMPRE usa esta view — nunca a tabela diretamente.

CREATE OR REPLACE VIEW public.meta_connections_safe
WITH (security_invoker = true) AS
  SELECT
    id,
    organization_id,
    created_by,
    provider,
    connection_method,
    connection_environment,
    status,
    display_name,
    meta_user_id,
    business_id,
    facebook_page_id,
    facebook_page_name,
    instagram_account_id,
    instagram_username,
    waba_id,
    whatsapp_phone_number_id,
    whatsapp_display_phone_number,
    ad_account_id,
    catalog_id,
    -- Token nunca exposto — só indica se existe e o prefixo
    (access_token_encrypted IS NOT NULL) AS token_is_set,
    CASE
      WHEN access_token_encrypted IS NOT NULL
      THEN left(access_token_encrypted, 4) || '••••••••••••••••••••' || right(access_token_encrypted, 3)
      ELSE NULL
    END AS token_preview,
    token_type,
    token_expires_at,
    token_last_validated_at,
    last_sync_at,
    last_error,
    health_status,
    health_details,
    last_health_check_at,
    previous_connection_method,
    migration_at,
    migration_by,
    oauth_token_id,
    created_at,
    updated_at
  FROM public.meta_connections;

-- ── 6. RPC: check_meta_asset_duplicate ───────────────────────────────────────
-- Verifica se já existe uma conexão ativa para um ativo específico na organização.
-- Usado ANTES de criar uma nova conexão — evita duplicidade.
-- Retorna informações suficientes para o frontend exibir aviso, sem expor token.

CREATE OR REPLACE FUNCTION public.check_meta_asset_duplicate(
  p_organization_id    UUID,
  p_facebook_page_id   TEXT DEFAULT NULL,
  p_instagram_account_id TEXT DEFAULT NULL,
  p_whatsapp_phone_number_id TEXT DEFAULT NULL,
  p_waba_id            TEXT DEFAULT NULL
)
RETURNS TABLE (
  connection_id        UUID,
  display_name         TEXT,
  provider             TEXT,
  connection_method    TEXT,
  status               TEXT,
  created_at           TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    display_name,
    provider,
    connection_method,
    status,
    created_at
  FROM public.meta_connections
  WHERE
    organization_id = p_organization_id
    AND status NOT IN ('disconnected','revoked')
    AND (
      (p_facebook_page_id IS NOT NULL          AND facebook_page_id          = p_facebook_page_id)
      OR (p_instagram_account_id IS NOT NULL   AND instagram_account_id      = p_instagram_account_id)
      OR (p_whatsapp_phone_number_id IS NOT NULL AND whatsapp_phone_number_id = p_whatsapp_phone_number_id)
      OR (p_waba_id IS NOT NULL                AND waba_id                   = p_waba_id)
    )
  ORDER BY created_at DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.check_meta_asset_duplicate TO authenticated;

-- ── 7. RPC: get_meta_connection_credential ────────────────────────────────────
-- Retorna o token decriptado para uso EXCLUSIVO em Edge Functions (service_role).
-- NÃO deve ser chamada por usuários autenticados comuns.
-- A segurança é garantida pela política da Edge Function que usa service_role key.

CREATE OR REPLACE FUNCTION public.get_meta_connection_credential(
  p_connection_id   UUID,
  p_organization_id UUID
)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Só retorna se a organização bater (isolamento)
  SELECT access_token_encrypted
  INTO   v_token
  FROM   public.meta_connections
  WHERE  id = p_connection_id
    AND  organization_id = p_organization_id
    AND  status IN ('active','needs_reauthentication');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection_not_found';
  END IF;

  RETURN v_token;
END;
$$;

-- Esta função só é acessível via service_role — não conceder a authenticated/anon
REVOKE ALL ON FUNCTION public.get_meta_connection_credential FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_meta_connection_credential FROM authenticated;
REVOKE ALL ON FUNCTION public.get_meta_connection_credential FROM anon;

-- ── 8. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_connections      TO authenticated;
GRANT SELECT                         ON public.meta_connections_safe TO authenticated;

-- ── 9. Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.meta_connections IS
  'Conexões Meta unificadas (Facebook, Instagram, WhatsApp). Suporta OAuth, Manual e Embedded Signup. O campo access_token_encrypted nunca é exposto ao frontend — usar a view meta_connections_safe.';

COMMENT ON COLUMN public.meta_connections.access_token_encrypted IS
  'Token cifrado com AES-GCM (manual) ou token longo OAuth. NUNCA retornado ao frontend. Decriptação ocorre exclusivamente em Edge Functions via service_role.';

COMMENT ON COLUMN public.meta_connections.connection_method IS
  'Método de provisionamento da credencial: oauth (fluxo oficial Meta), manual (admin configura token), embedded_signup (fluxo futuro).';

-- ── 10. Registra na schema_migrations ─────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('101_meta_connections_unified', now())
ON CONFLICT (version) DO NOTHING;

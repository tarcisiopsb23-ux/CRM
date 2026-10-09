-- =============================================================================
-- Migration 100: Tabelas para Central de Meta App Review
--
-- Contexto: A Central de Meta App Review fica no C8 Control (dashboard do cliente)
-- e permite preparar, auditar e screencasts para o App Review da Meta.
-- Todos os dados ficam no Banco A (Maestr.ia).
--
-- Tabelas:
--   1. meta_review_api_logs     — log de chamadas à Meta API (sem tokens)
--   2. meta_review_connections  — conexões Meta usadas nos testes de review
-- =============================================================================

-- ── 1. meta_review_api_logs ──────────────────────────────────────────────────
-- Registra cada chamada real à Meta API feita durante os testes de App Review.
-- NÃO armazena: access_token, app_secret, signed_request, Authorization header.
-- Usado no painel "Review API Calls" e no checklist READY FOR SCREENCAST.

CREATE TABLE IF NOT EXISTS public.meta_review_api_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id         UUID        REFERENCES public.clients(id) ON DELETE SET NULL,

  -- Identificação da chamada
  permission        TEXT        NOT NULL,   -- ex: pages_show_list
  group_name        TEXT,                   -- ex: GRUPO 2 — FACEBOOK PAGES
  endpoint          TEXT        NOT NULL,   -- ex: /me/accounts
  http_method       TEXT        NOT NULL DEFAULT 'GET'
                                CHECK (http_method IN ('GET','POST','DELETE','PATCH')),

  -- Resultado
  response_status   INTEGER,               -- 200, 400, 403, 500...
  response_summary  TEXT,                  -- mensagem sem dados sensíveis
  is_live_test      BOOLEAN     NOT NULL DEFAULT false, -- true = API real, false = mock

  -- Referência à conexão Meta utilizada (não armazena token)
  -- FK adicionada no passo 3, após a criação de meta_review_connections
  meta_connection_id UUID,

  -- Rastreabilidade
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_review_api_logs_org
  ON public.meta_review_api_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_review_api_logs_permission
  ON public.meta_review_api_logs(permission);
CREATE INDEX IF NOT EXISTS idx_meta_review_api_logs_live
  ON public.meta_review_api_logs(is_live_test, created_at DESC);

ALTER TABLE public.meta_review_api_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_review_api_logs_auth" ON public.meta_review_api_logs;
CREATE POLICY "meta_review_api_logs_auth"
  ON public.meta_review_api_logs FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ── 2. meta_review_connections ───────────────────────────────────────────────
-- Conexões Meta criadas especificamente para demonstração do App Review.
-- Armazena apenas IDs públicos (user_id, page_id, etc.) — nunca tokens.

CREATE TABLE IF NOT EXISTS public.meta_review_connections (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id             UUID        REFERENCES public.clients(id) ON DELETE SET NULL,

  -- Tipo de conexão
  connection_type       TEXT        NOT NULL
                        CHECK (connection_type IN (
                          'facebook_login',     -- Facebook Login (Geral)
                          'instagram_facebook', -- Instagram via Facebook Login
                          'instagram_login',    -- Instagram Login direto
                          'whatsapp_embedded'   -- WhatsApp Embedded Signup
                        )),

  -- Identidade Meta (sem tokens)
  meta_user_id          TEXT,        -- ID do usuário Meta autenticado
  meta_user_name        TEXT,        -- Nome de exibição
  meta_app_scoped_id    TEXT,        -- App-scoped user ID

  -- Ativos vinculados
  page_id               TEXT,        -- Facebook Page ID selecionada
  page_name             TEXT,
  instagram_account_id  TEXT,        -- Instagram Business Account ID
  instagram_username    TEXT,
  waba_id               TEXT,        -- WhatsApp Business Account ID
  phone_number_id       TEXT,        -- WhatsApp Phone Number ID
  phone_number          TEXT,        -- Número formatado (ex: +55 11 99999-9999)

  -- Estado
  is_test_account       BOOLEAN     NOT NULL DEFAULT true,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  connected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at       TIMESTAMPTZ,
  notes                 TEXT,        -- observações internas

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_review_connections_org
  ON public.meta_review_connections(organization_id, connection_type);
CREATE INDEX IF NOT EXISTS idx_meta_review_connections_active
  ON public.meta_review_connections(organization_id, is_active);

ALTER TABLE public.meta_review_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_review_connections_auth" ON public.meta_review_connections;
CREATE POLICY "meta_review_connections_auth"
  ON public.meta_review_connections FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_meta_review_connections_updated_at ON public.meta_review_connections;
CREATE TRIGGER trg_meta_review_connections_updated_at
  BEFORE UPDATE ON public.meta_review_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Corrige FK em meta_review_api_logs (definida antes da tabela referenciada)
-- A FK para meta_review_connections não pôde ser definida inline acima porque
-- meta_review_connections ainda não existia. Adicionamos aqui.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meta_review_api_logs_connection_fk'
  ) THEN
    ALTER TABLE public.meta_review_api_logs
      ADD CONSTRAINT meta_review_api_logs_connection_fk
      FOREIGN KEY (meta_connection_id) REFERENCES public.meta_review_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_review_api_logs     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_review_connections   TO authenticated;

-- ── 5. Registra na schema_migrations ─────────────────────────────────────────
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('100_meta_review_tables', now())
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE public.meta_review_api_logs IS
  'Log de chamadas à Meta API feitas durante testes de App Review. Nunca armazena tokens ou secrets.';
COMMENT ON TABLE public.meta_review_connections IS
  'Conexões Meta (Facebook, Instagram, WhatsApp) usadas para demonstração do App Review. Apenas IDs públicos.';

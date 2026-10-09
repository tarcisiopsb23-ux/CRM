-- =============================================================================
-- Migration 099: Suporte a Meta Deauth Webhook
--
-- Execute no Supabase SQL Editor do banco compartilhado (owwaulaenabbdalycusx).
--
-- Cria oauth_tokens se ainda nao existir (idempotente),
-- adiciona meta_user_id e cria oauth_deauth_log para auditoria.
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Garante que oauth_tokens existe (cria se nao existir)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID        REFERENCES clients(id) ON DELETE CASCADE,
  tenant_id          UUID,
  provider           TEXT        NOT NULL CHECK (provider IN ('google', 'meta')),
  access_token       TEXT        NOT NULL,
  refresh_token      TEXT,
  expires_at         TIMESTAMPTZ,
  scope              TEXT,
  -- Google-specific
  ga4_property_id    TEXT,
  gads_customer_id   TEXT,
  -- Meta-specific
  meta_ad_account_id TEXT,
  meta_user_id       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

-- Colunas adicionais via ADD COLUMN IF NOT EXISTS (idempotente para bancos que
-- ja tinham a tabela criada pela migration 20260406000001_oauth_tokens.sql)
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS tenant_id          UUID;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS ga4_property_id    TEXT;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS gads_customer_id   TEXT;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS meta_user_id       TEXT;

-- Indices
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client_id
  ON oauth_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_tenant_id
  ON oauth_tokens(tenant_id)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_meta_user_id
  ON oauth_tokens(meta_user_id)
  WHERE meta_user_id IS NOT NULL;

-- RLS
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_oauth_tokens"        ON oauth_tokens;
DROP POLICY IF EXISTS "oauth_tokens_tenant_isolation" ON oauth_tokens;
CREATE POLICY "oauth_tokens_tenant_isolation" ON oauth_tokens
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') IN ('support', 'agency')
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') IN ('support', 'agency')
  );

COMMENT ON COLUMN oauth_tokens.meta_user_id IS
  'Facebook User ID retornado pela Meta. Usado pelo webhook meta-deauth para revogar tokens.';

-- 2. Tabela de log de desautorizacoes (auditoria)
CREATE TABLE IF NOT EXISTS oauth_deauth_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT        NOT NULL,
  meta_user_id  TEXT,
  deleted_count INTEGER     NOT NULL DEFAULT 0,
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oauth_deauth_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_public_access" ON oauth_deauth_log;
CREATE POLICY "no_public_access"
  ON oauth_deauth_log FOR ALL
  USING (false);

COMMENT ON TABLE oauth_deauth_log IS
  'Log de desautorizacoes recebidas do webhook meta-deauth.';

-- Versao
INSERT INTO schema_migrations (version)
VALUES ('meta_deauth_support_v1')
ON CONFLICT (version) DO NOTHING;

-- Tabela para armazenar tokens OAuth de integrações externas (Google, Meta)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider    TEXT        NOT NULL CHECK (provider IN ('google', 'meta')),
  access_token  TEXT      NOT NULL,
  refresh_token TEXT,
  expires_at  TIMESTAMPTZ,
  scope       TEXT,
  -- Google-specific
  ga4_property_id   TEXT,  -- ex: "properties/123456789"
  gads_customer_id  TEXT,  -- ex: "123-456-7890"
  -- Meta-specific
  meta_ad_account_id TEXT, -- ex: "act_123456789"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client_id ON oauth_tokens (client_id);

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_oauth_tokens" ON oauth_tokens;
CREATE POLICY "anon_all_oauth_tokens" ON oauth_tokens
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

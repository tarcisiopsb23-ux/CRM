-- =============================================================================
-- MAESTR.IA - CRM Sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  session_token    TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  revoked          BOOLEAN NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_sessions_session_token
  ON crm_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_crm_sessions_client_id_revoked
  ON crm_sessions(client_id, revoked);

-- RLS
ALTER TABLE crm_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_sessions_all ON crm_sessions;
CREATE POLICY crm_sessions_all
  ON crm_sessions
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

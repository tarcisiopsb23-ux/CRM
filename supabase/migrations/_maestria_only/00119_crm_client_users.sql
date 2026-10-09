-- =============================================================================
-- MAESTR.IA - CRM Client Users
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_client_users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL, -- auth.users no SaaS_DB (banco externo, sem FK)
  email            TEXT NOT NULL,
  name             TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  last_access_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_client_users_client_active
  ON crm_client_users(client_id, active);

CREATE INDEX IF NOT EXISTS idx_crm_client_users_organization_id
  ON crm_client_users(organization_id);

-- RLS
ALTER TABLE crm_client_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_client_users_all ON crm_client_users;
CREATE POLICY crm_client_users_all
  ON crm_client_users
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

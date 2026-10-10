-- =============================================================================
-- MAESTR.IA - Settings Module (Secure Storage)
-- =============================================================================
-- API keys, webhooks, n8n, WhatsApp, Google Calendar
-- RLS: owner/admin only
-- =============================================================================

DO $$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_type') THEN
      CREATE TYPE integration_type AS ENUM (
        'api_keys',
        'webhooks',
        'n8n',
        'whatsapp',
        'google_calendar'
      );
   END IF;
END $$;

-- One row per org per integration type; config stores sensitive data
CREATE TABLE IF NOT EXISTS organization_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type integration_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, integration_type)
);

CREATE INDEX IF NOT EXISTS idx_organization_integrations_org
  ON organization_integrations(organization_id);

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;

-- Only owner/admin can manage integrations
DROP POLICY IF EXISTS org_integrations_select ON organization_integrations;
CREATE POLICY org_integrations_select ON organization_integrations FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS org_integrations_insert ON organization_integrations;
CREATE POLICY org_integrations_insert ON organization_integrations FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS org_integrations_update ON organization_integrations;
CREATE POLICY org_integrations_update ON organization_integrations FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

DROP POLICY IF EXISTS org_integrations_delete ON organization_integrations;
CREATE POLICY org_integrations_delete ON organization_integrations FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner', 'admin']::user_role[])
  );

CREATE TRIGGER update_organization_integrations_updated
  BEFORE UPDATE ON organization_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

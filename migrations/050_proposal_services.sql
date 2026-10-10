CREATE TABLE proposal_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (char_length(name) <= 120),
  description     TEXT CHECK (char_length(description) <= 500),
  value           NUMERIC(12,2) NOT NULL CHECK (value >= 0.01 AND value <= 999999.99),
  is_bonus        BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_services_proposal ON proposal_services(proposal_id);
CREATE INDEX idx_proposal_services_org ON proposal_services(organization_id);

ALTER TABLE proposal_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_services_org" ON proposal_services
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

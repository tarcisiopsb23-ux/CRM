CREATE TABLE proposal_sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key     TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  is_visible      BOOLEAN NOT NULL DEFAULT true,
  section_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, section_key)
);

CREATE INDEX idx_proposal_sections_proposal ON proposal_sections(proposal_id);

ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_sections_org" ON proposal_sections
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_proposal_sections_updated
  BEFORE UPDATE ON proposal_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

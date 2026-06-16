CREATE TABLE proposal_acceptances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES proposals(id) ON DELETE RESTRICT,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  approver_name     TEXT NOT NULL,
  approver_cpf      TEXT NOT NULL,
  ip_address        TEXT NOT NULL,
  user_agent        TEXT,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposal_snapshot JSONB NOT NULL,
  snapshot_hash     TEXT NOT NULL,
  UNIQUE (proposal_id)
);

CREATE INDEX idx_proposal_acceptances_org ON proposal_acceptances(organization_id);

ALTER TABLE proposal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_acceptances_read_org" ON proposal_acceptances
  FOR SELECT
  USING (organization_id = get_user_organization_id());
CREATE POLICY "proposal_acceptances_no_update" ON proposal_acceptances
  FOR UPDATE USING (false);
CREATE POLICY "proposal_acceptances_no_delete" ON proposal_acceptances
  FOR DELETE USING (false);

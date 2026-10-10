CREATE TABLE proposal_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id         UUID,
  action          TEXT NOT NULL,
  metadata        JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_audit_org ON proposal_audit_log(organization_id, proposal_id);

ALTER TABLE proposal_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_audit_read_org" ON proposal_audit_log
  FOR SELECT
  USING (organization_id = get_user_organization_id());

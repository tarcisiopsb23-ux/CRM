CREATE TABLE proposal_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  ip              TEXT,
  city            TEXT,
  device          TEXT,
  browser         TEXT,
  os              TEXT,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_events_proposal ON proposal_events(proposal_id);
CREATE INDEX idx_proposal_events_session ON proposal_events(proposal_id, session_id);
CREATE INDEX idx_proposal_events_org ON proposal_events(organization_id);

ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposal_events_read_org" ON proposal_events
  FOR SELECT
  USING (organization_id = get_user_organization_id());

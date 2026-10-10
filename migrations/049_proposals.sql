CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  closer_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,

  title           TEXT NOT NULL DEFAULT '',
  public_slug     TEXT NOT NULL UNIQUE,

  -- Hero
  hero_logo_url        TEXT,
  hero_title           TEXT NOT NULL DEFAULT '',
  hero_subtitle        TEXT,
  hero_message         TEXT,
  hero_video_url       TEXT,
  hero_image_url       TEXT,
  hero_whatsapp_text   TEXT DEFAULT 'Falar no WhatsApp',
  hero_whatsapp_number TEXT,
  hero_cta_text        TEXT DEFAULT 'Aprovar Proposta',
  hero_cta_color       TEXT DEFAULT '#16a34a',

  -- Valores
  plan_value      NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Cronograma financeiro
  schedule        JSONB NOT NULL DEFAULT '{}',

  -- Status
  status          TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviada','visualizada','aprovada','recusada','expirada')),

  -- Analytics agregado
  total_views      INTEGER NOT NULL DEFAULT 0,
  total_accesses   INTEGER NOT NULL DEFAULT 0,
  avg_session_secs INTEGER NOT NULL DEFAULT 0,
  first_accessed_at TIMESTAMPTZ,
  last_accessed_at  TIMESTAMPTZ,

  -- Metadados
  tags            TEXT[] NOT NULL DEFAULT '{}',
  campaign_origin TEXT,
  lead_origin     TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_org ON proposals(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposals_client ON proposals(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposals_lead ON proposals(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_proposals_slug ON proposals(public_slug);
CREATE INDEX idx_proposals_status ON proposals(organization_id, status) WHERE deleted_at IS NULL;

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_org" ON proposals
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE TRIGGER update_proposals_updated
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

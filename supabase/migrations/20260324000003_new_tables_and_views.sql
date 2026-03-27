-- Migration 3: Novas Tabelas e Views Analiticas
-- Cria contracts, lead_interactions, lead_tags, lead_followups e views de ROI.
-- Pre-requisito: Migrations 1 e 2 devem ter sido executadas.

-- Tabela contracts
CREATE TABLE IF NOT EXISTS contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  monthly_value NUMERIC(12,2),
  total_value   NUMERIC(12,2),
  service_type  service_type_enum NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE,
  status        contract_status_enum NOT NULL DEFAULT 'ativo',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contracts_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

DROP TRIGGER IF EXISTS set_updated_at ON contracts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status    ON contracts (status);

-- FK: crm_leads.campaign_id -> campaign_data.id
DO $$
BEGIN
  ALTER TABLE crm_leads
    ADD CONSTRAINT fk_crm_leads_campaign
    FOREIGN KEY (campaign_id) REFERENCES campaign_data(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- FK: crm_leads.contract_id -> contracts.id
DO $$
BEGIN
  ALTER TABLE crm_leads
    ADD CONSTRAINT fk_crm_leads_contract
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tabela lead_interactions
CREATE TABLE IF NOT EXISTS lead_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  type          interaction_type_enum NOT NULL,
  content       TEXT NOT NULL,
  interacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id      ON lead_interactions (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_interacted_at ON lead_interactions (interacted_at DESC);

-- Tabela lead_tags
CREATE TABLE IF NOT EXISTS lead_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  tag        tag_label_enum NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lead_tags_lead_tag UNIQUE (lead_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag     ON lead_tags (tag);

-- Tabela lead_followups
CREATE TABLE IF NOT EXISTS lead_followups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  note         TEXT,
  is_done      BOOLEAN NOT NULL DEFAULT false,
  done_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_followup_done_at CHECK (done_at IS NULL OR is_done = true)
);

CREATE INDEX IF NOT EXISTS idx_lead_followups_lead_id      ON lead_followups (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_followups_scheduled_at ON lead_followups (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_lead_followups_is_done      ON lead_followups (is_done);

-- View: lead_campaign_roi (CRM x Performance)
-- LEFT JOIN garante que leads sem campanha aparecem com campos de campanha NULL.
CREATE OR REPLACE VIEW lead_campaign_roi AS
SELECT
  l.id              AS lead_id,
  l.name            AS lead_name,
  l.origin          AS lead_origin,
  l.status          AS lead_status,
  l.potential_value,
  c.client_id,
  c.id              AS campaign_id,
  c.name            AS campaign_name,
  c.platform,
  c.spend           AS campaign_spend,
  c.leads           AS campaign_leads
FROM crm_leads l
LEFT JOIN campaign_data c ON l.campaign_id = c.id;

-- View: lead_roi_by_origin (ROI agregado por origem)
CREATE OR REPLACE VIEW lead_roi_by_origin AS
SELECT
  lead_origin,
  COUNT(*)                                                        AS total_leads,
  COUNT(*) FILTER (WHERE lead_status = 'fechado')                 AS closed_leads,
  COALESCE(SUM(potential_value) FILTER (WHERE lead_status = 'fechado'), 0) AS total_potential_value,
  COALESCE(SUM(campaign_spend), 0)                                AS total_campaign_spend,
  SUM(potential_value) FILTER (WHERE lead_status = 'fechado')
    / NULLIF(SUM(campaign_spend), 0)                              AS roi_ratio
FROM lead_campaign_roi
GROUP BY lead_origin;

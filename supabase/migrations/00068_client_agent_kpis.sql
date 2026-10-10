-- =============================================================================
-- client_agent_kpis
-- KPIs diárias por atendente humano (handoff) por cliente.
-- Dados enviados pelo n8n via Edge Function receive-client-kpis.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_agent_kpis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  period_date         DATE NOT NULL,
  agent_name          TEXT NOT NULL,
  conversations_started   INTEGER NOT NULL DEFAULT 0,
  conversations_finished  INTEGER NOT NULL DEFAULT 0,
  conversions             INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, client_id, period_date, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_cak2_org_date    ON client_agent_kpis(organization_id, period_date DESC);
CREATE INDEX IF NOT EXISTS idx_cak2_client_date ON client_agent_kpis(client_id, period_date DESC);

ALTER TABLE client_agent_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read agent kpis"
  ON client_agent_kpis FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

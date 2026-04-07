-- Migration: Fase 1 — Adicionar tenant_id (nullable) em todas as tabelas do CRM_DB
-- Idempotente: usa ADD COLUMN IF NOT EXISTS
-- tenant_id permanece nullable aqui; será preenchido na migration seguinte (backfill)
-- e tornado NOT NULL na migration 20260501000002.

-- clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- campaign_data
ALTER TABLE campaign_data
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- daily_metrics
ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- client_kpis
ALTER TABLE client_kpis
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- client_kpi_history
ALTER TABLE client_kpi_history
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- crm_leads: adiciona tenant_id e client_id (Requirement 8.3)
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- ad_click_sessions
ALTER TABLE ad_click_sessions
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- client_conversation_kpis
ALTER TABLE client_conversation_kpis
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- oauth_tokens (pode não existir em todos os ambientes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'oauth_tokens') THEN
    ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
END $$;

-- contracts (pode não existir em todos os ambientes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contracts') THEN
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
END $$;

-- Migration: Fase 3 — Aplicar NOT NULL em tenant_id e criar índices
-- Pré-requisito: migration 20260501000001 (backfill) deve ter sido executada.
-- Índices usam CREATE INDEX IF NOT EXISTS para idempotência.

-- ============================================================
-- NOT NULL constraints
-- ============================================================

ALTER TABLE clients
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE campaign_data
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE daily_metrics
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE client_kpis
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE client_kpi_history
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE crm_leads
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE ad_click_sessions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE client_conversation_kpis
  ALTER COLUMN tenant_id SET NOT NULL;

-- Tabelas opcionais: aplicar NOT NULL apenas se existirem e a coluna existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'oauth_tokens'
      AND column_name  = 'tenant_id'
  ) THEN
    ALTER TABLE oauth_tokens ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'contracts'
      AND column_name  = 'tenant_id'
  ) THEN
    ALTER TABLE contracts ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- Índices por tenant_id
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clients_tenant_id
  ON clients (tenant_id);

CREATE INDEX IF NOT EXISTS idx_campaign_data_tenant_id
  ON campaign_data (tenant_id);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_tenant_id
  ON daily_metrics (tenant_id);

CREATE INDEX IF NOT EXISTS idx_client_kpis_tenant_id
  ON client_kpis (tenant_id);

CREATE INDEX IF NOT EXISTS idx_client_kpi_history_tenant_id
  ON client_kpi_history (tenant_id);

CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_id
  ON crm_leads (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ad_click_sessions_tenant_id
  ON ad_click_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_conv_kpis_tenant_id
  ON client_conversation_kpis (tenant_id);

-- Índices opcionais (criados apenas se a tabela existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oauth_tokens'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_oauth_tokens_tenant_id ON oauth_tokens (tenant_id)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contracts'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id ON contracts (tenant_id)';
  END IF;
END $$;

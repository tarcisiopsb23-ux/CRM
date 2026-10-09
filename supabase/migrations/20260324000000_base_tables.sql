-- Migration 0: Tabelas Base (schema inicial do projeto)
-- Cria as tabelas que ja existem no banco de producao.
-- Necessario apenas para ambientes novos/de teste.
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.

-- Tabela: clients
CREATE TABLE IF NOT EXISTS clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  company        VARCHAR(255),
  dashboard_slug VARCHAR(100) UNIQUE,
  favicon_url    TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela: campaign_data
CREATE TABLE IF NOT EXISTS campaign_data (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  platform   VARCHAR(100) NOT NULL,
  name       VARCHAR(255) NOT NULL,
  spend      NUMERIC(12,2) NOT NULL DEFAULT 0,
  leads      INTEGER,
  sales      INTEGER,
  revenue    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_data_client_id ON campaign_data (client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_data_date      ON campaign_data (date);

-- Tabela: daily_metrics
CREATE TABLE IF NOT EXISTS daily_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_leads INTEGER NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0,
  revenue     NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_client_id ON daily_metrics (client_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date      ON daily_metrics (date);

-- Tabela: client_kpis
CREATE TABLE IF NOT EXISTS client_kpis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  category      VARCHAR(100) NOT NULL,
  unit          VARCHAR(20) NOT NULL CHECK (unit IN ('currency', 'percentage', 'number')),
  is_predefined BOOLEAN NOT NULL DEFAULT false,
  target_value  NUMERIC(12,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_kpis_client_id ON client_kpis (client_id);

-- Tabela: client_kpi_history
CREATE TABLE IF NOT EXISTS client_kpi_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kpi_id     UUID NOT NULL REFERENCES client_kpis(id) ON DELETE CASCADE,
  month_year VARCHAR(7) NOT NULL,
  value      NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_kpi_history_client_id ON client_kpi_history (client_id);
CREATE INDEX IF NOT EXISTS idx_client_kpi_history_kpi_id    ON client_kpi_history (kpi_id);

-- Tabela: client_conversation_kpis
CREATE TABLE IF NOT EXISTS client_conversation_kpis (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_date      DATE NOT NULL,
  source           VARCHAR(100) NOT NULL,
  campaign         VARCHAR(255),
  conversations    INTEGER NOT NULL DEFAULT 0,
  bot_finished     INTEGER NOT NULL DEFAULT 0,
  human_transfer   INTEGER NOT NULL DEFAULT 0,
  leads_identified INTEGER NOT NULL DEFAULT 0,
  conversions      INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_kpis_client_id   ON client_conversation_kpis (client_id);
CREATE INDEX IF NOT EXISTS idx_conv_kpis_period_date ON client_conversation_kpis (period_date);

-- Tabela: client_agent_kpis
CREATE TABLE IF NOT EXISTS client_agent_kpis (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_name             VARCHAR(255) NOT NULL,
  conversations_started  INTEGER NOT NULL DEFAULT 0,
  conversations_finished INTEGER NOT NULL DEFAULT 0,
  conversions            INTEGER NOT NULL DEFAULT 0,
  period_date            DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_kpis_client_id ON client_agent_kpis (client_id);

-- Tabela: crm_leads
CREATE TABLE IF NOT EXISTS crm_leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  phone          VARCHAR(30),
  email          VARCHAR(255),
  address        TEXT,
  proposal_value NUMERIC(12,2),
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'novo',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_status_text ON crm_leads (status);

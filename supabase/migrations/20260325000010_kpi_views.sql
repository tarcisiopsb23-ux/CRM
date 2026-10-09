-- Migration: KPI Views para o Dashboard de Atendimento
-- Garante que client_conversation_kpis e client_agent_kpis existam e sejam consultáveis
-- pelo hook useClientConversationKpis.
--
-- Contexto: a migration 20260324000000_base_tables.sql já cria essas tabelas.
-- Esta migration é idempotente e garante que ambientes que pularam a migration base
-- também tenham os objetos necessários.
--
-- Nota: as tabelas já existem no banco — esta migration é idempotente via
-- CREATE TABLE IF NOT EXISTS e CREATE INDEX IF NOT EXISTS.

-- ============================================================
-- Garante existência da tabela client_conversation_kpis
-- Colunas esperadas pelo hook useClientConversationKpis:
--   client_id, period_date, source, campaign,
--   conversations, bot_finished, human_transfer, leads_identified, conversions
-- ============================================================
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

-- ============================================================
-- Garante existência da tabela client_agent_kpis
-- Colunas esperadas pelo hook useClientConversationKpis:
--   client_id, period_date, agent_name,
--   conversations_started, conversations_finished, conversions
-- ============================================================
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

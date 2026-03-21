-- =============================================================================
-- client_conversation_kpis
-- Tabela ISOLADA para KPIs de conversas automatizadas dos clientes.
-- SEM nenhum vínculo com whatsapp_conversations, whatsapp_messages ou whatsapp_contacts.
-- Dados enviados pelo n8n do cliente via Edge Function autenticada por API Key.
-- =============================================================================

-- 1. Tabela de KPIs diárias por cliente
CREATE TABLE IF NOT EXISTS client_conversation_kpis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  period_date     DATE NOT NULL,
  source          TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp | instagram | facebook
  campaign        TEXT,
  conversations   INTEGER NOT NULL DEFAULT 0,
  bot_finished    INTEGER NOT NULL DEFAULT 0,
  human_transfer  INTEGER NOT NULL DEFAULT 0,
  leads_identified INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Evita duplicidade: uma linha por org+cliente+data+source+campanha
  UNIQUE (organization_id, client_id, period_date, source, campaign)
);

-- 2. Índices de performance
CREATE INDEX IF NOT EXISTS idx_cck_org_date     ON client_conversation_kpis(organization_id, period_date DESC);
CREATE INDEX IF NOT EXISTS idx_cck_client_date  ON client_conversation_kpis(client_id, period_date DESC);
CREATE INDEX IF NOT EXISTS idx_cck_source       ON client_conversation_kpis(source);
CREATE INDEX IF NOT EXISTS idx_cck_campaign     ON client_conversation_kpis(campaign);

-- 3. Tabela de API Keys por cliente (uma key por cliente)
CREATE TABLE IF NOT EXISTS client_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  api_key         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  description     TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_cak_api_key ON client_api_keys(api_key) WHERE active = TRUE;

-- 4. RLS — leitura apenas pela própria organização
ALTER TABLE client_conversation_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_api_keys          ENABLE ROW LEVEL SECURITY;

-- KPIs: membros da org podem ler
CREATE POLICY "org members read kpis"
  ON client_conversation_kpis FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- API Keys: apenas admin/owner da org pode ler
CREATE POLICY "org admin read api keys"
  ON client_api_keys FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Escrita nas duas tabelas: apenas service_role (Edge Function usa service_role key)
-- Nenhuma policy de INSERT/UPDATE/DELETE para roles normais = bloqueado por padrão

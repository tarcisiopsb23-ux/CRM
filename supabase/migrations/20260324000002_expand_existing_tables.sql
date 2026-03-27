-- Migration 2: Expansao das Tabelas Existentes
-- Adiciona campos as tabelas clients e crm_leads, converte status para enum,
-- cria triggers de updated_at e indices de performance.
-- Pre-requisito: Migration 1 deve ter sido executada.

-- Expansao da tabela clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cnpj                VARCHAR(18),
  ADD COLUMN IF NOT EXISTS segment             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS primary_contact     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS phone               VARCHAR(30),
  ADD COLUMN IF NOT EXISTS email               VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address             TEXT,
  ADD COLUMN IF NOT EXISTS client_status       client_status_enum NOT NULL DEFAULT 'prospect',
  ADD COLUMN IF NOT EXISTS contract_start_date DATE;

-- Expansao da tabela crm_leads
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS company         VARCHAR(150),
  ADD COLUMN IF NOT EXISTS origin          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_opportunity  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS potential_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS temperature     lead_temperature_enum NOT NULL DEFAULT 'frio',
  ADD COLUMN IF NOT EXISTS whatsapp_link   TEXT,
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qualified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_reason     TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id     UUID,
  ADD COLUMN IF NOT EXISTS contract_id     UUID,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- Normalizar valores invalidos antes de converter o tipo de status
UPDATE crm_leads
SET status = 'novo'
WHERE status NOT IN (
  'novo', 'contato', 'qualificado', 'proposta', 'negociacao', 'fechado', 'perdido'
);

-- Remover o DEFAULT TEXT antes de converter o tipo (obrigatorio no PostgreSQL)
ALTER TABLE crm_leads ALTER COLUMN status DROP DEFAULT;

-- Converter status de TEXT para lead_status_enum
ALTER TABLE crm_leads
  ALTER COLUMN status TYPE lead_status_enum
  USING status::lead_status_enum;

-- Recriar o DEFAULT agora com o tipo correto
ALTER TABLE crm_leads ALTER COLUMN status SET DEFAULT 'novo';

-- Trigger de updated_at em crm_leads
DROP TRIGGER IF EXISTS set_updated_at ON crm_leads;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Indices em clients
CREATE INDEX IF NOT EXISTS idx_clients_status  ON clients (client_status);
CREATE INDEX IF NOT EXISTS idx_clients_segment ON clients (segment);

-- Indices em crm_leads
CREATE INDEX IF NOT EXISTS idx_crm_leads_status      ON crm_leads (status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_temperature ON crm_leads (temperature);
CREATE INDEX IF NOT EXISTS idx_crm_leads_origin      ON crm_leads (origin);
CREATE INDEX IF NOT EXISTS idx_crm_leads_campaign_id ON crm_leads (campaign_id);

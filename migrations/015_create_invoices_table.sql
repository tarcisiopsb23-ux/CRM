-- =============================================================================
-- Migration 015: Tabela de notas fiscais (NFS-e / NF-e)
-- Vinculada a contratos e pagamentos. Integração via Notaas API.
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id         UUID REFERENCES contracts(id) ON DELETE SET NULL,
  payment_id          UUID REFERENCES payments(id) ON DELETE SET NULL,

  -- Dados da nota
  type                VARCHAR(10) NOT NULL DEFAULT 'nfse',  -- nfse | nfe | nfce
  status              VARCHAR(30) NOT NULL DEFAULT 'pendente',
  -- pendente | processando | autorizada | rejeitada | cancelada

  -- Identificação externa (Notaas)
  notaas_id           VARCHAR(100),
  notaas_protocol     VARCHAR(100),
  numero              VARCHAR(50),
  serie               VARCHAR(10),

  -- Valores
  valor_servico       DECIMAL(15,2) NOT NULL,
  aliquota_iss        DECIMAL(5,2),
  valor_iss           DECIMAL(15,2),
  valor_liquido       DECIMAL(15,2),

  -- Serviço
  codigo_servico      VARCHAR(20),
  descricao_servico   TEXT,
  competencia         VARCHAR(7),  -- YYYY-MM

  -- Tomador (snapshot no momento da emissão)
  tomador_nome        VARCHAR(255),
  tomador_cnpj_cpf    VARCHAR(20),
  tomador_email       VARCHAR(255),
  tomador_endereco    JSONB DEFAULT '{}',

  -- Arquivos
  pdf_url             TEXT,
  xml_url             TEXT,

  -- Controle
  emitida_em          TIMESTAMPTZ,
  cancelada_em        TIMESTAMPTZ,
  motivo_cancelamento TEXT,
  erro_mensagem       TEXT,

  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id       ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id     ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id      ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status          ON invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_competencia     ON invoices(organization_id, competencia);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_all ON invoices;
CREATE POLICY invoices_all ON invoices FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_invoices_updated_at ON invoices;
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_invoices_updated_at();

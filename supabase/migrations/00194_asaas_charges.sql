-- Asaas Charges Integration
-- Sistema de cobranças via Asaas (PIX, Boleto, Cartão)
-- Segue o mesmo padrão das tabelas payments e contracts

-- Tipos de cobrança Asaas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asaas_billing_type') THEN
    CREATE TYPE asaas_billing_type AS ENUM ('pix', 'boleto', 'credit_card');
  END IF;
END $$;

-- Status Asaas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asaas_status') THEN
    CREATE TYPE asaas_status AS ENUM ('pending', 'confirmed', 'received', 'overdue', 'canceled', 'refunded');
  END IF;
END $$;

-- Tabela de cobranças Asaas
CREATE TABLE IF NOT EXISTS public.asaas_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asaas_id TEXT UNIQUE NOT NULL,
  billing_type asaas_billing_type NOT NULL,
  status asaas_status DEFAULT 'pending',
  value DECIMAL(15,2) NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_cpf_cnpj TEXT NOT NULL,
  customer_phone TEXT,
  payment_url TEXT,
  pix_qr_code TEXT,
  pix_expiration_date TIMESTAMPTZ,
  boleto_url TEXT,
  boleto_barcode TEXT,
  boleto_expiration_date DATE,
  card_last_digits TEXT,
  card_brand TEXT,
  card_holder_name TEXT,
  due_date DATE NOT NULL,
  payment_date TIMESTAMPTZ,
  confirmed_date TIMESTAMPTZ,
  webhook_url TEXT,
  last_webhook_at TIMESTAMPTZ,
  webhook_attempts INTEGER DEFAULT 0,
  asaas_response JSONB DEFAULT '{}',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT asaas_charges_value_positive CHECK (value > 0)
);

-- Garantir que todas as colunas existam (para tabelas criadas parcialmente)
ALTER TABLE asaas_charges 
  ADD COLUMN IF NOT EXISTS due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_url TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS pix_expiration_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boleto_url TEXT,
  ADD COLUMN IF NOT EXISTS boleto_barcode TEXT,
  ADD COLUMN IF NOT EXISTS boleto_expiration_date DATE,
  ADD COLUMN IF NOT EXISTS card_last_digits TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asaas_response JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_asaas_charges_payment_id ON asaas_charges(payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_charges_organization_id ON asaas_charges(organization_id);
CREATE INDEX IF NOT EXISTS idx_asaas_charges_status ON asaas_charges(status);
CREATE INDEX IF NOT EXISTS idx_asaas_charges_billing_type ON asaas_charges(billing_type);
CREATE INDEX IF NOT EXISTS idx_asaas_charges_due_date ON asaas_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_asaas_charges_created_at ON asaas_charges(created_at DESC);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trg_asaas_charges_updated_at ON asaas_charges;

CREATE OR REPLACE FUNCTION update_asaas_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asaas_charges_updated_at
  BEFORE UPDATE ON asaas_charges
  FOR EACH ROW
  EXECUTE FUNCTION update_asaas_charges_updated_at();

-- RLS - Segue o mesmo padrão da tabela payments
ALTER TABLE asaas_charges ENABLE ROW LEVEL SECURITY;

-- SELECT: owner/admin/manager/member
DROP POLICY IF EXISTS asaas_charges_select ON asaas_charges;
CREATE POLICY asaas_charges_select ON asaas_charges
  FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
  );

-- INSERT: owner/admin/manager/member
DROP POLICY IF EXISTS asaas_charges_insert ON asaas_charges;
CREATE POLICY asaas_charges_insert ON asaas_charges
  FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
  );

-- UPDATE: owner/admin/manager/member
DROP POLICY IF EXISTS asaas_charges_update ON asaas_charges;
CREATE POLICY asaas_charges_update ON asaas_charges
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin','manager','member']::user_role[])
  );

-- DELETE: owner/admin apenas
DROP POLICY IF EXISTS asaas_charges_delete ON asaas_charges;
CREATE POLICY asaas_charges_delete ON asaas_charges
  FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::user_role[])
  );

-- Função RPC para gerar cobrança
DROP FUNCTION IF EXISTS generate_asaas_charge(UUID, asaas_billing_type, JSONB);

CREATE OR REPLACE FUNCTION generate_asaas_charge(
  p_payment_id UUID,
  p_billing_type asaas_billing_type,
  p_card_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id UUID;
  v_org_id UUID;
  v_value DECIMAL(15,2);
  v_due_date DATE;
  v_client_name TEXT;
  v_client_email TEXT;
  v_client_document TEXT;
  v_client_phone TEXT;
  v_asaas_id TEXT;
  v_charge_id UUID;
BEGIN
  -- Buscar dados do pagamento e cliente
  SELECT 
    p.id, p.organization_id, p.value, p.due_date,
    c.name, c.email, c.document, c.phone
  INTO 
    v_payment_id, v_org_id, v_value, v_due_date,
    v_client_name, v_client_email, v_client_document, v_client_phone
  FROM payments p
  JOIN clients c ON c.id = p.client_id
  WHERE p.id = p_payment_id
  AND p.organization_id = get_user_organization_id();
  
  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pagamento não encontrado');
  END IF;
  
  -- Gerar ID Asaas
  v_asaas_id := 'asaas_' || replace(gen_random_uuid()::text, '-', '');
  
  -- Inserir cobrança
  INSERT INTO asaas_charges (
    payment_id, organization_id, asaas_id, billing_type, status, value,
    customer_name, customer_email, customer_cpf_cnpj, customer_phone, due_date
  ) VALUES (
    p_payment_id, v_org_id, v_asaas_id, p_billing_type, 
    'pending', v_value, v_client_name, v_client_email, 
    COALESCE(v_client_document, '00000000000'), v_client_phone, v_due_date
  ) RETURNING id INTO v_charge_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'charge_id', v_charge_id,
    'asaas_id', v_asaas_id,
    'billing_type', p_billing_type,
    'value', v_value
  );
END;
$$;

-- Função RPC para webhook
DROP FUNCTION IF EXISTS handle_asaas_webhook(TEXT, asaas_status, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION handle_asaas_webhook(
  p_asaas_id TEXT,
  p_status asaas_status,
  p_payment_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_charge RECORD;
BEGIN
  UPDATE asaas_charges 
  SET status = p_status, 
      payment_date = COALESCE(p_payment_date, NOW()),
      last_webhook_at = NOW()
  WHERE asaas_id = p_asaas_id
  RETURNING * INTO v_charge;
  
  IF v_charge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cobrança não encontrada');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'charge_id', v_charge.id);
END;
$$;

-- Função RPC para cancelar cobrança
DROP FUNCTION IF EXISTS cancel_asaas_charge(TEXT);

CREATE OR REPLACE FUNCTION cancel_asaas_charge(
  p_asaas_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_charge RECORD;
BEGIN
  UPDATE asaas_charges 
  SET status = 'canceled',
      updated_at = NOW()
  WHERE asaas_id = p_asaas_id
    AND organization_id = get_user_organization_id()
  RETURNING * INTO v_charge;
  
  IF v_charge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cobrança não encontrada');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'charge_id', v_charge.id, 'status', 'canceled');
END;
$$;

-- Função RPC para listar cobranças
DROP FUNCTION IF EXISTS get_asaas_charges(UUID, asaas_status, asaas_billing_type, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_asaas_charges(
  p_organization_id UUID DEFAULT NULL,
  p_status asaas_status DEFAULT NULL,
  p_billing_type asaas_billing_type DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  payment_id UUID,
  asaas_id TEXT,
  billing_type asaas_billing_type,
  status asaas_status,
  charge_value DECIMAL(15,2),
  customer_name TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.id,
    ac.payment_id,
    ac.asaas_id,
    ac.billing_type,
    ac.status,
    ac.value as charge_value,
    ac.customer_name,
    ac.due_date,
    ac.created_at
  FROM asaas_charges ac
  WHERE ac.organization_id = COALESCE(p_organization_id, get_user_organization_id())
    AND (p_status IS NULL OR ac.status = p_status)
    AND (p_billing_type IS NULL OR ac.billing_type = p_billing_type)
  ORDER BY ac.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Função RPC para estatísticas
DROP FUNCTION IF EXISTS get_asaas_charges_stats(UUID);

CREATE OR REPLACE FUNCTION get_asaas_charges_stats(
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := COALESCE(p_organization_id, get_user_organization_id());
  
  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    'total_value', COALESCE(SUM(value), 0),
    'paid_count', COUNT(*) FILTER (WHERE status = 'received'),
    'paid_value', COALESCE(SUM(value) FILTER (WHERE status = 'received'), 0),
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
    'pending_value', COALESCE(SUM(value) FILTER (WHERE status = 'pending'), 0),
    'pix_count', COUNT(*) FILTER (WHERE billing_type = 'pix'),
    'boleto_count', COUNT(*) FILTER (WHERE billing_type = 'boleto'),
    'credit_card_count', COUNT(*) FILTER (WHERE billing_type = 'credit_card')
  )
  INTO result
  FROM asaas_charges
  WHERE organization_id = v_org_id;
  
  RETURN result;
END;
$$;

-- View para consulta (opcional, mas útil)
CREATE OR REPLACE VIEW asaas_charges_view AS
SELECT 
  ac.*,
  p.description as payment_description,
  c.name as client_name
FROM asaas_charges ac
JOIN payments p ON p.id = ac.payment_id
JOIN clients c ON c.id = p.client_id
WHERE ac.organization_id = get_user_organization_id();

COMMENT ON TABLE asaas_charges IS 'Cobranças geradas via Asaas (PIX, Boleto, Cartão)';
COMMENT ON VIEW asaas_charges_view IS 'View de cobranças Asaas com dados do cliente';

-- =============================================================================
-- MAESTR.IA - Clientes/Contratos: campos para conversão e cobrança
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Clientes: decisor (vindo do Lead)
-- ---------------------------------------------------------------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS decision_maker_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS decision_maker_phone VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_clients_lead_id ON clients(lead_id);

-- ---------------------------------------------------------------------------
-- Contratos: dados para geração de pagamentos e encerramento
-- ---------------------------------------------------------------------------
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_months INTEGER;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_value DECIMAL(15,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_due_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_method VARCHAR(50);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_installments INTEGER DEFAULT 1;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_fees DECIMAL(15,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_split BOOLEAN DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS first_payment_second_due_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS recurring_due_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ended_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_client_status ON contracts(client_id, status);

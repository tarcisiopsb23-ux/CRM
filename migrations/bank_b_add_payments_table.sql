-- Migration: bank_b_add_payments_table.sql
-- Adiciona tabela de cobranças ao Banco B de cada cliente.
-- Execute via provision-client-db ou diretamente no Supabase de cada cliente.
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.client_charges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT        NOT NULL,
  -- Identificação
  asaas_id        TEXT        UNIQUE,                   -- ID da cobrança no Asaas
  description     TEXT        NOT NULL DEFAULT '',
  -- Valores
  value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Datas
  due_date        DATE        NOT NULL,
  payment_date    DATE,
  -- Tipo e status
  billing_type    TEXT        NOT NULL DEFAULT 'PIX'    -- PIX, BOLETO, CREDIT_CARD, UNDEFINED
                  CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  status          TEXT        NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','RECEIVED','CONFIRMED','OVERDUE','REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL','DUNNING_REQUESTED','DUNNING_RECEIVED','AWAITING_RISK_ANALYSIS','CANCELLED')),
  -- Links e chaves
  invoice_url     TEXT,
  bank_slip_url   TEXT,
  pix_qr_code     TEXT,
  pix_copy_paste  TEXT,
  -- Metadados
  external_ref    TEXT,
  notes           TEXT,
  metadata        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_charges_client_id  ON public.client_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_status     ON public.client_charges(status);
CREATE INDEX IF NOT EXISTS idx_client_charges_due_date   ON public.client_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_client_charges_asaas_id   ON public.client_charges(asaas_id);

ALTER TABLE public.client_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.client_charges;
CREATE POLICY "authenticated_access" ON public.client_charges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "no_anon_access" ON public.client_charges;
CREATE POLICY "no_anon_access" ON public.client_charges
  FOR ALL TO anon USING (false);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_client_charges_updated_at ON public.client_charges;
CREATE TRIGGER trg_client_charges_updated_at
  BEFORE UPDATE ON public.client_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.client_charges IS
  'Cobranças do cliente — sincronizadas do Asaas via n8n ou geradas manualmente.';

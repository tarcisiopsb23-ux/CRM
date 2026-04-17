-- Migration: payments_cache
-- Cache de pagamentos replicado do Maestr.IA para exibição no C8 Control.
-- Fonte da verdade: Maestr.IA (crm_payments).
-- O C8 Control nunca escreve pagamentos — apenas lê este cache.

CREATE TABLE IF NOT EXISTS public.payments_cache (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,

  -- Identificadores externos (Maestr.IA + gateways)
  maestria_id     TEXT,                    -- ID do registro em crm_payments no Maestr.IA
  gateway         TEXT,                    -- 'asaas' | 'stripe' | 'manual'
  gateway_id      TEXT,                    -- ID da cobrança no gateway (charge_id, payment_intent_id)
  gateway_url     TEXT,                    -- Link de pagamento (boleto, PIX, checkout)

  -- Dados da cobrança
  description     TEXT        NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  currency        TEXT        NOT NULL DEFAULT 'BRL',
  due_date        DATE,
  paid_at         TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'pago', 'vencido', 'cancelado', 'estornado', 'processando')),
  payment_method  TEXT,                    -- 'boleto' | 'pix' | 'credit_card' | 'debit_card' | 'manual'
  installments    INTEGER     DEFAULT 1,
  notes           TEXT,

  -- Cobrança recorrente
  is_recurring    BOOLEAN     DEFAULT false,
  recurrence_id   TEXT,                    -- ID da assinatura no gateway

  -- Metadados
  metadata        JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_cache_tenant_id  ON public.payments_cache (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_cache_status     ON public.payments_cache (status);
CREATE INDEX IF NOT EXISTS idx_payments_cache_due_date   ON public.payments_cache (due_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_cache_maestria   ON public.payments_cache (maestria_id);

-- RLS: cada tenant vê apenas suas faturas; agência vê todas
ALTER TABLE public.payments_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_cache_tenant_isolation" ON public.payments_cache;
CREATE POLICY "payments_cache_tenant_isolation" ON public.payments_cache
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- Apenas service role pode inserir/atualizar (via edge function sync-payments)
-- Usuários autenticados só leem

-- Tabela para cartões salvos (tokenizados — nunca armazena dados sensíveis)
CREATE TABLE IF NOT EXISTS public.payment_cards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  gateway         TEXT        NOT NULL,    -- 'asaas' | 'stripe'
  gateway_token   TEXT        NOT NULL,    -- token do cartão no gateway (não é o número)
  last4           TEXT,                    -- últimos 4 dígitos (para exibição)
  brand           TEXT,                    -- 'visa' | 'mastercard' | 'elo' | etc.
  holder_name     TEXT,
  exp_month       INTEGER,
  exp_year        INTEGER,
  is_default      BOOLEAN     DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_cards_tenant_id ON public.payment_cards (tenant_id);

ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_cards_tenant_isolation" ON public.payment_cards;
CREATE POLICY "payment_cards_tenant_isolation" ON public.payment_cards
  FOR ALL USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

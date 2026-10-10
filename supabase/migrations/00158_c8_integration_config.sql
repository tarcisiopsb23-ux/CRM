-- =============================================================================
-- Migration 00158: Configuração de integração C8 Control
-- Adiciona suporte à nova arquitetura CRM_URL + CRM_API_KEY
-- =============================================================================

-- 1. Adiciona campo tenant_id em crm_client_plans para rastrear o ID no C8 Control
--    (tenant_id = client_id, mas mantemos o campo para confirmação após provision-tenant)
ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS c8_tenant_id UUID;

COMMENT ON COLUMN public.crm_client_plans.c8_tenant_id IS
  'ID do tenant no banco do C8 Control (retornado por provision-tenant). Geralmente igual ao client_id.';

-- 2. Índice para busca por c8_tenant_id
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_c8_tenant_id
  ON public.crm_client_plans (c8_tenant_id)
  WHERE c8_tenant_id IS NOT NULL;

-- 3. Tabela de cache de pagamentos sincronizados com o C8 Control
CREATE TABLE IF NOT EXISTS public.crm_payments_sync (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payment_id       UUID REFERENCES payments(id) ON DELETE SET NULL,
  tenant_id        UUID NOT NULL,
  maestria_id      TEXT NOT NULL,
  gateway          TEXT NOT NULL DEFAULT 'manual',
  gateway_id       TEXT,
  gateway_url      TEXT,
  status           TEXT NOT NULL DEFAULT 'pendente',
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_payments_sync_client
  ON public.crm_payments_sync (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_crm_payments_sync_payment
  ON public.crm_payments_sync (payment_id)
  WHERE payment_id IS NOT NULL;

ALTER TABLE public.crm_payments_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_payments_sync_all ON public.crm_payments_sync
  FOR ALL
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

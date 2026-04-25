-- =============================================================================
-- Migration 00130: C8 Control Gerencial Module
-- Idempotente: usa IF NOT EXISTS, backfill seguro e blocos DO idempotentes
-- =============================================================================

-- 1. Adicionar novas colunas à crm_client_plans
ALTER TABLE crm_client_plans
  ADD COLUMN IF NOT EXISTS blocked_reason     TEXT,
  ADD COLUMN IF NOT EXISTS contract_start     DATE,
  ADD COLUMN IF NOT EXISTS contract_end       DATE,
  ADD COLUMN IF NOT EXISTS suspended_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primary_user_email TEXT,
  ADD COLUMN IF NOT EXISTS notes              TEXT;

-- plan_name: adicionar se não existir, depois garantir DEFAULT
ALTER TABLE crm_client_plans
  ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'Starter';

ALTER TABLE crm_client_plans
  ALTER COLUMN plan_name SET DEFAULT 'Starter';

-- 2. Backfill: normalizar valores de subscription_status antes de alterar o CHECK
--    (valores legados como 'inadimplente' são mapeados para 'ativo')
UPDATE crm_client_plans
SET subscription_status = 'ativo'
WHERE subscription_status NOT IN ('ativo', 'bloqueado', 'suspenso', 'cancelado');

-- 3. Recriar o CHECK constraint de subscription_status (idempotente via DROP/ADD)
ALTER TABLE crm_client_plans
  DROP CONSTRAINT IF EXISTS crm_client_plans_subscription_status_check;

ALTER TABLE crm_client_plans
  ADD CONSTRAINT crm_client_plans_subscription_status_check
  CHECK (subscription_status IN ('ativo', 'bloqueado', 'suspenso', 'cancelado'));

-- 4. Índices para filtros frequentes
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_status
  ON crm_client_plans (organization_id, subscription_status);

CREATE INDEX IF NOT EXISTS idx_crm_client_plans_contract_end
  ON crm_client_plans (contract_end);

-- 5. Garantir coluna c8_control_enabled na tabela clients (já criada em 00117, mas idempotente)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS c8_control_enabled BOOLEAN NOT NULL DEFAULT false;

-- 6. Adicionar 'c8control' ao enum permission_module (bloco idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_module') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'c8control'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'permission_module')
    ) THEN
      ALTER TYPE permission_module ADD VALUE 'c8control';
    END IF;
  END IF;
END $$;

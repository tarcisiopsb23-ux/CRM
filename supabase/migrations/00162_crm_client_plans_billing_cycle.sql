-- =============================================================================
-- Migration 00162: Adiciona billing_cycle em crm_client_plans
--
-- O billing_cycle existia apenas no catálogo c8_plans mas não era copiado
-- para crm_client_plans no momento do cadastro do contrato.
-- =============================================================================

ALTER TABLE crm_client_plans
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'mensal'
    CHECK (billing_cycle IN ('mensal', 'trimestral', 'semestral', 'anual'));

-- Backfill: tenta preencher a partir do catálogo de planos pelo nome
UPDATE crm_client_plans cp
SET billing_cycle = p.billing_cycle
FROM c8_plans p
WHERE lower(cp.plan_name) = lower(p.name)
  AND cp.billing_cycle IS NULL;

-- Garante que registros sem correspondência ficam com 'mensal'
UPDATE crm_client_plans
SET billing_cycle = 'mensal'
WHERE billing_cycle IS NULL;

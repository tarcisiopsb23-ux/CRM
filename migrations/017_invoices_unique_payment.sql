-- =============================================================================
-- Migration 017: Constraint de unicidade em invoices por payment_id
-- Garante que não existam dois invoices ativos para o mesmo pagamento.
-- "Ativo" = status NOT IN ('rejeitada', 'cancelada')
-- =============================================================================

-- 1. Remove duplicatas existentes, mantendo apenas o registro mais recente
--    (maior created_at) de cada grupo (organization_id, payment_id) ativo
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY organization_id, payment_id
        ORDER BY created_at DESC
      ) AS rn
    FROM invoices
    WHERE payment_id IS NOT NULL
      AND status NOT IN ('rejeitada', 'cancelada')
  ) ranked
  WHERE rn > 1
);

-- 2. Unique partial index: apenas um invoice ativo por payment_id por organização
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_active_payment
  ON invoices (organization_id, payment_id)
  WHERE payment_id IS NOT NULL
    AND status NOT IN ('rejeitada', 'cancelada');

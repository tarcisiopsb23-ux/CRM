-- =============================================================================
-- Migration 019: Adiciona due_date à tabela invoices
--
-- due_date = data de vencimento do pagamento vinculado (payments.due_date).
-- É a referência correta para filtros por período no módulo fiscal,
-- pois um débito pode ter competência em um mês e vencimento em outro.
-- =============================================================================

-- 1. Adiciona a coluna
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- 2. Popula com o due_date do payment vinculado
UPDATE invoices i
SET due_date = p.due_date::DATE
FROM payments p
WHERE i.payment_id = p.id
  AND i.due_date IS NULL
  AND p.due_date IS NOT NULL;

-- 3. Para invoices sem payment vinculado, usa a competência como fallback (primeiro dia do mês)
UPDATE invoices
SET due_date = TO_DATE(competencia || '-01', 'YYYY-MM-DD')
WHERE due_date IS NULL
  AND competencia IS NOT NULL;

-- 4. Índice para filtros por período
CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON invoices(organization_id, due_date);

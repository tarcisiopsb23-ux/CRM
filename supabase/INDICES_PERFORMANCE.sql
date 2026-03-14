-- ============================================================================
-- OTIMIZAÇÃO DE PERFORMANCE - ETAPA 5
-- Índices Adicionais para Views Analíticas
-- ============================================================================
-- Objetivo: Melhorar performance das queries analíticas
-- Execute apenas se necessário (baseado nos testes)
-- ============================================================================

-- ============================================================================
-- ÍNDICES PARA VIEWS FINANCEIRAS
-- ============================================================================

-- Índice para vw_financial_cashflow (payments)
-- Já existe: idx_payments_due_date, idx_payments_status

-- Índice para vw_financial_cashflow (supplier_expenses)
-- Já existe: idx_supplier_expenses_due_date

-- Índice para vw_financial_cashflow (payroll_expenses)
-- Criar se não existir:
CREATE INDEX IF NOT EXISTS idx_payroll_expenses_reference_date ON payroll_expenses(reference_date);
CREATE INDEX IF NOT EXISTS idx_payroll_expenses_status ON payroll_expenses(status);

-- Índice para vw_financial_dre (mesmo que acima)
-- Já cobertos pelos índices acima

-- ============================================================================
-- ÍNDICES PARA VIEWS DE MARKETING
-- ============================================================================

-- Índice crítico para vw_marketing_spend  
-- Nota: não usamos DATE_TRUNC na expressão porque não é IMUTABLE.
-- Em vez disso, confiamos em um índice simples na coluna `date` e em
-- `campaign_id` para acelerar os agrupamentos por mês.
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date_campaign
ON campaign_metrics(date, campaign_id);

-- Índice para vw_marketing_finance_comparison
-- Já existe: idx_campaign_metrics_date (sobre a coluna date)

-- Índice para vw_business_roi
-- Já existe: idx_campaign_metrics_date (sobre a coluna date)

-- ============================================================================
-- ÍNDICES PARA SUPPLIER_EXPENSES (Marketing)
-- ============================================================================

-- Índice para busca por descrição (marketing/ads)
-- Útil para vw_marketing_finance_comparison
CREATE INDEX IF NOT EXISTS idx_supplier_expenses_description_gin
ON supplier_expenses USING gin (to_tsvector('portuguese', description));

-- Índice composto para marketing + data
CREATE INDEX IF NOT EXISTS idx_supplier_expenses_marketing_due_date
ON supplier_expenses(due_date)
WHERE description ILIKE '%marketing%' OR description ILIKE '%ads%' OR description ILIKE '%google%' OR description ILIKE '%meta%' OR description ILIKE '%facebook%';

-- ============================================================================
-- VALIDAÇÃO DOS ÍNDICES CRIADOS
-- ============================================================================

-- Verificar índices criados
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('campaign_metrics', 'supplier_expenses', 'payroll_expenses')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ============================================================================
-- PERFORMANCE TEST (Opcional)
-- ============================================================================

-- Testar performance de uma query crítica
-- EXPLAIN ANALYZE SELECT * FROM vw_marketing_spend WHERE periodo >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months');

-- Testar performance da DRE
-- EXPLAIN ANALYZE SELECT * FROM vw_financial_dre WHERE periodo >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months');

-- ============================================================================
-- TESTES DAS VIEWS - ETAPA 4
-- Validação das Views Analíticas
-- ============================================================================
-- Execute cada bloco no Supabase SQL Editor
-- Verifique se as views retornam dados corretos
-- ============================================================================

-- ============================================================================
-- TESTE 1: vw_financial_cashflow
-- ============================================================================

-- Verificar estrutura da view
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vw_financial_cashflow'
ORDER BY ordinal_position;

-- Verificar dados (últimos 6 meses)
SELECT * FROM vw_financial_cashflow
ORDER BY 1 DESC
LIMIT 200;

-- Verificar totais por categoria
SELECT
  COALESCE(j->>'categoria', j->>'category_id', j->>'category') as categoria,
  COUNT(*) as registros,
  SUM((COALESCE(j->>'valor', j->>'value', j->>'amount'))::numeric) as total_valor,
  AVG((COALESCE(j->>'valor', j->>'value', j->>'amount'))::numeric) as valor_medio
FROM (
  SELECT to_jsonb(vw_financial_cashflow.*) as j
  FROM vw_financial_cashflow
) s
WHERE COALESCE(j->>'valor', j->>'value', j->>'amount') IS NOT NULL
GROUP BY 1
ORDER BY total_valor DESC;

-- ============================================================================
-- TESTE 2: vw_financial_dre
-- ============================================================================

-- Verificar estrutura da view
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vw_financial_dre'
ORDER BY ordinal_position;

-- Verificar dados (últimos 6 meses)
SELECT * FROM vw_financial_dre
ORDER BY 1 DESC
LIMIT 200;

-- ============================================================================
-- TESTE 3: vw_marketing_spend
-- ============================================================================

-- Verificar estrutura da view
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vw_marketing_spend'
ORDER BY ordinal_position;

-- Verificar dados (últimos 3 meses)
SELECT * FROM vw_marketing_spend
ORDER BY 1 DESC
LIMIT 200;

-- ============================================================================
-- TESTE 4: vw_marketing_finance_comparison
-- ============================================================================

-- Verificar estrutura da view
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vw_marketing_finance_comparison'
ORDER BY ordinal_position;

-- Verificar dados (últimos 6 meses)
SELECT * FROM vw_marketing_finance_comparison
ORDER BY 1 DESC
LIMIT 200;

-- ============================================================================
-- TESTE 5: vw_business_roi
-- ============================================================================

-- Verificar estrutura da view
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vw_business_roi'
ORDER BY ordinal_position;

-- Verificar dados (últimos 6 meses)
SELECT * FROM vw_business_roi
ORDER BY 1 DESC
LIMIT 200;

-- ============================================================================
-- VALIDAÇÃO GERAL
-- ============================================================================

-- Verificar se todas as views existem
SELECT
  table_name as view_name,
  'EXISTS' as status
FROM information_schema.views
WHERE table_name IN (
  'vw_financial_cashflow',
  'vw_financial_dre',
  'vw_marketing_spend',
  'vw_marketing_finance_comparison',
  'vw_business_roi'
)
ORDER BY table_name;

-- Contagem de registros por view
SELECT 'vw_financial_cashflow' as view_name, COUNT(*) as registros FROM vw_financial_cashflow
UNION ALL
SELECT 'vw_financial_dre', COUNT(*) FROM vw_financial_dre
UNION ALL
SELECT 'vw_marketing_spend', COUNT(*) FROM vw_marketing_spend
UNION ALL
SELECT 'vw_marketing_finance_comparison', COUNT(*) FROM vw_marketing_finance_comparison
UNION ALL
SELECT 'vw_business_roi', COUNT(*) FROM vw_business_roi
ORDER BY view_name;

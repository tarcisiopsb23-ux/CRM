-- ============================================================================
-- CAMADA ANALÍTICA - ETAPA 3
-- Views SQL para Dashboards Financeiro + Marketing
-- ============================================================================
-- Objetivo: Criar 5 views analíticas sem modificar tabelas existentes
-- Execute cada bloco no Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- VIEW 1: FLUXO DE CAIXA CONSOLIDADO
-- ============================================================================
-- Unifica receitas, despesas e folha de pagamento
-- Agrupa por mês para visão de fluxo de caixa

CREATE OR REPLACE VIEW vw_financial_cashflow AS
SELECT
  DATE_TRUNC('month', due_date)::date as periodo,
  'receitas' as categoria,
  SUM(value) as valor,
  COUNT(*) as quantidade,
  'recebido' as status_agregado
FROM payments
WHERE status = 'pago'
GROUP BY DATE_TRUNC('month', due_date)

UNION ALL

SELECT
  DATE_TRUNC('month', due_date)::date as periodo,
  'despesas_fornecedores' as categoria,
  SUM(value) as valor,
  COUNT(*) as quantidade,
  'pago' as status_agregado
FROM supplier_expenses
WHERE status = 'pago'
GROUP BY DATE_TRUNC('month', due_date)

UNION ALL

SELECT
  DATE_TRUNC('month', reference_date)::date as periodo,
  'folha_pagamento' as categoria,
  SUM(total_value) as valor,
  COUNT(*) as quantidade,
  'pago' as status_agregado
FROM payroll_expenses
WHERE status = 'paid'
GROUP BY DATE_TRUNC('month', reference_date)

ORDER BY periodo DESC, categoria;

-- ============================================================================
-- VIEW 2: DRE SIMPLIFICADO (Demonstração do Resultado do Exercício)
-- ============================================================================
-- Receitas - Despesas = Resultado mensal

CREATE OR REPLACE VIEW vw_financial_dre AS
WITH receitas AS (
  SELECT
    DATE_TRUNC('month', due_date)::date as periodo,
    SUM(value) as total_receitas
  FROM payments
  WHERE status = 'pago'
  GROUP BY DATE_TRUNC('month', due_date)
),
despesas AS (
  SELECT
    DATE_TRUNC('month', due_date)::date as periodo,
    SUM(value) as total_despesas_fornecedores
  FROM supplier_expenses
  WHERE status = 'pago'
  GROUP BY DATE_TRUNC('month', due_date)
),
folha AS (
  SELECT
    DATE_TRUNC('month', reference_date)::date as periodo,
    SUM(total_value) as total_folha
  FROM payroll_expenses
  WHERE status = 'paid'
  GROUP BY DATE_TRUNC('month', reference_date)
)
SELECT
  COALESCE(r.periodo, d.periodo, f.periodo) as periodo,
  COALESCE(r.total_receitas, 0) as receitas,
  COALESCE(d.total_despesas_fornecedores, 0) as despesas_fornecedores,
  COALESCE(f.total_folha, 0) as folha_pagamento,
  COALESCE(r.total_receitas, 0) - COALESCE(d.total_despesas_fornecedores, 0) - COALESCE(f.total_folha, 0) as resultado
FROM receitas r
FULL OUTER JOIN despesas d ON r.periodo = d.periodo
FULL OUTER JOIN folha f ON COALESCE(r.periodo, d.periodo) = f.periodo
ORDER BY periodo DESC;

-- ============================================================================
-- VIEW 3: MARKETING SPEND (Gastos por Campanha)
-- ============================================================================
-- Agrega métricas de campanhas por período

CREATE OR REPLACE VIEW vw_marketing_spend AS
SELECT
  DATE_TRUNC('month', m.date)::date as periodo,
  c.platform,
  c.name as campanha,
  SUM(m.spend) as gasto_total,
  SUM(m.revenue) as receita_total,
  SUM(m.impressions) as impressoes_total,
  SUM(m.clicks) as cliques_total,
  SUM(m.conversions) as conversoes_total,
  ROUND(AVG(m.roas), 2) as roas_medio,
  ROUND(AVG(m.ctr), 2) as ctr_medio,
  ROUND(AVG(m.cpc), 2) as cpc_medio
FROM campaign_metrics m
JOIN campaigns c ON m.campaign_id = c.id
GROUP BY DATE_TRUNC('month', m.date), c.platform, c.name, c.id
ORDER BY periodo DESC, gasto_total DESC;

-- ============================================================================
-- VIEW 4: COMPARATIVO MARKETING vs FINANCEIRO
-- ============================================================================
-- Compara gastos de campanhas vs lançamentos financeiros

CREATE OR REPLACE VIEW vw_marketing_finance_comparison AS
WITH marketing_spend AS (
  SELECT
    DATE_TRUNC('month', date)::date as periodo,
    SUM(spend) as gasto_campanhas
  FROM campaign_metrics
  GROUP BY DATE_TRUNC('month', date)
),
finance_marketing AS (
  SELECT
    DATE_TRUNC('month', due_date)::date as periodo,
    SUM(value) as lancamentos_marketing
  FROM supplier_expenses
  WHERE (
    description ILIKE '%marketing%'
    OR description ILIKE '%ads%'
    OR description ILIKE '%google%'
    OR description ILIKE '%meta%'
    OR description ILIKE '%facebook%'
  )
  AND status = 'pago'
  GROUP BY DATE_TRUNC('month', due_date)
)
SELECT
  COALESCE(m.periodo, f.periodo) as periodo,
  COALESCE(m.gasto_campanhas, 0) as gasto_campanhas,
  COALESCE(f.lancamentos_marketing, 0) as lancamentos_financeiro,
  COALESCE(m.gasto_campanhas, 0) - COALESCE(f.lancamentos_marketing, 0) as diferenca
FROM marketing_spend m
FULL OUTER JOIN finance_marketing f ON m.periodo = f.periodo
ORDER BY periodo DESC;

-- ============================================================================
-- VIEW 5: ROI DE MARKETING (Retorno sobre Investimento)
-- ============================================================================
-- Compara receita real vs gastos em campanhas

CREATE OR REPLACE VIEW vw_business_roi AS
WITH marketing_metrics AS (
  SELECT
    DATE_TRUNC('month', date)::date as periodo,
    SUM(spend) as investimento_marketing,
    SUM(revenue) as receita_atribuida
  FROM campaign_metrics
  GROUP BY DATE_TRUNC('month', date)
),
receitas_reais AS (
  SELECT
    DATE_TRUNC('month', due_date)::date as periodo,
    SUM(value) as receita_total
  FROM payments
  WHERE status = 'pago'
  GROUP BY DATE_TRUNC('month', due_date)
)
SELECT
  COALESCE(m.periodo, r.periodo) as periodo,
  COALESCE(m.investimento_marketing, 0) as investimento_marketing,
  COALESCE(m.receita_atribuida, 0) as receita_atribuida_campanhas,
  COALESCE(r.receita_total, 0) as receita_total_empresa,
  CASE
    WHEN COALESCE(m.investimento_marketing, 0) > 0
    THEN ROUND((COALESCE(m.receita_atribuida, 0) / COALESCE(m.investimento_marketing, 0)), 2)
    ELSE 0
  END as roi_atribuido,
  CASE
    WHEN COALESCE(m.investimento_marketing, 0) > 0
    THEN ROUND((COALESCE(r.receita_total, 0) / COALESCE(m.investimento_marketing, 0)), 2)
    ELSE 0
  END as roi_total
FROM marketing_metrics m
FULL OUTER JOIN receitas_reais r ON m.periodo = r.periodo
ORDER BY periodo DESC;

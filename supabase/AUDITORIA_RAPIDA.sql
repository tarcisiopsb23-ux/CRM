-- ============================================================================
-- AUDITORIA RÁPIDA - ETAPA 1 
-- Validação de Campos Críticos (Tudo em uma query)
-- ============================================================================
-- Execute APENAS este bloco no Supabase SQL Editor
-- Ele valida se TODOS os campos necessários existem
-- ============================================================================

SELECT 
  'payments' as tabela,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='value') as has_value,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='due_date') as has_due_date,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='status') as has_status,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='paid_at') as has_paid_at,
  NULL::boolean as col5, NULL::boolean as col6
UNION ALL
SELECT 
  'supplier_expenses',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='supplier_expenses' AND column_name='value'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='supplier_expenses' AND column_name='due_date'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='supplier_expenses' AND column_name='status'),
  NULL::boolean,
  NULL::boolean, NULL::boolean
UNION ALL
SELECT 
  'payroll_expenses',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_expenses' AND column_name='reference_date'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_expenses' AND column_name='total_value'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_expenses' AND column_name='status'),
  NULL::boolean,
  NULL::boolean, NULL::boolean
UNION ALL
SELECT 
  'campaign_metrics',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaign_metrics' AND column_name='spend'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaign_metrics' AND column_name='revenue'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaign_metrics' AND column_name='date'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaign_metrics' AND column_name='roas'),
  NULL::boolean, NULL::boolean
UNION ALL
SELECT 
  'campaigns',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='platform'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='name'),
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='budget_amount'),
  NULL::boolean,
  NULL::boolean, NULL::boolean
ORDER BY tabela;

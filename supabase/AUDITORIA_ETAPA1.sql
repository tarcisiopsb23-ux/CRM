-- ============================================================================
-- AUDITORIA: Estrutura Atual do Banco Financeiro + Marketing
-- ETAPA 1: Verificação de Compatibilidade
-- ============================================================================
-- Objetivo: Mapear estrutura existente antes de criar camada analítica
-- 
-- Execute cada bloco no Supabase SQL Editor e compartilhe os resultados.
-- NÃO modifique nada. Apenas observe e valide.
-- ============================================================================

-- ============================================================================
-- SEÇÃO 1: TABELAS FINANCEIRAS - Verificação de Estrutura
-- ============================================================================

-- Verificar: payments
-- Necessário: value, due_date, status, paid_at
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'payments'
ORDER BY ordinal_position;

-- Verificar: supplier_expenses
-- Necessário: value, due_date, status
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'supplier_expenses'
ORDER BY ordinal_position;

-- Verificar: payroll_expenses
-- Necessário: reference_date, total_value, status
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'payroll_expenses'
ORDER BY ordinal_position;

-- Verificar: contracts
-- Necessário: value, status, start_date
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'contracts'
ORDER BY ordinal_position;

-- ============================================================================
-- SEÇÃO 2: TABELAS DE MARKETING - Verificação de Estrutura
-- ============================================================================

-- Verificar: campaign_metrics
-- Necessário: spend, revenue, date, campaign_id
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'campaign_metrics'
ORDER BY ordinal_position;

-- Verificar: campaigns
-- Necessário: platform, name, budget_amount
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'campaigns'
ORDER BY ordinal_position;

-- Verificar: ad_accounts
-- Necessário: platform, organization_id
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'ad_accounts'
ORDER BY ordinal_position;

-- ============================================================================
-- SEÇÃO 3: ÍNDICES EXISTENTES
-- ============================================================================

-- Índices em tabelas Financeiras
SELECT 
  t.relname as table_name,
  i.relname as index_name,
  a.attname as column_name,
  ix.indisunique,
  ix.indisprimary
FROM
  pg_class t
  JOIN pg_index ix ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE
  t.relname IN ('payments', 'supplier_expenses', 'payroll_expenses', 'contracts', 'payrolls')
ORDER BY t.relname, i.relname;

-- Índices em tabelas de Marketing
SELECT 
  t.relname as table_name,
  i.relname as index_name,
  a.attname as column_name,
  ix.indisunique,
  ix.indisprimary
FROM
  pg_class t
  JOIN pg_index ix ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE
  t.relname IN ('campaign_metrics', 'campaigns', 'ad_accounts')
ORDER BY t.relname, i.relname;

-- ============================================================================
-- SEÇÃO 4: TIPOS DE DADOS CUSTOMIZADOS (ENUMS)
-- ============================================================================

-- Listar todos os enums
SELECT 
  typname as enum_name,
  enumlabel as enum_value
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
ORDER BY typname, enumsortorder;

-- ============================================================================
-- SEÇÃO 5: RELACIONAMENTOS (FOREIGN KEYS)
-- ============================================================================

-- FKs das tabelas financeiras
SELECT 
  kcu.constraint_name,
  kcu.table_name,
  kcu.column_name,
  ccu.table_name as referenced_table_name,
  ccu.column_name as referenced_column_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.constraint_column_usage ccu 
  ON kcu.constraint_name = ccu.constraint_name 
  AND kcu.table_schema = ccu.table_schema
JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
WHERE kcu.table_name IN ('payments', 'supplier_expenses', 'payroll_expenses', 'contracts', 'payrolls')
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.table_name, kcu.constraint_name;

-- FKs das tabelas de marketing
SELECT 
  kcu.constraint_name,
  kcu.table_name,
  kcu.column_name,
  ccu.table_name as referenced_table_name,
  ccu.column_name as referenced_column_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.constraint_column_usage ccu 
  ON kcu.constraint_name = ccu.constraint_name 
  AND kcu.table_schema = ccu.table_schema
JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
WHERE kcu.table_name IN ('campaign_metrics', 'campaigns', 'ad_accounts')
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.table_name, kcu.constraint_name;

-- ============================================================================
-- SEÇÃO 6: TRIGGERS EXISTENTES
-- ============================================================================

-- Verificar triggers
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE event_object_table IN (
  'payments', 'supplier_expenses', 'payroll_expenses', 'contracts', 'payrolls',
  'campaign_metrics', 'campaigns', 'ad_accounts'
)
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- SEÇÃO 7: AMOSTRA DE DADOS (Apenas contagem)
-- ============================================================================

-- Contagem de registros por tabela
SELECT 'payments' as table_name, COUNT(*) as row_count FROM payments
UNION ALL
SELECT 'supplier_expenses', COUNT(*) FROM supplier_expenses
UNION ALL
SELECT 'payroll_expenses', COUNT(*) FROM payroll_expenses
UNION ALL
SELECT 'contracts', COUNT(*) FROM contracts
UNION ALL
SELECT 'payrolls', COUNT(*) FROM payrolls
UNION ALL
SELECT 'campaign_metrics', COUNT(*) FROM campaign_metrics
UNION ALL
SELECT 'campaigns', COUNT(*) FROM campaigns
UNION ALL
SELECT 'ad_accounts', COUNT(*) FROM ad_accounts
ORDER BY table_name;

-- ============================================================================
-- SEÇÃO 8: VALIDAÇÃO DE CAMPOS CRÍTICOS
-- ============================================================================

-- Verificar se payments tem todos os campos necessários
SELECT 
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payments' AND column_name='value') as has_value,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payments' AND column_name='due_date') as has_due_date,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payments' AND column_name='status') as has_status,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payments' AND column_name='paid_at') as has_paid_at;

-- Verificar se supplier_expenses tem todos os campos necessários
SELECT 
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='supplier_expenses' AND column_name='value') as has_value,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='supplier_expenses' AND column_name='due_date') as has_due_date,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='supplier_expenses' AND column_name='status') as has_status;

-- Verificar se payroll_expenses tem campos necessários
SELECT 
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payroll_expenses' AND column_name='reference_date') as has_reference_date,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payroll_expenses' AND column_name='total_value') as has_total_value,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='payroll_expenses' AND column_name='status') as has_status;

-- Verificar se campaign_metrics tem campos necessários
SELECT 
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaign_metrics' AND column_name='spend') as has_spend,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaign_metrics' AND column_name='revenue') as has_revenue,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaign_metrics' AND column_name='date') as has_date,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaign_metrics' AND column_name='roas') as has_roas;

-- Verificar se campaigns tem campos necessários
SELECT 
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaigns' AND column_name='platform') as has_platform,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaigns' AND column_name='name') as has_name,
  EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name='campaigns' AND column_name='budget_amount') as has_budget_amount;

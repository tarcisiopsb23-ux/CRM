-- ============================================================
-- Migration 00203c: RLS para contract_clause_categories
-- A tabela é global (sem organization_id) e foi criada sem RLS,
-- causando 403 para usuários autenticados.
-- Leitura e escrita liberadas para qualquer autenticado
-- (é uma tabela de configuração da plataforma, não por cliente).
-- ============================================================

ALTER TABLE public.contract_clause_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_clause_categories_read  ON public.contract_clause_categories;
DROP POLICY IF EXISTS contract_clause_categories_write ON public.contract_clause_categories;

-- Qualquer usuário autenticado pode ler e escrever as categorias
CREATE POLICY contract_clause_categories_all ON public.contract_clause_categories
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

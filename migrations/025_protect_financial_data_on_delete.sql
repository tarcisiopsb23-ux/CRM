-- =============================================================================
-- Migration 025: Proteger dados financeiros e históricos na exclusão de registros
--
-- Regra de negócio:
--   - Excluir cliente, fornecedor, projeto ou colaborador NUNCA deve apagar
--     dados financeiros já realizados nem pastas do Drive.
--   - Pastas do Drive só são excluídas manualmente pelo usuário dentro do cadastro.
--   - Dados financeiros realizados (pagamentos, despesas) são preservados como
--     histórico, com a referência ao registro excluído removida (SET NULL).
--   - Dados operacionais sem valor histórico (sessões, integrações de plataforma,
--     acessos de usuário) continuam com CASCADE pois não têm valor após a exclusão.
-- =============================================================================

-- ─── 1. supplier_expenses ────────────────────────────────────────────────────
-- Despesas de fornecedor são dados financeiros realizados — devem ser preservadas.
ALTER TABLE public.supplier_expenses
  DROP CONSTRAINT IF EXISTS supplier_expenses_supplier_id_fkey;

ALTER TABLE public.supplier_expenses
  ADD CONSTRAINT supplier_expenses_supplier_id_fkey
    FOREIGN KEY (supplier_id)
    REFERENCES public.suppliers(id)
    ON DELETE SET NULL;

-- supplier_id agora pode ser NULL (histórico órfão)
ALTER TABLE public.supplier_expenses
  ALTER COLUMN supplier_id DROP NOT NULL;

-- ─── 2. payments — client_id e contract_id ───────────────────────────────────
-- Já tratado em 00046_client_deletion_logic.sql via trigger.
-- Confirma que client_id e contract_id são nullable (idempotente).
ALTER TABLE public.payments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN contract_id DROP NOT NULL;

-- ─── 3. invoices — proteger notas fiscais emitidas ───────────────────────────
-- Notas fiscais emitidas são documentos fiscais — nunca devem ser apagadas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices'
      AND constraint_name = 'invoices_client_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      DROP CONSTRAINT invoices_client_id_fkey;
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_client_id_fkey
        FOREIGN KEY (client_id)
        REFERENCES public.clients(id)
        ON DELETE SET NULL;
    ALTER TABLE public.invoices ALTER COLUMN client_id DROP NOT NULL;
  END IF;
END $$;

-- ─── 4. payroll / folha de pagamento ─────────────────────────────────────────
-- Se existir tabela de folha vinculada a profiles/employees, preservar histórico.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_entries') THEN
    -- Torna profile_id nullable para preservar histórico após exclusão do colaborador
    ALTER TABLE public.payroll_entries ALTER COLUMN profile_id DROP NOT NULL;
  END IF;
END $$;

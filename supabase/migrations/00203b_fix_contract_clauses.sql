-- ============================================================
-- Migration 00203b: Correção do estado parcial do 00203
-- Remove a coluna "content" (JSONB NOT NULL) que sobrou da
-- migration 060, após os dados terem sido migrados para
-- html_content no 00203.
-- ============================================================

DO $$
BEGIN
  -- Dá DEFAULT antes de remover para não bloquear nenhum INSERT em paralelo
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'content'
  ) THEN
    ALTER TABLE public.contract_clauses ALTER COLUMN content SET DEFAULT '{}';
    ALTER TABLE public.contract_clauses DROP COLUMN content;
  END IF;

  -- Remove também as colunas antigas caso o 00203 não as tenha removido ainda
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'condition_type'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN condition_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'condition_value'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN condition_value;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'is_editable'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN is_editable;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_clauses' AND column_name = 'service_id'
  ) THEN
    ALTER TABLE public.contract_clauses DROP COLUMN service_id;
  END IF;
END $$;

-- Limpa registros legados sem category_key para o seed recriar corretamente
DELETE FROM public.contract_clauses WHERE category_key = '' OR category_key IS NULL;

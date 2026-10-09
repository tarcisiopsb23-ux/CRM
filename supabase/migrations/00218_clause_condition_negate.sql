-- ============================================================
-- Migration 00218: Inversão de condição em contract_clauses
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Adiciona condition_negate BOOLEAN:
--   false (default) → inclui a alínea quando a condição é VERDADEIRA
--   true            → inclui a alínea quando a condição é FALSA
--                     (equivalente a "ocultar quando condição for verdadeira")
--
-- Exemplo: condition_type='has_guarantees' + condition_negate=true
--   → inclui a alínea apenas quando NÃO há garantias no contrato.
-- ============================================================

ALTER TABLE public.contract_clauses
  ADD COLUMN IF NOT EXISTS condition_negate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contract_clauses.condition_negate IS
  'false = inclui quando condição é verdadeira (padrão).
   true  = inclui quando condição é falsa (ocultar quando verdadeiro).';

-- ── Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('clause_condition_negate_v1')
ON CONFLICT (version) DO NOTHING;

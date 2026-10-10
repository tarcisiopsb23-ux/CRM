-- =============================================================================
-- Migration 090: Carência manual em contracts_v2
--
-- Adiciona a coluna grace_period_months em contracts_v2 para registrar
-- o período de carência definido no contrato (meses sem cobrança no início,
-- sem alterar o prazo contratual total).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Coluna de carência ─────────────────────────────────────────────────────
-- Número de meses sem cobrança no início do contrato.
-- NULL = sem carência. O prazo do contrato não é alterado por este campo.
ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS grace_period_months INTEGER
    CHECK (grace_period_months IS NULL OR grace_period_months >= 0);

COMMENT ON COLUMN public.contracts_v2.grace_period_months IS
  'Meses de carência: período sem cobrança no início do contrato. Não altera o prazo contratual.';

-- ── 2. Versão ─────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('090_contracts_v2_grace_period_v1')
ON CONFLICT (version) DO NOTHING;

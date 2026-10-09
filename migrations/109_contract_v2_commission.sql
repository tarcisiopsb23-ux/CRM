-- =============================================================================
-- Migration 109: Suporte a comissão variável nos contratos v2
--
-- 1. Adiciona contract_v2_id (FK → contracts_v2) em contract_variable_results
--    permitindo vincular resultados tanto a contratos legados (contract_id)
--    quanto aos novos contratos v2 (contract_v2_id). Os dois são nullable;
--    ao menos um deve estar preenchido.
--
-- 2. Adiciona commission_type para distinguir:
--    - 'percent_value'  : comissão = total_result × commission_pct / 100
--    - 'fixed_per_unit' : comissão = result_quantity × commission_rate_fixed
--
-- 3. Adiciona result_quantity e commission_rate_fixed para suportar o modo
--    fixed_per_unit (R$ fixo por resultado/unidade).
--
-- 4. Adiciona commission_description — texto livre que explica o que
--    configura um "resultado" (ex: "contrato fechado", "lead convertido").
--
-- 5. Remove a UNIQUE constraint rígida (contract_id, reference_month) e
--    cria uma nova que cobre os dois casos: legado e v2.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. FK para contracts_v2 ───────────────────────────────────────────────────

ALTER TABLE public.contract_variable_results
  ADD COLUMN IF NOT EXISTS contract_v2_id UUID
    REFERENCES public.contracts_v2(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cvr_contract_v2_id
  ON public.contract_variable_results(contract_v2_id);

-- ── 2. Tipo de comissão ───────────────────────────────────────────────────────

ALTER TABLE public.contract_variable_results
  ADD COLUMN IF NOT EXISTS commission_type TEXT
    NOT NULL DEFAULT 'percent_value'
    CHECK (commission_type IN ('percent_value', 'fixed_per_unit'));

-- ── 3. Campos para modo fixed_per_unit ───────────────────────────────────────

-- Quantidade de resultados registrados no mês (contratos fechados, leads, etc.)
ALTER TABLE public.contract_variable_results
  ADD COLUMN IF NOT EXISTS result_quantity INTEGER NOT NULL DEFAULT 0;

-- Valor fixo por resultado no modo fixed_per_unit (snapshot do contrato)
ALTER TABLE public.contract_variable_results
  ADD COLUMN IF NOT EXISTS commission_rate_fixed NUMERIC(12,2);

-- ── 4. Descrição do resultado ─────────────────────────────────────────────────

ALTER TABLE public.contract_variable_results
  ADD COLUMN IF NOT EXISTS commission_description TEXT;

-- ── 5. Ajuste de UNIQUE constraint ───────────────────────────────────────────

-- Remove constraint existente (legado — apenas contract_id + reference_month)
ALTER TABLE public.contract_variable_results
  DROP CONSTRAINT IF EXISTS contract_variable_results_contract_id_reference_month_key;

-- Cria índices únicos parciais separados para cada FK
-- (um resultado por mês por contrato legado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cvr_legacy_month
  ON public.contract_variable_results(contract_id, reference_month)
  WHERE contract_v2_id IS NULL;

-- (um resultado por mês por contrato v2)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cvr_v2_month
  ON public.contract_variable_results(contract_v2_id, reference_month)
  WHERE contract_v2_id IS NOT NULL;

-- ── 6. Versão ─────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('109_contract_v2_commission_v1')
ON CONFLICT (version) DO NOTHING;

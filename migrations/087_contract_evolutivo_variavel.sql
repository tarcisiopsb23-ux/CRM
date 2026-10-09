-- =============================================================================
-- Migration 087: Tipos de contrato Evolutivo e Variável
--
-- 1. Adiciona valores 'evolutivo' e 'variavel' ao enum contract_type_enum
-- 2. Cria tabela contract_variable_results — histórico de resultados variáveis
--    por contrato (contratos do tipo 'variavel')
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Enum ───────────────────────────────────────────────────────────────────

ALTER TYPE public.contract_type_enum ADD VALUE IF NOT EXISTS 'evolutivo';
ALTER TYPE public.contract_type_enum ADD VALUE IF NOT EXISTS 'variavel';

-- ── 2. Tabela de resultados variáveis ─────────────────────────────────────────
--
-- Cada linha representa um registro mensal de resultado do cliente para fins
-- de apuração da comissão variável.
--
-- Campos:
--   contract_id       — contrato ao qual o resultado se refere
--   organization_id   — organização (para RLS)
--   client_id         — cliente (desnormalizado para facilitar queries)
--   reference_month   — mês de referência (primeiro dia do mês, ex: 2026-08-01)
--   result_type       — 'contrato_individual' ou 'faturamento_global'
--
--   Para result_type = 'contrato_individual':
--     individual_contracts  — JSONB array de {date, value, description?}
--     total_result          — soma dos valores individuais (calculado ao salvar)
--
--   Para result_type = 'faturamento_global':
--     total_result          — faturamento total do mês
--     revenue_baseline      — faturamento médio base (snapshot dos últimos 12m)
--     incremental_result    — total_result - revenue_baseline (calculado)
--
--   commission_pct        — percentual da comissão (snapshot do contrato)
--   commission_base       — base de cálculo (total_result ou incremental_result)
--   commission_value      — comissão apurada = commission_base * commission_pct / 100
--   due_date              — data de vencimento da cobrança da comissão
--   payment_id            — lançamento gerado em payments (NULL até ser gerado)
--   notes                 — observações opcionais

CREATE TABLE IF NOT EXISTS public.contract_variable_results (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id          UUID        NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id            UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reference_month      DATE        NOT NULL, -- sempre o dia 1 do mês
  result_type          TEXT        NOT NULL CHECK (result_type IN ('contrato_individual', 'faturamento_global')),
  individual_contracts JSONB       DEFAULT '[]'::jsonb, -- [{date, value, description?}]
  total_result         NUMERIC(15,2) NOT NULL DEFAULT 0,
  revenue_baseline     NUMERIC(15,2), -- só para faturamento_global
  incremental_result   NUMERIC(15,2), -- só para faturamento_global
  commission_pct       NUMERIC(6,4) NOT NULL, -- ex: 10.0000
  commission_base      NUMERIC(15,2) NOT NULL,
  commission_value     NUMERIC(15,2) NOT NULL,
  due_date             DATE        NOT NULL,
  payment_id           UUID        REFERENCES public.payments(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_cvr_contract_id    ON public.contract_variable_results(contract_id);
CREATE INDEX IF NOT EXISTS idx_cvr_client_id      ON public.contract_variable_results(client_id);
CREATE INDEX IF NOT EXISTS idx_cvr_reference_month ON public.contract_variable_results(reference_month);
CREATE INDEX IF NOT EXISTS idx_cvr_organization_id ON public.contract_variable_results(organization_id);

-- RLS
ALTER TABLE public.contract_variable_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cvr_all" ON public.contract_variable_results;
CREATE POLICY "cvr_all" ON public.contract_variable_results
  FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_variable_results TO authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public._set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cvr_updated_at ON public.contract_variable_results;
CREATE TRIGGER trg_cvr_updated_at
  BEFORE UPDATE ON public.contract_variable_results
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

-- ── 3. Versão ─────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('087_contract_evolutivo_variavel_v1')
ON CONFLICT (version) DO NOTHING;

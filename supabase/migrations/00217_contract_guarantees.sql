-- ============================================================
-- Migration 00217: Garantias de contrato baseadas em KPIs
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- 1. Tabela contract_guarantees — uma por KPI vinculada ao contrato
-- 2. Coluna has_guarantees em contracts_v2 — flag para condition_type
-- ============================================================

-- ── 1. Tabela contract_guarantees ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_guarantees (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID        NOT NULL REFERENCES public.contracts_v2(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- KPI vinculada (existente ou criada no momento da garantia)
  kpi_id           UUID        REFERENCES public.client_kpis(id) ON DELETE SET NULL,
  -- Nome da KPI (snapshot — preservado mesmo se kpi_id for removido)
  kpi_name         TEXT        NOT NULL,
  -- Unidade da KPI (snapshot): currency | percentage | number
  kpi_unit         TEXT        NOT NULL DEFAULT 'number'
    CHECK (kpi_unit IN ('currency', 'percentage', 'number')),

  -- Meta de crescimento percentual comprometida no contrato
  growth_percent   NUMERIC(6,2) NOT NULL,          -- ex: 30.00 = 30%

  -- Valor de referência inicial (base para calcular o crescimento)
  -- NULL = será definido com base no valor atual da KPI no início do contrato
  base_value       NUMERIC(18,2),

  -- Prazo final para atingir a meta (data ISO)
  deadline         DATE        NOT NULL,

  -- Notas internas (não aparecem no contrato)
  notes            TEXT,

  display_order    INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_contract
  ON public.contract_guarantees(contract_id, display_order);

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_kpi
  ON public.contract_guarantees(kpi_id)
  WHERE kpi_id IS NOT NULL;

ALTER TABLE public.contract_guarantees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_guarantees_org ON public.contract_guarantees;
CREATE POLICY contract_guarantees_org ON public.contract_guarantees
  FOR ALL USING (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_contract_guarantees_updated ON public.contract_guarantees;
CREATE TRIGGER update_contract_guarantees_updated
  BEFORE UPDATE ON public.contract_guarantees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.contract_guarantees IS
  'Garantias de resultado comprometidas no contrato, cada uma vinculada a
   uma KPI do cliente com meta percentual de crescimento e prazo.';

COMMENT ON COLUMN public.contract_guarantees.growth_percent IS
  'Percentual de crescimento comprometido. Ex: 30 = crescimento de 30% sobre base_value.';

COMMENT ON COLUMN public.contract_guarantees.base_value IS
  'Valor de referência inicial da KPI. NULL = será determinado no início da vigência.';

COMMENT ON COLUMN public.contract_guarantees.deadline IS
  'Data limite para atingir a meta. Usada na cláusula de garantia do contrato.';

-- ── 2. Flag has_guarantees em contracts_v2 ────────────────────────────────────
-- Coluna derivada: atualizada por trigger ao inserir/remover garantias.
-- Permite uso como condition_type no sistema de cláusulas condicionais.

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS has_guarantees BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contracts_v2.has_guarantees IS
  'true quando o contrato possui ao menos uma garantia cadastrada.
   Usado pelo condition_type ''has_guarantees'' nas cláusulas condicionais.';

-- ── 3. Trigger: mantém has_guarantees sincronizado ──────────────────────────

CREATE OR REPLACE FUNCTION public.sync_contract_has_guarantees()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contracts_v2
      SET has_guarantees = true
      WHERE id = NEW.contract_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.contracts_v2
      SET has_guarantees = EXISTS (
        SELECT 1 FROM public.contract_guarantees
        WHERE contract_id = OLD.contract_id
      )
      WHERE id = OLD.contract_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contract_has_guarantees ON public.contract_guarantees;
CREATE TRIGGER trg_sync_contract_has_guarantees
  AFTER INSERT OR DELETE ON public.contract_guarantees
  FOR EACH ROW EXECUTE FUNCTION public.sync_contract_has_guarantees();

-- ── 4. Schema migrations version ─────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('contract_guarantees_v1')
ON CONFLICT (version) DO NOTHING;

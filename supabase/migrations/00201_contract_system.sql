-- ============================================================
-- Migration 00201: Sistema de Contratos Modular
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- A tabela contract_templates já existe (migration 055) com:
--   id, organization_id, name, content, is_default,
--   created_at, updated_at, structure
--
-- Esta migration:
--   1. Adiciona colunas de timbrado/margens em contract_templates
--   2. Cria contract_service_blocks (novo)
--   3. Cria contracts_v2 (novo — não conflita com contracts existente)
--   4. Cria contract_payment_schedule (novo)
--   5. Sequência e RPC de numeração
-- ============================================================

-- ── 1. Estende contract_templates com colunas de timbrado ────────────────────

ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS html_content    TEXT;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS letterhead_url  TEXT;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS header_url      TEXT;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS footer_url      TEXT;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS header_height   INTEGER DEFAULT 120;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS footer_height   INTEGER DEFAULT 80;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS margin_top      INTEGER DEFAULT 30;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS margin_bottom   INTEGER DEFAULT 25;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS margin_left     INTEGER DEFAULT 25;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS margin_right    INTEGER DEFAULT 20;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS description     TEXT;

-- Migra content → html_content para tabelas que já tinham content preenchido
UPDATE public.contract_templates
SET html_content = content
WHERE html_content IS NULL AND content IS NOT NULL AND content <> '';

-- Índice para listar templates ativos
CREATE INDEX IF NOT EXISTS idx_contract_templates_org_active
  ON public.contract_templates(organization_id, is_active);

-- ── 2. Blocos de serviço (tabela nova) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_service_blocks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug            TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  html_content    TEXT        NOT NULL DEFAULT '',
  has_setup       BOOLEAN     NOT NULL DEFAULT false,
  setup_amount    NUMERIC(12,2),
  has_monthly     BOOLEAN     NOT NULL DEFAULT false,
  monthly_amount  NUMERIC(12,2),
  grace_months    INTEGER     DEFAULT 0,
  is_one_time     BOOLEAN     NOT NULL DEFAULT false,
  one_time_amount NUMERIC(12,2),
  display_order   INTEGER     NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_contract_service_blocks_org
  ON public.contract_service_blocks(organization_id, is_active, display_order);

ALTER TABLE public.contract_service_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_service_blocks_org ON public.contract_service_blocks;
CREATE POLICY contract_service_blocks_org ON public.contract_service_blocks
  FOR ALL USING (organization_id = get_user_organization_id());

-- Trigger updated_at para contract_service_blocks
DROP TRIGGER IF EXISTS update_contract_service_blocks_updated ON public.contract_service_blocks;
CREATE TRIGGER update_contract_service_blocks_updated
  BEFORE UPDATE ON public.contract_service_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 3. Contratos v2 (tabela nova — não conflita com contracts existente) ──────

CREATE TABLE IF NOT EXISTS public.contracts_v2 (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id           UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id         UUID        REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  proposal_id         TEXT,
  contract_number     TEXT,
  title               TEXT        NOT NULL DEFAULT 'Contrato de Prestação de Serviços',
  service_slugs       TEXT[]      NOT NULL DEFAULT '{}',
  variables           JSONB       NOT NULL DEFAULT '{}',
  html_content        TEXT,
  due_day             INTEGER,
  first_payment_date  DATE,
  total_monthly       NUMERIC(12,2),
  total_setup         NUMERIC(12,2),
  status              TEXT        NOT NULL DEFAULT 'rascunho'
                      CHECK (status IN ('rascunho','enviado','assinado','cancelado','encerrado')),
  signed_at           TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  start_date          DATE,
  end_date            DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_v2_org
  ON public.contracts_v2(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_v2_client
  ON public.contracts_v2(client_id);

ALTER TABLE public.contracts_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_v2_org ON public.contracts_v2;
CREATE POLICY contracts_v2_org ON public.contracts_v2
  FOR ALL USING (organization_id = get_user_organization_id());

DROP TRIGGER IF EXISTS update_contracts_v2_updated ON public.contracts_v2;
CREATE TRIGGER update_contracts_v2_updated
  BEFORE UPDATE ON public.contracts_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. Cronograma de pagamento ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_payment_schedule (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID        NOT NULL REFERENCES public.contracts_v2(id) ON DELETE CASCADE,
  line_order      INTEGER     NOT NULL DEFAULT 0,
  month_from      INTEGER     NOT NULL DEFAULT 1,
  month_to        INTEGER,
  period_label    TEXT        NOT NULL DEFAULT '',
  due_date        DATE,
  is_recurring    BOOLEAN     NOT NULL DEFAULT false,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method  TEXT        NOT NULL DEFAULT 'pix'
                  CHECK (payment_method IN ('pix','cartao','boleto','transferencia')),
  line_type       TEXT        NOT NULL DEFAULT 'mensalidade'
                  CHECK (line_type IN ('setup','mensalidade','unico','outro')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_payment_schedule_contract
  ON public.contract_payment_schedule(contract_id, line_order);

ALTER TABLE public.contract_payment_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_payment_schedule_org ON public.contract_payment_schedule;
CREATE POLICY contract_payment_schedule_org ON public.contract_payment_schedule
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.contracts_v2 c
      WHERE c.id = contract_id
        AND c.organization_id = get_user_organization_id()
    )
  );

-- ── 5. Sequência e RPC de numeração ──────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_contract_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   TEXT;
  v_seq    TEXT;
  v_prefix TEXT;
BEGIN
  v_year   := to_char(now(), 'YYYY');
  v_seq    := lpad(nextval('contract_number_seq')::TEXT, 3, '0');
  SELECT upper(substring(regexp_replace(name, '[^A-Za-z]', '', 'g'), 1, 2))
  INTO v_prefix
  FROM public.organizations WHERE id = p_org_id;
  v_prefix := COALESCE(v_prefix, 'C8');
  RETURN format('%s-%s-%s', v_prefix, v_year, v_seq);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_contract_number(UUID) TO authenticated;

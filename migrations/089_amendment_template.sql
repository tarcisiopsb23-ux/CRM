-- =============================================================================
-- Migration 089: Suporte a template de aditivo
--
-- 1. Adiciona coluna template_type em contract_templates
--    para distinguir templates de contrato dos de aditivo.
-- 2. Adiciona amendment_template_id em contracts
--    para vincular um template de aditivo específico (override da org).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Tipo do template ───────────────────────────────────────────────────────
-- 'contrato' (padrão) ou 'aditivo'
ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'contrato'
    CHECK (template_type IN ('contrato', 'aditivo'));

-- Índice para busca por tipo
CREATE INDEX IF NOT EXISTS idx_contract_templates_type
  ON public.contract_templates(organization_id, template_type, is_active);

-- ── 2. Override de template de aditivo por contrato ──────────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS amendment_template_id UUID
    REFERENCES public.contract_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contract_templates.template_type IS
  'Tipo do template: contrato (padrão) ou aditivo';

COMMENT ON COLUMN public.contracts.amendment_template_id IS
  'Template de aditivo a usar para este contrato (sobrepõe o padrão da org)';

-- ── 3. Versão ─────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('089_amendment_template_v1')
ON CONFLICT (version) DO NOTHING;

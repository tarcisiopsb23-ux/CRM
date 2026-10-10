-- ============================================================
-- Migration 00200: Tabela de templates de e-mail
-- Banco A (Maestr.ia)
--
-- Cada organização pode personalizar os templates padrão ou
-- criar os seus. Quando um template customizado é "excluído",
-- apenas o custom_html é removido — o template padrão permanece.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug            TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  subject         TEXT        NOT NULL,
  html_body       TEXT        NOT NULL,
  design_json     JSONB,                 -- design do Unlayer para reedição visual
  variables       JSONB       NOT NULL DEFAULT '[]',
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug, is_default)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_org_slug
  ON public.email_templates(organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_email_templates_active
  ON public.email_templates(organization_id, is_active);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_org ON public.email_templates;
CREATE POLICY email_templates_org ON public.email_templates
  FOR ALL
  USING (organization_id = get_user_organization_id());

CREATE OR REPLACE FUNCTION public.set_email_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_email_templates_updated_at();

-- Idempotente: garante design_json em bancos onde a migration já rodou antes
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS design_json JSONB;

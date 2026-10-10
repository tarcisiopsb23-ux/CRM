-- ============================================================
-- Migration 067: proposal_templates
-- Armazena o template padrão de propostas por organização.
-- Campos hero, seções padrão e config padrão do cronograma.
-- Idempotente — pode ser executada múltiplas vezes sem erro.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Hero padrão
  hero_logo_url       TEXT,
  hero_image_url      TEXT,
  hero_title          TEXT        NOT NULL DEFAULT '',
  hero_subtitle       TEXT,
  hero_message        TEXT,
  hero_video_url      TEXT,
  hero_whatsapp_text  TEXT        NOT NULL DEFAULT 'Falar no WhatsApp',
  hero_whatsapp_number TEXT,
  hero_cta_text       TEXT        NOT NULL DEFAULT 'Aprovar Proposta',
  hero_cta_color      TEXT        NOT NULL DEFAULT '#16a34a',

  -- Seções padrão (JSONB: { section_key: { content, is_visible } })
  default_sections    JSONB       NOT NULL DEFAULT '{}',

  -- Configuração padrão do cronograma financeiro
  default_recurrence  TEXT        NOT NULL DEFAULT 'mensal'
                        CHECK (default_recurrence IN ('mensal','trimestral','semestral','anual')),
  default_installments INTEGER    NOT NULL DEFAULT 12
                        CHECK (default_installments BETWEEN 1 AND 360),
  default_due_day      INTEGER    NOT NULL DEFAULT 10
                        CHECK (default_due_day BETWEEN 1 AND 31),

  -- Garantia de um único template por org
  is_default          BOOLEAN     NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_templates_org_unique UNIQUE (organization_id)
);

-- Atualiza updated_at automaticamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_proposal_templates_updated'
      AND event_object_table = 'proposal_templates'
  ) THEN
    CREATE TRIGGER update_proposal_templates_updated
      BEFORE UPDATE ON public.proposal_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS
ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'proposal_templates'
      AND policyname = 'proposal_templates_org'
  ) THEN
    CREATE POLICY "proposal_templates_org" ON public.proposal_templates
      FOR ALL
      USING  (organization_id = get_user_organization_id())
      WITH CHECK (organization_id = get_user_organization_id());
  END IF;
END $$;

-- Índice
CREATE INDEX IF NOT EXISTS idx_proposal_templates_org
  ON public.proposal_templates(organization_id);

-- Schema migrations version
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('proposal_templates_v1')
ON CONFLICT (version) DO NOTHING;

-- ============================================================
-- Migration 00206: Adiciona slug ao service_catalog
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- O slug identifica o serviço para vinculação com cláusulas
-- condicionais e seleção no ContractGenerator.
-- Gerado automaticamente a partir do name ao criar/atualizar.
-- ============================================================

-- 1. Adiciona coluna slug
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Preenche slugs existentes a partir do name
--    Converte para minúsculas, substitui espaços e caracteres
--    especiais por underscore, remove acentos via unaccent se disponível
DO $$
BEGIN
  -- Tenta usar unaccent (extensão opcional)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') THEN
    UPDATE public.service_catalog
    SET slug = regexp_replace(
      lower(unaccent(name)), '[^a-z0-9]+', '_', 'g'
    )
    WHERE slug IS NULL OR slug = '';
  ELSE
    -- Sem unaccent: normaliza manualmente as letras acentuadas mais comuns
    UPDATE public.service_catalog
    SET slug = regexp_replace(
      lower(
        translate(name,
          'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        )
      ), '[^a-z0-9]+', '_', 'g'
    )
    WHERE slug IS NULL OR slug = '';
  END IF;
END $$;

-- Limpa underscores iniciais/finais
UPDATE public.service_catalog
SET slug = trim(both '_' from slug)
WHERE slug IS NOT NULL;

-- 3. Em caso de slugs duplicados na mesma org, sufixar com número
DO $$
DECLARE
  r RECORD;
  cnt INTEGER;
BEGIN
  FOR r IN
    SELECT organization_id, slug, COUNT(*) as n
    FROM public.service_catalog
    WHERE slug IS NOT NULL
    GROUP BY organization_id, slug
    HAVING COUNT(*) > 1
  LOOP
    cnt := 1;
    UPDATE public.service_catalog
    SET slug = slug || '_' || cnt
    WHERE ctid IN (
      SELECT ctid FROM public.service_catalog
      WHERE organization_id = r.organization_id AND slug = r.slug
      ORDER BY created_at
      OFFSET 1
    );
    cnt := cnt + 1;
  END LOOP;
END $$;

-- 4. Define NOT NULL e UNIQUE após preenchimento
ALTER TABLE public.service_catalog
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.service_catalog
  ALTER COLUMN slug SET DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_catalog_org_slug_unique'
      AND table_name = 'service_catalog'
  ) THEN
    ALTER TABLE public.service_catalog
      ADD CONSTRAINT service_catalog_org_slug_unique
      UNIQUE (organization_id, slug);
  END IF;
END $$;

-- 5. Schema migrations version
INSERT INTO public.schema_migrations (version)
VALUES ('service_catalog_slug_v1')
ON CONFLICT (version) DO NOTHING;

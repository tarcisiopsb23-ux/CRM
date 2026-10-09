-- =============================================================================
-- Migration 068: Adiciona coluna cidade à tabela leads (Banco A)
--
-- Historicamente, a cidade do lead era gravada no JSONB metadata.cidade.
-- Esta migration promove o campo para uma coluna TEXT dedicada, com um índice
-- para facilitar buscas/filtros por cidade.
--
-- Idempotente: pode ser executada múltiplas vezes sem erro.
-- =============================================================================

-- ── Adicionar coluna ──────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cidade TEXT;

-- ── Índice ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_cidade
  ON public.leads (organization_id, cidade)
  WHERE cidade IS NOT NULL;

-- ── Backfill: migrar dados existentes de metadata.cidade → coluna cidade ──────
-- Só atualiza linhas que ainda não têm a coluna preenchida mas têm o valor
-- em metadata, evitando sobrescrever dados já migrados.

UPDATE public.leads
SET cidade = (metadata->>'cidade')
WHERE cidade IS NULL
  AND metadata->>'cidade' IS NOT NULL
  AND metadata->>'cidade' <> '';

-- ── Comentário ────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.leads.cidade IS
  'Cidade do lead. Promovida do JSONB metadata.cidade para coluna dedicada '
  'na migration 068. Backfill automático a partir do metadata existente.';

-- ── Versão ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('068_leads_add_cidade')
ON CONFLICT (version) DO NOTHING;

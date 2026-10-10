-- =============================================================================
-- Migration 091: Adiciona status "emitido" em contracts_v2
--
-- O fluxo de status passa a ser:
--   rascunho → emitido (PDF gerado) → assinado (cliente assinou)
--   → cancelado | encerrado
--
-- O status "enviado" era um placeholder — substituído por "emitido" que tem
-- semântica clara: PDF foi gerado, qualquer alteração invalida o documento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Remove o CHECK constraint antigo e recria com "emitido" ────────────────
-- Usamos DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT para ser idempotente.

ALTER TABLE public.contracts_v2
  DROP CONSTRAINT IF EXISTS contracts_v2_status_check;

ALTER TABLE public.contracts_v2
  ADD CONSTRAINT contracts_v2_status_check
    CHECK (status IN ('rascunho', 'emitido', 'assinado', 'cancelado', 'encerrado'));

-- ── 2. Migra registros existentes com status "enviado" → "emitido" ────────────
UPDATE public.contracts_v2
SET status = 'emitido'
WHERE status = 'enviado';

-- ── 3. Versão ─────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version)
VALUES ('091_contracts_v2_status_emitido_v1')
ON CONFLICT (version) DO NOTHING;

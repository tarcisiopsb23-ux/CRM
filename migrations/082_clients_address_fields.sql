-- =============================================================================
-- Migration 082: Campos de endereço complementares na tabela clients
--
-- Adiciona colunas que já existem no formulário mas não na tabela:
--   address_number       — número do imóvel
--   address_complement   — complemento (apto, sala, bloco)
--   address_neighborhood — bairro
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS address_number       TEXT,
  ADD COLUMN IF NOT EXISTS address_complement   TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;

COMMENT ON COLUMN public.clients.address_number       IS 'Número do imóvel';
COMMENT ON COLUMN public.clients.address_complement   IS 'Complemento do endereço (apto, sala, bloco)';
COMMENT ON COLUMN public.clients.address_neighborhood IS 'Bairro';

INSERT INTO public.schema_migrations (version)
VALUES ('082_clients_address_fields_v1')
ON CONFLICT (version) DO NOTHING;

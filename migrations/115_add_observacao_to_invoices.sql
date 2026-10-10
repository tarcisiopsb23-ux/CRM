-- =============================================================================
-- Migration 115: Adiciona campo observacao na tabela invoices
--
-- Armazena a observação livre que aparece na NFS-e (ex: dados de pagamento PIX).
-- Coluna nullable — retrocompatível com notas já emitidas.
-- =============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS observacao TEXT;

COMMENT ON COLUMN public.invoices.observacao IS 'Observação livre incluída na NFS-e (ex: dados para pagamento via PIX)';

INSERT INTO public.schema_migrations (version)
VALUES ('115_add_observacao_to_invoices_v1')
ON CONFLICT (version) DO NOTHING;

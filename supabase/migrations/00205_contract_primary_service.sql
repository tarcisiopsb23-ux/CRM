-- ============================================================
-- Migration 00205: Serviço principal do contrato
-- Banco A (Maestr.ia) — Totalmente idempotente
--
-- Adiciona primary_service_slug em contracts_v2:
--   - Identifica qual serviço é o objeto principal do contrato
--   - Usado nas variáveis {{servico_principal}} e {{servico_principal_slug}}
--   - Influencia o título padrão do contrato
-- ============================================================

ALTER TABLE public.contracts_v2
  ADD COLUMN IF NOT EXISTS primary_service_slug TEXT;

COMMENT ON COLUMN public.contracts_v2.primary_service_slug IS
  'Slug do serviço principal do contrato (objeto). '
  'Deve estar presente em service_slugs. '
  'Gera as variáveis {{servico_principal}} e {{servico_principal_slug}} no documento.';

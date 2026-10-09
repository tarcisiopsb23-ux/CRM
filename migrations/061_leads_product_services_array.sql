-- =============================================================================
-- Migration 061: product_services (TEXT[]) na tabela leads (Banco A)
-- Aplicar no Banco A (banco da agência) via Supabase SQL Editor
-- Idempotente — pode ser executado múltiplas vezes sem erro
--
-- Contexto: o campo product_service (VARCHAR único) é substituído por
-- product_services (TEXT[]) para permitir múltiplos produtos/serviços por lead.
-- O campo antigo product_service é mantido intacto para compatibilidade.
-- =============================================================================

-- 1. Adicionar nova coluna array
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS product_services TEXT[] DEFAULT '{}';

-- 2. Migrar dados existentes: copiar valor único → array de um elemento
UPDATE leads
SET product_services = ARRAY[product_service]
WHERE product_service IS NOT NULL
  AND (product_services IS NULL OR product_services = '{}');

-- 3. Índice GIN para buscas eficientes no array (ex: WHERE product_services @> '{gmn}')
CREATE INDEX IF NOT EXISTS idx_leads_product_services
  ON leads USING GIN (product_services);

-- 4. Registrar versão
INSERT INTO schema_migrations (version)
VALUES ('061_leads_product_services_array')
ON CONFLICT (version) DO NOTHING;

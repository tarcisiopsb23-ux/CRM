-- =============================================================================
-- Migration 012: Adiciona colunas address_number, address_complement e address_neighborhood
-- em clients e suppliers para separar endereço em campos distintos
-- =============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS address_number       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_complement   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_neighborhood VARCHAR(255);

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS address_number       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_complement   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_neighborhood VARCHAR(255);

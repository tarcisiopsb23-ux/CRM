-- =============================================================================
-- Migration 00081: Soft delete — is_active em clients e suppliers
-- =============================================================================
-- profiles já tem is_active. Adicionamos em clients e suppliers.
-- REGRA: nunca apagar dados — apenas desativar/reativar.
-- =============================================================================

ALTER TABLE clients   ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Índices para filtros rápidos
CREATE INDEX IF NOT EXISTS idx_clients_is_active   ON clients(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(organization_id, is_active);

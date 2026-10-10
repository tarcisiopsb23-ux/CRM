-- =============================================================================
-- Migration 013: Adiciona coluna asaas_id na tabela clients
-- Armazena o ID do cliente no Asaas para integração de cobranças
-- =============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS asaas_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_clients_asaas_id ON clients(asaas_id) WHERE asaas_id IS NOT NULL;

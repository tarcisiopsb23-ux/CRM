-- =============================================================================
-- Migration 00160: crm_client_users — suporte ao usuário principal
--
-- 1. Torna user_id nullable (usuário principal pode não ter feito login ainda)
-- 2. Adiciona coluna is_primary para identificar o usuário principal do contrato
-- 3. Adiciona coluna is_support para excluir usuários de suporte das contagens
-- =============================================================================

ALTER TABLE crm_client_users
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE crm_client_users
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_support BOOLEAN NOT NULL DEFAULT false;

-- Índice para facilitar busca de usuários não-suporte por cliente
CREATE INDEX IF NOT EXISTS idx_crm_client_users_client_not_support
  ON crm_client_users(client_id, is_support)
  WHERE is_support = false;

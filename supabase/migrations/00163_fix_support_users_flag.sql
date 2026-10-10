-- =============================================================================
-- Migration 00163: Corrige flag is_support em crm_client_users
--
-- Marca como is_support = true todos os registros cujo e-mail
-- corresponde a um usuário de suporte registrado em c8_support_passwords.
-- Garante que usuários de suporte não sejam contabilizados nos limites.
-- =============================================================================

UPDATE crm_client_users cu
SET is_support = true
FROM c8_support_passwords sp
WHERE cu.client_id = sp.client_id
  AND lower(cu.email) = lower(sp.support_email)
  AND cu.is_support = false;

-- Remove registros de suporte que possam ter sido inseridos como is_primary
UPDATE crm_client_users cu
SET is_primary = false
FROM c8_support_passwords sp
WHERE cu.client_id = sp.client_id
  AND lower(cu.email) = lower(sp.support_email);

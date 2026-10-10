-- =============================================================================
-- Migration 00161: Backfill do usuário principal em crm_client_users
--
-- Para todos os planos existentes que têm primary_user_email preenchido,
-- insere o usuário principal em crm_client_users caso ainda não exista.
-- Depende da migration 00160 (user_id nullable, is_primary, is_support).
-- =============================================================================

INSERT INTO crm_client_users (
  organization_id,
  client_id,
  user_id,
  email,
  name,
  active,
  is_primary,
  is_support
)
SELECT
  p.organization_id,
  p.client_id,
  NULL,                        -- user_id desconhecido até o primeiro login
  p.primary_user_email,
  NULL,                        -- nome será preenchido após o primeiro acesso
  true,
  true,
  false
FROM crm_client_plans p
WHERE
  p.primary_user_email IS NOT NULL
  AND p.primary_user_email <> ''
  -- Só insere se ainda não existe registro para esse client_id + email
  AND NOT EXISTS (
    SELECT 1
    FROM crm_client_users u
    WHERE u.client_id = p.client_id
      AND lower(u.email) = lower(p.primary_user_email)
  );

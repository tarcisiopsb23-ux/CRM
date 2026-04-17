-- Migration: 20260516000004_tenant_users_owner_role.sql
-- Adiciona 'owner' como role válida em tenant_users para usuários de suporte.

ALTER TABLE tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_role_check;

ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('admin', 'member', 'agency', 'owner'));

-- Migration: 20260516000001_tenant_users_agency_role.sql
--
-- Adiciona 'agency' como role válida em tenant_users.
-- Usuários de suporte/agência são registrados com role='agency' para
-- rastreamento, mantendo isolamento por tenant no RLS.

ALTER TABLE tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_role_check;

ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('admin', 'member', 'agency'));

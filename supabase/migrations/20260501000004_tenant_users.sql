-- Migration: 20260501000004_tenant_users.sql
-- Cria a tabela tenant_users no CRM_DB para rastrear usuários por tenant.
--
-- IMPORTANTE: Usuários de suporte (role='support' no JWT) NUNCA são inseridos
-- nesta tabela. O acesso deles é controlado exclusivamente pelo JWT claim role='support'.
-- A contagem de usuários ativos de um tenant usa COUNT(*) FROM tenant_users WHERE tenant_id = ?
-- e NUNCA inclui usuários de suporte.

CREATE TABLE IF NOT EXISTS tenant_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  tenant_id   UUID NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id   ON tenant_users (user_id);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_users_isolation" ON tenant_users;
CREATE POLICY "tenant_users_isolation" ON tenant_users
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

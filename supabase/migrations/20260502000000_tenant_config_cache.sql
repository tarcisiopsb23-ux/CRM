-- Migration: 20260502000000_tenant_config_cache.sql
--
-- Cache local das configurações de tenant vindas do Maestr.ia.
-- Populado exclusivamente pela Edge Function tenant-status (service role key).
-- Usuários autenticados só leem — nunca escrevem diretamente nesta tabela.
--
-- Sincronização: Edge Function tenant-status invocada no login e a cada 30min.
-- Fonte de verdade: Maestr.ia (crm_tenant_config via crm-tenant-api).

CREATE TABLE IF NOT EXISTS tenant_config_cache (
  tenant_id      UUID        PRIMARY KEY,
  status         TEXT        NOT NULL DEFAULT 'ativo'
                             CHECK (status IN ('ativo', 'bloqueado', 'suspenso', 'cancelado')),
  max_users      INTEGER     NOT NULL DEFAULT 3,
  plan_name      TEXT        NOT NULL DEFAULT 'Starter',
  blocked_reason TEXT,
  contract_end   DATE,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_config_cache_status
  ON tenant_config_cache (status);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE tenant_config_cache ENABLE ROW LEVEL SECURITY;

-- SELECT: cada tenant vê apenas seu próprio registro
-- Support (role='support') vê todos os registros para poder verificar qualquer tenant
DROP POLICY IF EXISTS "tenant_config_cache_select" ON tenant_config_cache;
CREATE POLICY "tenant_config_cache_select" ON tenant_config_cache
  FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- INSERT e UPDATE: sem política para usuários autenticados
-- Apenas service role key (Edge Function tenant-status) pode escrever
-- O service role bypassa RLS por definição no Supabase

-- ============================================================
-- Nota de segurança
-- ============================================================
-- A ausência de políticas FOR INSERT e FOR UPDATE para usuários autenticados
-- garante que nenhum usuário do CRM pode manipular seu próprio status de acesso.
-- Toda escrita nesta tabela ocorre exclusivamente via Edge Function tenant-status
-- usando a SUPABASE_SERVICE_ROLE_KEY.

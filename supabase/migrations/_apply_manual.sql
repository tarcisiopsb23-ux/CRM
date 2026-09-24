-- ============================================================
-- Script consolidado para aplicar no SQL Editor do Supabase
-- Projeto: xcymhcqbyyuozkzhpxgi (C8 Control)
-- Todas as instruções são idempotentes (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ── 1. Colunas de plano/contrato na tabela clients ────────────────────────
-- (Migration: 20260516000000_clients_plan_fields.sql)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS max_users      INTEGER,
  ADD COLUMN IF NOT EXISTS plan_name      TEXT,
  ADD COLUMN IF NOT EXISTS plan_value     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS billing_cycle  TEXT,
  ADD COLUMN IF NOT EXISTS due_day        INTEGER CHECK (due_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS contract_end   DATE;


-- ── 2. c8_control_enabled em clients ──────────────────────────────────────
-- (Migration: 00117_c8_control_enabled.sql)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS c8_control_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_c8_control
  ON public.clients (c8_control_enabled);


-- ── 3. RPC get_crm_client_by_slug ─────────────────────────────────────────
-- (Migration: 00120_crm_slug_rpc.sql)
-- Busca cliente CRM pelo dashboard_slug, retornando dados básicos do tenant.

CREATE OR REPLACE FUNCTION public.get_crm_client_by_slug(p_slug TEXT)
RETURNS TABLE (
  client_id          UUID,
  name               TEXT,
  favicon_url        TEXT,
  c8_control_enabled BOOLEAN,
  client_status      TEXT,
  plan_name          TEXT,
  max_users          INTEGER,
  contract_end       DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.favicon_url,
    c.c8_control_enabled,
    c.client_status::TEXT,
    c.plan_name,
    c.max_users,
    c.contract_end
  FROM clients c
  WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_client_by_slug TO anon, authenticated;


-- ── 4. Função auto_block_overdue (usa tenant_config_cache) ────────────────
-- (Migration: 00121_crm_auto_block.sql — adaptada para C8 Control)

CREATE OR REPLACE FUNCTION auto_block_overdue_crm_clients()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Marcar tenants com contract_end vencido como inativo
  UPDATE clients
  SET client_status = 'inativo'
  WHERE client_status = 'ativo'
    AND contract_end IS NOT NULL
    AND contract_end < CURRENT_DATE;

  -- Atualizar tenant_config_cache refletindo o status
  UPDATE tenant_config_cache tcc
  SET status = 'bloqueado'
  FROM clients c
  WHERE tcc.tenant_id = c.tenant_id
    AND c.client_status = 'inativo'
    AND tcc.status = 'ativo';
END;
$$;


-- ── 5. Marcar migration como aplicada no histórico do CLI ────────────────
-- Garante que o supabase db push não tente reaplicar

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20260516000000', 'clients_plan_fields', ARRAY[
    'ALTER TABLE clients ADD COLUMN IF NOT EXISTS max_users INTEGER, ADD COLUMN IF NOT EXISTS plan_name TEXT, ADD COLUMN IF NOT EXISTS plan_value NUMERIC(10,2), ADD COLUMN IF NOT EXISTS billing_cycle TEXT, ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day BETWEEN 1 AND 28), ADD COLUMN IF NOT EXISTS contract_end DATE'
  ])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('00117', 'c8_control_enabled', ARRAY[
    'ALTER TABLE clients ADD COLUMN IF NOT EXISTS c8_control_enabled BOOLEAN NOT NULL DEFAULT false'
  ])
ON CONFLICT (version) DO NOTHING;

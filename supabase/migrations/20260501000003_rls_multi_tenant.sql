-- Migration: 20260501000003_rls_multi_tenant.sql
-- Substitui políticas anon_all_* por isolamento por tenant_id extraído do JWT.
-- Usuários com role='support' no JWT bypassam o filtro de tenant.

-- ============================================================
-- clients
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_clients" ON clients;
DROP POLICY IF EXISTS "clients_tenant_isolation" ON clients;
CREATE POLICY "clients_tenant_isolation" ON clients
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- campaign_data
-- ============================================================
ALTER TABLE campaign_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_campaign_data" ON campaign_data;
DROP POLICY IF EXISTS "campaign_data_tenant_isolation" ON campaign_data;
CREATE POLICY "campaign_data_tenant_isolation" ON campaign_data
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- daily_metrics
-- ============================================================
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_daily_metrics" ON daily_metrics;
DROP POLICY IF EXISTS "daily_metrics_tenant_isolation" ON daily_metrics;
CREATE POLICY "daily_metrics_tenant_isolation" ON daily_metrics
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- client_kpis
-- ============================================================
ALTER TABLE client_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_client_kpis" ON client_kpis;
DROP POLICY IF EXISTS "client_kpis_tenant_isolation" ON client_kpis;
CREATE POLICY "client_kpis_tenant_isolation" ON client_kpis
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- client_kpi_history
-- ============================================================
ALTER TABLE client_kpi_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_client_kpi_history" ON client_kpi_history;
DROP POLICY IF EXISTS "client_kpi_history_tenant_isolation" ON client_kpi_history;
CREATE POLICY "client_kpi_history_tenant_isolation" ON client_kpi_history
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- crm_leads
-- ============================================================
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_crm_leads" ON crm_leads;
DROP POLICY IF EXISTS "crm_leads_tenant_isolation" ON crm_leads;
CREATE POLICY "crm_leads_tenant_isolation" ON crm_leads
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- ad_click_sessions
-- ============================================================
ALTER TABLE ad_click_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_ad_click_sessions" ON ad_click_sessions;
DROP POLICY IF EXISTS "ad_click_sessions_tenant_isolation" ON ad_click_sessions;
CREATE POLICY "ad_click_sessions_tenant_isolation" ON ad_click_sessions
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- client_conversation_kpis
-- ============================================================
ALTER TABLE client_conversation_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_client_conversation_kpis" ON client_conversation_kpis;
DROP POLICY IF EXISTS "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis;
CREATE POLICY "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR (auth.jwt() ->> 'role') = 'support'
  );

-- ============================================================
-- oauth_tokens (opcional — aplica apenas se a tabela existir)
-- Usa format() para evitar problemas de escape de aspas no EXECUTE dinâmico
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oauth_tokens'
  ) THEN
    EXECUTE 'ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "anon_all_oauth_tokens" ON oauth_tokens';
    EXECUTE 'DROP POLICY IF EXISTS "oauth_tokens_tenant_isolation" ON oauth_tokens';
    EXECUTE format(
      'CREATE POLICY "oauth_tokens_tenant_isolation" ON oauth_tokens'
      ' FOR ALL'
      ' USING (tenant_id = (auth.jwt() ->> %L)::UUID OR (auth.jwt() ->> %L) = %L)'
      ' WITH CHECK (tenant_id = (auth.jwt() ->> %L)::UUID OR (auth.jwt() ->> %L) = %L)',
      'tenant_id', 'role', 'support',
      'tenant_id', 'role', 'support'
    );
  END IF;
END $$;

-- ============================================================
-- contracts (opcional — aplica apenas se a tabela existir)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contracts'
  ) THEN
    EXECUTE 'ALTER TABLE contracts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "anon_all_contracts" ON contracts';
    EXECUTE 'DROP POLICY IF EXISTS "contracts_tenant_isolation" ON contracts';
    EXECUTE format(
      'CREATE POLICY "contracts_tenant_isolation" ON contracts'
      ' FOR ALL'
      ' USING (tenant_id = (auth.jwt() ->> %L)::UUID OR (auth.jwt() ->> %L) = %L)'
      ' WITH CHECK (tenant_id = (auth.jwt() ->> %L)::UUID OR (auth.jwt() ->> %L) = %L)',
      'tenant_id', 'role', 'support',
      'tenant_id', 'role', 'support'
    );
  END IF;
END $$;

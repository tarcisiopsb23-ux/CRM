-- Migration: 20260502000001_rls_agency_role.sql
--
-- Atualiza todas as políticas RLS para reconhecer role='agency' como bypass.
-- Usuários da agência (owner/admin/manager/member do Maestr.ia) recebem
-- role='agency' no JWT via custom_access_token_hook, com tenant_id=null.
-- O role 'viewer' do Maestr.ia não tem acesso ao CRM (bloqueado no login).
--
-- Esta migration substitui as políticas que usavam role='support' por
-- role IN ('agency', 'support') para manter compatibilidade retroativa.
-- O alias 'support' continua funcionando durante a transição.

-- Helper: verifica se o usuário é da agência (bypass de RLS)
CREATE OR REPLACE FUNCTION public.is_agency_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'role') IN ('agency', 'support')
$$;

-- ============================================================
-- Recriar políticas de todas as tabelas com is_agency_user()
-- ============================================================

-- clients
DROP POLICY IF EXISTS "clients_tenant_isolation" ON clients;
CREATE POLICY "clients_tenant_isolation" ON clients
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- campaign_data
DROP POLICY IF EXISTS "campaign_data_tenant_isolation" ON campaign_data;
CREATE POLICY "campaign_data_tenant_isolation" ON campaign_data
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- daily_metrics
DROP POLICY IF EXISTS "daily_metrics_tenant_isolation" ON daily_metrics;
CREATE POLICY "daily_metrics_tenant_isolation" ON daily_metrics
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- client_kpis
DROP POLICY IF EXISTS "client_kpis_tenant_isolation" ON client_kpis;
CREATE POLICY "client_kpis_tenant_isolation" ON client_kpis
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- client_kpi_history
DROP POLICY IF EXISTS "client_kpi_history_tenant_isolation" ON client_kpi_history;
CREATE POLICY "client_kpi_history_tenant_isolation" ON client_kpi_history
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- crm_leads
DROP POLICY IF EXISTS "crm_leads_tenant_isolation" ON crm_leads;
CREATE POLICY "crm_leads_tenant_isolation" ON crm_leads
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- ad_click_sessions
DROP POLICY IF EXISTS "ad_click_sessions_tenant_isolation" ON ad_click_sessions;
CREATE POLICY "ad_click_sessions_tenant_isolation" ON ad_click_sessions
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- client_conversation_kpis
DROP POLICY IF EXISTS "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis;
CREATE POLICY "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- client_agent_kpis
DROP POLICY IF EXISTS "client_agent_kpis_tenant_isolation" ON client_agent_kpis;
CREATE POLICY "client_agent_kpis_tenant_isolation" ON client_agent_kpis
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- tenant_users
DROP POLICY IF EXISTS "tenant_users_isolation" ON tenant_users;
CREATE POLICY "tenant_users_isolation" ON tenant_users
  FOR ALL
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- tenant_config_cache
DROP POLICY IF EXISTS "tenant_config_cache_select" ON tenant_config_cache;
CREATE POLICY "tenant_config_cache_select" ON tenant_config_cache
  FOR SELECT
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    OR public.is_agency_user()
  );

-- oauth_tokens (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oauth_tokens'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "oauth_tokens_tenant_isolation" ON oauth_tokens';
    EXECUTE format(
      'CREATE POLICY "oauth_tokens_tenant_isolation" ON oauth_tokens'
      ' FOR ALL'
      ' USING (tenant_id = (auth.jwt() ->> %L)::UUID OR public.is_agency_user())'
      ' WITH CHECK (tenant_id = (auth.jwt() ->> %L)::UUID OR public.is_agency_user())',
      'tenant_id', 'tenant_id'
    );
  END IF;
END $$;

-- contracts (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contracts'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "contracts_tenant_isolation" ON contracts';
    EXECUTE format(
      'CREATE POLICY "contracts_tenant_isolation" ON contracts'
      ' FOR ALL'
      ' USING (tenant_id = (auth.jwt() ->> %L)::UUID OR public.is_agency_user())'
      ' WITH CHECK (tenant_id = (auth.jwt() ->> %L)::UUID OR public.is_agency_user())',
      'tenant_id', 'tenant_id'
    );
  END IF;
END $$;

-- Políticas de tabelas filhas (via lead pai)
DROP POLICY IF EXISTS "lead_interactions_tenant_isolation" ON lead_interactions;
CREATE POLICY "lead_interactions_tenant_isolation" ON lead_interactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_interactions.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_interactions.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  );

DROP POLICY IF EXISTS "lead_tags_tenant_isolation" ON lead_tags;
CREATE POLICY "lead_tags_tenant_isolation" ON lead_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_tags.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_tags.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  );

DROP POLICY IF EXISTS "lead_followups_tenant_isolation" ON lead_followups;
CREATE POLICY "lead_followups_tenant_isolation" ON lead_followups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_followups.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_followups.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  );

DROP POLICY IF EXISTS "lead_stage_history_tenant_isolation" ON crm_lead_stage_history;
CREATE POLICY "lead_stage_history_tenant_isolation" ON crm_lead_stage_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = crm_lead_stage_history.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = crm_lead_stage_history.lead_id
        AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user())
    )
  );

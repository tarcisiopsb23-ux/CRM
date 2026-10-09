-- Migration: 20260516000003_fix_jwt_role_claim.sql
--
-- PROBLEMA RAIZ: O Supabase usa o claim "role" do JWT para executar
-- SET LOCAL ROLE antes de cada query. Se role="agency", o Postgres tenta
-- SET ROLE agency e falha com "role agency does not exist".
--
-- SOLUÇÃO: Mover o role da aplicação para o claim "app_role" no JWT.
-- O claim "role" fica vazio ou com valor de database role válido (authenticated).
-- Todas as políticas RLS passam a ler de auth.jwt() ->> 'app_role'.
--
-- Também cria o database role "agency" no Postgres para compatibilidade
-- durante a transição (caso tokens antigos ainda circulem em cache).

-- ── 1. Criar database role 'agency' para compatibilidade com tokens antigos ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agency') THEN
    CREATE ROLE agency;
    -- Dar mesmas permissões que 'authenticated' para não quebrar RLS
    GRANT authenticated TO agency;
  END IF;
END $$;

-- ── 2. Atualizar JWT hook para usar 'app_role' em vez de 'role' ─────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant_id TEXT;
  v_role      TEXT;
BEGIN
  v_tenant_id := event->'claims'->'user_metadata'->>'tenant_id';
  v_role      := COALESCE(event->'claims'->'user_metadata'->>'role', 'member');

  -- Usuários da agência SEM tenant_id → app_role = 'agency'
  IF v_tenant_id IS NULL AND v_role IN ('owner', 'admin', 'manager', 'member', 'support') THEN
    RETURN jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(event, '{claims,tenant_id}', 'null'::jsonb),
          '{claims,app_role}', '"agency"'::jsonb
        ),
        '{claims,agency_role}', to_jsonb(v_role)
      ),
      -- Manter role como 'authenticated' para o Postgres não tentar SET ROLE agency
      '{claims,role}', '"authenticated"'::jsonb
    );
  END IF;

  -- Usuários de suporte COM tenant_id (is_support=true) → app_role = 'agency'
  IF v_role = 'agency' THEN
    RETURN jsonb_set(
      jsonb_set(
        jsonb_set(event, '{claims,tenant_id}', to_jsonb(v_tenant_id)),
        '{claims,app_role}', '"agency"'::jsonb
      ),
      '{claims,role}', '"authenticated"'::jsonb
    );
  END IF;

  -- Usuários normais do CRM (admin/member) → app_role = role original
  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(event, '{claims,tenant_id}',
        CASE WHEN v_tenant_id IS NOT NULL THEN to_jsonb(v_tenant_id) ELSE 'null'::jsonb END
      ),
      '{claims,app_role}', to_jsonb(v_role)
    ),
    '{claims,role}', '"authenticated"'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

-- ── 3. Atualizar is_agency_user() para ler de app_role ────────────────────
CREATE OR REPLACE FUNCTION public.is_agency_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'app_role') IN ('agency', 'support')
    OR (auth.jwt() ->> 'role') IN ('agency', 'support')  -- fallback tokens antigos
$$;

-- ── 4. Recriar TODAS as políticas RLS usando app_role ──────────────────────

-- Helper: condição de acesso por tenant ou agency
-- tenant_id = JWT tenant_id  OU  app_role IN (agency, support)  OU  role antigo (fallback)
-- Encapsulado em is_agency_user() para brevidade

-- clients
DROP POLICY IF EXISTS "clients_tenant_isolation" ON clients;
CREATE POLICY "clients_tenant_isolation" ON clients FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- campaign_data
DROP POLICY IF EXISTS "campaign_data_tenant_isolation" ON campaign_data;
CREATE POLICY "campaign_data_tenant_isolation" ON campaign_data FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- daily_metrics
DROP POLICY IF EXISTS "daily_metrics_tenant_isolation" ON daily_metrics;
CREATE POLICY "daily_metrics_tenant_isolation" ON daily_metrics FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- client_kpis
DROP POLICY IF EXISTS "client_kpis_tenant_isolation" ON client_kpis;
CREATE POLICY "client_kpis_tenant_isolation" ON client_kpis FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- client_kpi_history
DROP POLICY IF EXISTS "client_kpi_history_tenant_isolation" ON client_kpi_history;
CREATE POLICY "client_kpi_history_tenant_isolation" ON client_kpi_history FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- crm_leads
DROP POLICY IF EXISTS "crm_leads_tenant_isolation" ON crm_leads;
CREATE POLICY "crm_leads_tenant_isolation" ON crm_leads FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- ad_click_sessions
DROP POLICY IF EXISTS "ad_click_sessions_tenant_isolation" ON ad_click_sessions;
CREATE POLICY "ad_click_sessions_tenant_isolation" ON ad_click_sessions FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- client_conversation_kpis
DROP POLICY IF EXISTS "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis;
CREATE POLICY "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- client_agent_kpis
DROP POLICY IF EXISTS "client_agent_kpis_tenant_isolation" ON client_agent_kpis;
CREATE POLICY "client_agent_kpis_tenant_isolation" ON client_agent_kpis FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- oauth_tokens
DROP POLICY IF EXISTS "oauth_tokens_tenant_isolation" ON oauth_tokens;
CREATE POLICY "oauth_tokens_tenant_isolation" ON oauth_tokens FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- contracts
DROP POLICY IF EXISTS "contracts_tenant_isolation" ON contracts;
CREATE POLICY "contracts_tenant_isolation" ON contracts FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- tenant_users
DROP POLICY IF EXISTS "tenant_users_isolation" ON tenant_users;
CREATE POLICY "tenant_users_isolation" ON tenant_users FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- tenant_config_cache
DROP POLICY IF EXISTS "tenant_config_cache_select" ON tenant_config_cache;
CREATE POLICY "tenant_config_cache_select" ON tenant_config_cache FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON public.audit_logs;
CREATE POLICY "audit_logs_tenant_isolation" ON public.audit_logs FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- payments_cache
DROP POLICY IF EXISTS "payments_cache_tenant_isolation" ON public.payments_cache;
CREATE POLICY "payments_cache_tenant_isolation" ON public.payments_cache FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

DROP POLICY IF EXISTS "payment_cards_tenant_isolation" ON public.payment_cards;
CREATE POLICY "payment_cards_tenant_isolation" ON public.payment_cards FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user());

-- lead_interactions
DROP POLICY IF EXISTS "lead_interactions_tenant_isolation" ON lead_interactions;
CREATE POLICY "lead_interactions_tenant_isolation" ON lead_interactions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_interactions.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_interactions.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ));

-- lead_tags
DROP POLICY IF EXISTS "lead_tags_tenant_isolation" ON lead_tags;
CREATE POLICY "lead_tags_tenant_isolation" ON lead_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_tags.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_tags.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ));

-- lead_followups
DROP POLICY IF EXISTS "lead_followups_tenant_isolation" ON lead_followups;
CREATE POLICY "lead_followups_tenant_isolation" ON lead_followups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_followups.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_followups.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ));

-- crm_lead_stage_history
DROP POLICY IF EXISTS "lead_stage_history_tenant_isolation" ON crm_lead_stage_history;
CREATE POLICY "lead_stage_history_tenant_isolation" ON crm_lead_stage_history FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = crm_lead_stage_history.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = crm_lead_stage_history.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR is_agency_user())
  ));

-- Migration: 20260516000002_rls_agency_role_fix.sql
--
-- Corrige todas as políticas RLS que verificavam role='support' para também
-- aceitar role='agency' (novo role emitido pelo JWT hook para usuários de suporte
-- com tenant_id vinculado, provisionados via provision-tenant com is_support=true).
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.

-- ── clients ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients_tenant_isolation" ON clients;
CREATE POLICY "clients_tenant_isolation" ON clients FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── campaign_data ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "campaign_data_tenant_isolation" ON campaign_data;
CREATE POLICY "campaign_data_tenant_isolation" ON campaign_data FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── daily_metrics ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "daily_metrics_tenant_isolation" ON daily_metrics;
CREATE POLICY "daily_metrics_tenant_isolation" ON daily_metrics FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── client_kpis ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_kpis_tenant_isolation" ON client_kpis;
CREATE POLICY "client_kpis_tenant_isolation" ON client_kpis FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── client_kpi_history ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_kpi_history_tenant_isolation" ON client_kpi_history;
CREATE POLICY "client_kpi_history_tenant_isolation" ON client_kpi_history FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── crm_leads ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "crm_leads_tenant_isolation" ON crm_leads;
CREATE POLICY "crm_leads_tenant_isolation" ON crm_leads FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── ad_click_sessions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ad_click_sessions_tenant_isolation" ON ad_click_sessions;
CREATE POLICY "ad_click_sessions_tenant_isolation" ON ad_click_sessions FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── client_conversation_kpis ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis;
CREATE POLICY "client_conversation_kpis_tenant_isolation" ON client_conversation_kpis FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── client_agent_kpis ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_agent_kpis_tenant_isolation" ON client_agent_kpis;
CREATE POLICY "client_agent_kpis_tenant_isolation" ON client_agent_kpis FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── oauth_tokens ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "oauth_tokens_tenant_isolation" ON oauth_tokens;
CREATE POLICY "oauth_tokens_tenant_isolation" ON oauth_tokens FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── contracts ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contracts_tenant_isolation" ON contracts;
CREATE POLICY "contracts_tenant_isolation" ON contracts FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── tenant_users ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_users_isolation" ON tenant_users;
CREATE POLICY "tenant_users_isolation" ON tenant_users FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'));

-- ── audit_logs ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON public.audit_logs;
CREATE POLICY "audit_logs_tenant_isolation" ON public.audit_logs FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('agency','support'));

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('agency','support'));

-- ── payments_cache ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_cache_tenant_isolation" ON public.payments_cache;
CREATE POLICY "payments_cache_tenant_isolation" ON public.payments_cache FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR public.is_agency_user() OR (auth.jwt() ->> 'role') = 'agency');

-- ── lead_interactions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lead_interactions_tenant_isolation" ON lead_interactions;
CREATE POLICY "lead_interactions_tenant_isolation" ON lead_interactions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_interactions.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_interactions.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ));

-- ── lead_tags ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lead_tags_tenant_isolation" ON lead_tags;
CREATE POLICY "lead_tags_tenant_isolation" ON lead_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_tags.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_tags.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ));

-- ── lead_followups ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lead_followups_tenant_isolation" ON lead_followups;
CREATE POLICY "lead_followups_tenant_isolation" ON lead_followups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_followups.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = lead_followups.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ));

-- ── crm_lead_stage_history ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lead_stage_history_tenant_isolation" ON crm_lead_stage_history;
CREATE POLICY "lead_stage_history_tenant_isolation" ON crm_lead_stage_history FOR ALL
  USING (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = crm_lead_stage_history.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM crm_leads l WHERE l.id = crm_lead_stage_history.lead_id
      AND (l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR (auth.jwt() ->> 'role') IN ('support','agency'))
  ));

-- ── JWT hook: adicionar 'agency' como role válido para usuários com tenant_id ─
-- Usuários provisionados com is_support=true têm role='agency' E tenant_id.
-- O hook atual trata agency sem tenant_id. Agora também preserva agency com tenant_id.
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

  -- Usuários da agência SEM tenant_id → normaliza role para 'agency'
  IF v_tenant_id IS NULL AND v_role IN ('owner', 'admin', 'manager', 'member', 'support') THEN
    RETURN jsonb_set(
      jsonb_set(
        jsonb_set(event, '{claims,tenant_id}', 'null'::jsonb),
        '{claims,role}', '"agency"'::jsonb
      ),
      '{claims,agency_role}', to_jsonb(v_role)
    );
  END IF;

  -- Usuários de suporte COM tenant_id (novo modelo) → mantém agency + injeta tenant_id
  -- Garante que tenant_id chega como claim de topo no JWT
  RETURN jsonb_set(
    jsonb_set(
      event,
      '{claims,tenant_id}',
      CASE WHEN v_tenant_id IS NOT NULL
        THEN to_jsonb(v_tenant_id)
        ELSE 'null'::jsonb
      END
    ),
    '{claims,role}',
    to_jsonb(v_role)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

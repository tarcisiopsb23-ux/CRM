-- Migration: 20260501000007_tenant_isolation_complete.sql
--
-- Garante isolamento completo de dados por tenant em TODAS as tabelas
-- que alimentam o CRM, Dashboard de Atendimento e Dashboard de Performance.
--
-- Tabelas já cobertas pelas migrations 20260501000000-000006:
--   clients, campaign_data, daily_metrics, client_kpis, client_kpi_history,
--   client_conversation_kpis, crm_leads, ad_click_sessions, oauth_tokens, contracts
--
-- Esta migration cobre o que ficou faltando:
--   1. client_agent_kpis          — sem tenant_id, sem RLS
--   2. lead_interactions          — sem RLS (acesso via crm_leads.id)
--   3. lead_tags                  — idem
--   4. lead_followups             — idem
--   5. crm_lead_stage_history     — RLS com anon USING (true) — sem isolamento
--   6. Views lead_campaign_roi e lead_roi_by_origin — sem filtro de tenant
--   7. RPC get_funnel_stats       — sem filtro de tenant
--   8. Limpeza de tabelas legadas — crm_sessions, crm_client_users
--   9. Limpeza de RPCs legadas    — get_crm_client_by_slug, auto_block_overdue_crm_clients

-- ============================================================
-- 1. client_agent_kpis — adicionar tenant_id + RLS
-- ============================================================

ALTER TABLE client_agent_kpis
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE client_agent_kpis cak
SET tenant_id = c.tenant_id
FROM clients c
WHERE c.id = cak.client_id
  AND cak.tenant_id IS NULL;

ALTER TABLE client_agent_kpis
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_agent_kpis_tenant_id
  ON client_agent_kpis (tenant_id);

ALTER TABLE client_agent_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_agent_kpis_tenant_isolation" ON client_agent_kpis;
CREATE POLICY "client_agent_kpis_tenant_isolation" ON client_agent_kpis
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
-- 2. lead_interactions — RLS via tenant_id do lead pai
-- ============================================================

ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_lead_interactions" ON lead_interactions;
DROP POLICY IF EXISTS "lead_interactions_tenant_isolation" ON lead_interactions;

CREATE POLICY "lead_interactions_tenant_isolation" ON lead_interactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_interactions.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_interactions.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  );

-- ============================================================
-- 3. lead_tags — RLS via tenant_id do lead pai
-- ============================================================

ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_lead_tags" ON lead_tags;
DROP POLICY IF EXISTS "lead_tags_tenant_isolation" ON lead_tags;

CREATE POLICY "lead_tags_tenant_isolation" ON lead_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_tags.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_tags.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  );

-- ============================================================
-- 4. lead_followups — RLS via tenant_id do lead pai
-- ============================================================

ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_lead_followups" ON lead_followups;
DROP POLICY IF EXISTS "lead_followups_tenant_isolation" ON lead_followups;

CREATE POLICY "lead_followups_tenant_isolation" ON lead_followups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_followups.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = lead_followups.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  );

-- ============================================================
-- 5. crm_lead_stage_history — substituir anon USING (true) por isolamento real
-- ============================================================

ALTER TABLE crm_lead_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_lead_stage_history" ON crm_lead_stage_history;
DROP POLICY IF EXISTS "lead_stage_history_tenant_isolation" ON crm_lead_stage_history;

CREATE POLICY "lead_stage_history_tenant_isolation" ON crm_lead_stage_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = crm_lead_stage_history.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_leads l
      WHERE l.id = crm_lead_stage_history.lead_id
        AND (
          l.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
          OR (auth.jwt() ->> 'role') = 'support'
        )
    )
  );

-- ============================================================
-- 6. Views — dropar e recriar com tenant_id exposto
-- ============================================================

DROP VIEW IF EXISTS lead_roi_by_origin;
DROP VIEW IF EXISTS lead_campaign_roi;

CREATE VIEW lead_campaign_roi AS
SELECT
  l.id              AS lead_id,
  l.name            AS lead_name,
  l.origin          AS lead_origin,
  l.status          AS lead_status,
  l.potential_value,
  l.tenant_id,
  c.id              AS campaign_id,
  c.name            AS campaign_name,
  c.platform,
  c.spend           AS campaign_spend,
  c.leads           AS campaign_leads
FROM crm_leads l
LEFT JOIN campaign_data c ON l.campaign_id = c.id;

CREATE VIEW lead_roi_by_origin AS
SELECT
  tenant_id,
  lead_origin,
  COUNT(*)                                                                 AS total_leads,
  COUNT(*) FILTER (WHERE lead_status = 'fechado')                          AS closed_leads,
  COALESCE(SUM(potential_value) FILTER (WHERE lead_status = 'fechado'), 0) AS total_potential_value,
  COALESCE(SUM(campaign_spend), 0)                                         AS total_campaign_spend,
  SUM(potential_value) FILTER (WHERE lead_status = 'fechado')
    / NULLIF(SUM(campaign_spend), 0)                                       AS roi_ratio
FROM lead_campaign_roi
GROUP BY tenant_id, lead_origin;

-- ============================================================
-- 7. RPC get_funnel_stats — adicionar filtro de tenant_id
-- ============================================================

CREATE OR REPLACE FUNCTION get_funnel_stats(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  stage TEXT,
  total BIGINT
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    h.stage,
    COUNT(DISTINCT h.lead_id) AS total
  FROM crm_lead_stage_history h
  JOIN crm_leads l ON l.id = h.lead_id
  WHERE h.entered_at >= p_from
    AND h.entered_at <= p_to
    AND h.stage NOT IN ('follow_up')
    AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
  GROUP BY h.stage
  ORDER BY
    CASE h.stage
      WHEN 'novo'       THEN 1
      WHEN 'contato'    THEN 2
      WHEN 'proposta'   THEN 3
      WHEN 'negociacao' THEN 4
      WHEN 'fechado'    THEN 5
      WHEN 'perdido'    THEN 6
      ELSE 7
    END;
$$;

-- ============================================================
-- 8. Limpeza de tabelas legadas
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_sessions'
  ) THEN
    DROP TABLE crm_sessions CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_client_users'
  ) THEN
    INSERT INTO tenant_users (user_id, tenant_id, role, created_at)
    SELECT
      ccu.user_id,
      ccu.client_id AS tenant_id,
      'member'      AS role,
      ccu.created_at
    FROM crm_client_users ccu
    WHERE ccu.active = true
      AND NOT EXISTS (
        SELECT 1 FROM tenant_users tu
        WHERE tu.user_id = ccu.user_id
          AND tu.tenant_id = ccu.client_id
      )
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    DROP TABLE crm_client_users CASCADE;
  END IF;
END $$;

-- ============================================================
-- 9. Limpeza de RPCs legadas
-- ============================================================

DROP FUNCTION IF EXISTS public.get_crm_client_by_slug(TEXT);
DROP FUNCTION IF EXISTS public.auto_block_overdue_crm_clients();

-- ============================================================
-- Nota: crm_client_plans (migration 00118) é mantida.
-- Serve ao Maestr.ia para controle administrativo (cobrança, status).
-- Limites de usuários do CRM são controlados pelo SaaS_DB via validate-access.
-- ============================================================

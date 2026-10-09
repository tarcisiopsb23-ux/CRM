-- Migration: RLS para client_conversation_kpis e client_agent_kpis
-- Padrão do projeto: banco single-tenant, acesso total via anon key.
-- Mesmo padrão aplicado em crm_leads (migration 20260325000006).

-- ── client_conversation_kpis ─────────────────────────────────────────────────
ALTER TABLE client_conversation_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_client_conversation_kpis" ON client_conversation_kpis;
CREATE POLICY "anon_all_client_conversation_kpis" ON client_conversation_kpis
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── client_agent_kpis ────────────────────────────────────────────────────────
ALTER TABLE client_agent_kpis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_client_agent_kpis" ON client_agent_kpis;
CREATE POLICY "anon_all_client_agent_kpis" ON client_agent_kpis
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

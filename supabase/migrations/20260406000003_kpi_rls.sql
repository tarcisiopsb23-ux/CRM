-- Migration: Enable RLS on client_kpis and client_kpi_history
-- These tables were created without RLS policies, causing 401 errors for anon key.

ALTER TABLE client_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_client_kpis" ON client_kpis;
CREATE POLICY "anon_all_client_kpis" ON client_kpis
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE client_kpi_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_client_kpi_history" ON client_kpi_history;
CREATE POLICY "anon_all_client_kpi_history" ON client_kpi_history
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Allow public (unauthenticated) read access to client_kpis and client_kpi_history
-- Required for the public client dashboard (/public/dashboard/:slug) which has no Supabase auth session.
-- Write operations remain restricted to authenticated org members via the existing policies.

-- client_kpis: public SELECT by client_id
DROP POLICY IF EXISTS "client_kpis_public_read" ON public.client_kpis;
CREATE POLICY "client_kpis_public_read"
  ON public.client_kpis
  FOR SELECT
  USING (true);

-- client_kpi_history: public SELECT by client_id
DROP POLICY IF EXISTS "client_kpi_history_public_read" ON public.client_kpi_history;
CREATE POLICY "client_kpi_history_public_read"
  ON public.client_kpi_history
  FOR SELECT
  USING (true);

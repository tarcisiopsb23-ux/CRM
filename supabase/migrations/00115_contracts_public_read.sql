-- Migration 00115: Allow public (anon) read on contracts for clients with dashboard_slug
-- Needed so the public dashboard can fetch is_dashboard_reference and contract dates

DROP POLICY IF EXISTS "contracts_public_read" ON public.contracts;
CREATE POLICY "contracts_public_read"
  ON public.contracts
  FOR SELECT
  TO anon, authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE dashboard_slug IS NOT NULL));

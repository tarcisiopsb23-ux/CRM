-- Fix public dashboard access for campaign_data, client_kpis and client_kpi_history
-- The public dashboard (/public/dashboard/:slug) runs as anon and needs read access.

-- 1. campaign_data: allow public read for clients with a dashboard_slug
DROP POLICY IF EXISTS "campaign_data_public_read" ON public.campaign_data;
CREATE POLICY "campaign_data_public_read"
  ON public.campaign_data
  FOR SELECT
  TO anon, authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE dashboard_slug IS NOT NULL));

-- 2. client_kpis: ensure public read policy exists (may already exist from 00060)
DROP POLICY IF EXISTS "client_kpis_public_read" ON public.client_kpis;
CREATE POLICY "client_kpis_public_read"
  ON public.client_kpis
  FOR SELECT
  TO anon, authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE dashboard_slug IS NOT NULL));

-- 3. client_kpi_history: ensure public read policy exists (may already exist from 00060)
DROP POLICY IF EXISTS "client_kpi_history_public_read" ON public.client_kpi_history;
CREATE POLICY "client_kpi_history_public_read"
  ON public.client_kpi_history
  FOR SELECT
  TO anon, authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE dashboard_slug IS NOT NULL));

-- 4. RPCs SECURITY DEFINER (fallback for when direct queries fail)
CREATE OR REPLACE FUNCTION public.get_client_kpis_public(p_client_id UUID)
RETURNS TABLE (
    id UUID, organization_id UUID, client_id UUID,
    name VARCHAR, category VARCHAR, unit VARCHAR,
    is_predefined BOOLEAN, target_value DECIMAL,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT k.id, k.organization_id, k.client_id, k.name, k.category,
           k.unit, k.is_predefined, k.target_value, k.created_at, k.updated_at
    FROM public.client_kpis k
    WHERE k.client_id = p_client_id
    ORDER BY k.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_kpi_history_public(p_client_id UUID)
RETURNS TABLE (
    id UUID, organization_id UUID, client_id UUID,
    kpi_id UUID, month_year DATE, value DECIMAL,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT h.id, h.organization_id, h.client_id, h.kpi_id,
           h.month_year, h.value, h.created_at, h.updated_at
    FROM public.client_kpi_history h
    WHERE h.client_id = p_client_id
    ORDER BY h.month_year DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_kpis_public(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_kpi_history_public(UUID) TO anon, authenticated;

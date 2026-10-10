-- Migration 00176: RPCs públicas para campaign_data e daily_metrics
-- Bypassa RLS usando SECURITY DEFINER, igual às RPCs de KPIs públicos

CREATE OR REPLACE FUNCTION public.get_campaign_data_public(
  p_client_id UUID,
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_to DATE DEFAULT CURRENT_DATE
)
RETURNS SETOF public.campaign_data
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT cd.*
  FROM public.campaign_data cd
  JOIN public.clients c ON c.id = cd.client_id
  WHERE cd.client_id = p_client_id
    AND c.dashboard_slug IS NOT NULL
    AND cd.date >= p_from
    AND cd.date <= p_to;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_metrics_public(
  p_client_id UUID,
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days'),
  p_to DATE DEFAULT CURRENT_DATE
)
RETURNS SETOF public.daily_metrics
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT dm.*
  FROM public.daily_metrics dm
  JOIN public.clients c ON c.id = dm.client_id
  WHERE dm.client_id = p_client_id
    AND c.dashboard_slug IS NOT NULL
    AND dm.date >= p_from
    AND dm.date <= p_to
  ORDER BY dm.date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_data_public(UUID, DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_metrics_public(UUID, DATE, DATE) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

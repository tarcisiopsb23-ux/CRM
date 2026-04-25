-- Migration 00170: RPCs para upsert seguro de campaign_data e daily_metrics
-- Resolve o problema de duplicate key quando o n8n chama POST sem on_conflict funcional.

-- RPC: upsert em lote para campaign_data
CREATE OR REPLACE FUNCTION public.upsert_campaign_data(records jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(records)
  LOOP
    INSERT INTO public.campaign_data (
      client_id, organization_id, platform, date, campaign_name,
      spend, impressions, clicks, leads, sales, revenue
    )
    VALUES (
      (rec->>'client_id')::uuid,
      (rec->>'organization_id')::uuid,
      rec->>'platform',
      (rec->>'date')::date,
      rec->>'campaign_name',
      COALESCE((rec->>'spend')::numeric, 0),
      COALESCE((rec->>'impressions')::integer, 0),
      COALESCE((rec->>'clicks')::integer, 0),
      COALESCE((rec->>'leads')::integer, 0),
      COALESCE((rec->>'sales')::integer, 0),
      COALESCE((rec->>'revenue')::numeric, 0)
    )
    ON CONFLICT (client_id, platform, date, campaign_name)
    DO UPDATE SET
      spend       = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks      = EXCLUDED.clicks,
      leads       = EXCLUDED.leads,
      sales       = EXCLUDED.sales,
      revenue     = EXCLUDED.revenue;
  END LOOP;
END;
$$;

-- RPC: upsert em lote para daily_metrics
CREATE OR REPLACE FUNCTION public.upsert_daily_metrics(records jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(records)
  LOOP
    INSERT INTO public.daily_metrics (
      client_id, organization_id, date,
      total_spend, total_leads, total_sales, total_revenue,
      total_impressions, total_clicks, cpl, cpa, roas
    )
    VALUES (
      (rec->>'client_id')::uuid,
      (rec->>'organization_id')::uuid,
      (rec->>'date')::date,
      COALESCE((rec->>'total_spend')::numeric, 0),
      COALESCE((rec->>'total_leads')::integer, 0),
      COALESCE((rec->>'total_sales')::integer, 0),
      COALESCE((rec->>'total_revenue')::numeric, 0),
      COALESCE((rec->>'total_impressions')::integer, 0),
      COALESCE((rec->>'total_clicks')::integer, 0),
      COALESCE((rec->>'cpl')::numeric, 0),
      COALESCE((rec->>'cpa')::numeric, 0),
      COALESCE((rec->>'roas')::numeric, 0)
    )
    ON CONFLICT (client_id, date)
    DO UPDATE SET
      total_spend       = EXCLUDED.total_spend,
      total_leads       = EXCLUDED.total_leads,
      total_sales       = EXCLUDED.total_sales,
      total_revenue     = EXCLUDED.total_revenue,
      total_impressions = EXCLUDED.total_impressions,
      total_clicks      = EXCLUDED.total_clicks,
      cpl               = EXCLUDED.cpl,
      cpa               = EXCLUDED.cpa,
      roas              = EXCLUDED.roas;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_campaign_data(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_daily_metrics(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

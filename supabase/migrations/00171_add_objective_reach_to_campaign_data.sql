-- Migration 00171: Adiciona objective e reach em campaign_data
ALTER TABLE public.campaign_data
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS reach     INTEGER DEFAULT 0;

-- Atualiza a RPC de upsert para incluir os novos campos
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
      spend, impressions, clicks, leads, sales, revenue, objective, reach
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
      COALESCE((rec->>'revenue')::numeric, 0),
      rec->>'objective',
      COALESCE((rec->>'reach')::integer, 0)
    )
    ON CONFLICT (client_id, platform, date, campaign_name)
    DO UPDATE SET
      spend       = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks      = EXCLUDED.clicks,
      leads       = EXCLUDED.leads,
      sales       = EXCLUDED.sales,
      revenue     = EXCLUDED.revenue,
      objective   = COALESCE(EXCLUDED.objective, public.campaign_data.objective),
      reach       = EXCLUDED.reach;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Migration 00172: Adiciona campaign_id, objective_metric_label e objective_metric_value
-- O workflow real do n8n já usa esses campos no on_conflict e nos records

ALTER TABLE public.campaign_data
  ADD COLUMN IF NOT EXISTS campaign_id            TEXT,
  ADD COLUMN IF NOT EXISTS objective_metric_label TEXT,
  ADD COLUMN IF NOT EXISTS objective_metric_value INTEGER DEFAULT 0;

-- Remove a constraint antiga (campaign_name) e cria nova com campaign_id
-- O workflow usa on_conflict=client_id,platform,date,campaign_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaign_data'::regclass
      AND contype = 'u'
      AND conname = 'campaign_data_unique_day_campaign'
  ) THEN
    ALTER TABLE public.campaign_data
      DROP CONSTRAINT campaign_data_unique_day_campaign;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaign_data'::regclass
      AND contype = 'u'
      AND conname = 'campaign_data_unique_day_campaign_id'
  ) THEN
    ALTER TABLE public.campaign_data
      ADD CONSTRAINT campaign_data_unique_day_campaign_id
      UNIQUE (client_id, platform, date, campaign_id);
  END IF;
END $$;

-- Atualiza a RPC para incluir os novos campos
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
      client_id, organization_id, platform, date, campaign_id, campaign_name,
      spend, impressions, reach, clicks, leads, sales, revenue,
      objective, objective_metric_label, objective_metric_value
    )
    VALUES (
      (rec->>'client_id')::uuid,
      (rec->>'organization_id')::uuid,
      rec->>'platform',
      (rec->>'date')::date,
      rec->>'campaign_id',
      rec->>'campaign_name',
      COALESCE((rec->>'spend')::numeric, 0),
      COALESCE((rec->>'impressions')::integer, 0),
      COALESCE((rec->>'reach')::integer, 0),
      COALESCE((rec->>'clicks')::integer, 0),
      COALESCE((rec->>'leads')::integer, 0),
      COALESCE((rec->>'sales')::integer, 0),
      COALESCE((rec->>'revenue')::numeric, 0),
      rec->>'objective',
      rec->>'objective_metric_label',
      COALESCE((rec->>'objective_metric_value')::integer, 0)
    )
    ON CONFLICT (client_id, platform, date, campaign_id)
    DO UPDATE SET
      campaign_name          = EXCLUDED.campaign_name,
      spend                  = EXCLUDED.spend,
      impressions            = EXCLUDED.impressions,
      reach                  = EXCLUDED.reach,
      clicks                 = EXCLUDED.clicks,
      leads                  = EXCLUDED.leads,
      sales                  = EXCLUDED.sales,
      revenue                = EXCLUDED.revenue,
      objective              = COALESCE(EXCLUDED.objective, public.campaign_data.objective),
      objective_metric_label = COALESCE(EXCLUDED.objective_metric_label, public.campaign_data.objective_metric_label),
      objective_metric_value = EXCLUDED.objective_metric_value;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

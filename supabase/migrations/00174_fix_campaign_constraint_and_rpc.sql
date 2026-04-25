-- Migration 00174: Constraint regular + RPC robusta para upsert de campaign_data
-- ON CONFLICT em PL/pgSQL não funciona com índices parciais — precisa de constraint regular

-- Remove índices parciais criados na 00173
DROP INDEX IF EXISTS campaign_data_unique_idx;
DROP INDEX IF EXISTS campaign_data_unique_name_idx;

-- Garante que campaign_id nunca seja null — usa campaign_name como fallback
UPDATE public.campaign_data
SET campaign_id = campaign_name
WHERE campaign_id IS NULL AND campaign_name IS NOT NULL;

-- Cria constraint regular (não parcial) em (client_id, platform, date, campaign_id)
ALTER TABLE public.campaign_data
  ADD CONSTRAINT campaign_data_unique_campaign_id
  UNIQUE (client_id, platform, date, campaign_id);

-- Atualiza RPC para usar campaign_name como fallback quando campaign_id não vem
CREATE OR REPLACE FUNCTION public.upsert_campaign_data(records jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
  v_campaign_id TEXT;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(records)
  LOOP
    -- Usa campaign_id se disponível, senão usa campaign_name como chave
    v_campaign_id := COALESCE(NULLIF(rec->>'campaign_id', ''), rec->>'campaign_name');

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
      v_campaign_id,
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

GRANT EXECUTE ON FUNCTION public.upsert_campaign_data(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_campaign_data(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

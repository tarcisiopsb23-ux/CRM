-- Migration 00169: Garante constraints UNIQUE para upsert via PostgREST (n8n)
-- A constraint campaign_data_unique_day_campaign pode já existir (criada manualmente).
-- Este script é idempotente.

-- Remove duplicatas em campaign_data antes de garantir a constraint
DELETE FROM public.campaign_data
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id, platform, date, campaign_name) id
  FROM public.campaign_data
  ORDER BY client_id, platform, date, campaign_name, created_at DESC
);

-- Remove duplicatas em daily_metrics antes de garantir a constraint
DELETE FROM public.daily_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id, date) id
  FROM public.daily_metrics
  ORDER BY client_id, date, created_at DESC
);

-- Cria constraint em campaign_data apenas se não existir nenhuma com essas colunas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campaign_data'::regclass
      AND contype = 'u'
      AND conname IN ('campaign_data_unique_day_campaign', 'campaign_data_client_date_platform_name_key')
  ) THEN
    ALTER TABLE public.campaign_data
      ADD CONSTRAINT campaign_data_unique_day_campaign
      UNIQUE (client_id, platform, date, campaign_name);
  END IF;
END $$;

-- Cria constraint em daily_metrics apenas se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_metrics'::regclass
      AND contype = 'u'
      AND conname IN ('daily_metrics_client_date_key', 'daily_metrics_unique_client_date')
  ) THEN
    ALTER TABLE public.daily_metrics
      ADD CONSTRAINT daily_metrics_client_date_key
      UNIQUE (client_id, date);
  END IF;
END $$;

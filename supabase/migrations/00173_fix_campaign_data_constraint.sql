-- Migration 00173: Corrige constraints duplicadas em campaign_data
-- Mantém apenas uma constraint única em (client_id, platform, date, campaign_id)

-- Remove todas as constraints unique existentes em campaign_data
ALTER TABLE public.campaign_data DROP CONSTRAINT IF EXISTS campaign_data_unique;
ALTER TABLE public.campaign_data DROP CONSTRAINT IF EXISTS campaign_data_unique_day_campaign;
ALTER TABLE public.campaign_data DROP CONSTRAINT IF EXISTS campaign_data_unique_day_campaign_id;
ALTER TABLE public.campaign_data DROP CONSTRAINT IF EXISTS campaign_data_client_date_platform_name_key;

-- campaign_id pode ser null para plataformas que não retornam ID (ex: Google sem campaign_id)
-- Cria constraint parcial: só aplica quando campaign_id não é null
CREATE UNIQUE INDEX IF NOT EXISTS campaign_data_unique_idx
  ON public.campaign_data (client_id, platform, date, campaign_id)
  WHERE campaign_id IS NOT NULL;

-- Fallback para quando campaign_id é null: usa campaign_name
CREATE UNIQUE INDEX IF NOT EXISTS campaign_data_unique_name_idx
  ON public.campaign_data (client_id, platform, date, campaign_name)
  WHERE campaign_id IS NULL;

NOTIFY pgrst, 'reload schema';

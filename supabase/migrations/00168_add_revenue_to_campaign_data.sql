-- Migration 00168: Adiciona coluna revenue em campaign_data
-- Necessária para calcular ROAS no workflow de sync de Ads

ALTER TABLE public.campaign_data
  ADD COLUMN IF NOT EXISTS revenue NUMERIC DEFAULT 0;

NOTIFY pgrst, 'reload schema';

-- Limpa dados de métricas de campanhas e métricas diárias
-- Execute no Supabase SQL Editor

TRUNCATE TABLE public.campaign_data RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.daily_metrics RESTART IDENTITY CASCADE;

-- Reseta o status de sync das integrações
UPDATE public.client_integrations
SET sync_status = 'pending',
    sync_error = null,
    last_sync_at = null,
    last_sync_records = 0,
    updated_at = now();

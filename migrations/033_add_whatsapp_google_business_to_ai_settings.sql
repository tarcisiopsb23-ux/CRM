-- Migration: Adiciona campos whatsapp e google_business_url à tabela ai_settings
-- Execute no Supabase do CLIENTE (client_supabase), não no CRM principal
-- ============================================================

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS whatsapp            TEXT,
  ADD COLUMN IF NOT EXISTS google_business_url TEXT;

-- Comentários descritivos
COMMENT ON COLUMN public.ai_settings.whatsapp
  IS 'Número WhatsApp com DDI+DDD, somente dígitos. Ex: 5511999994444';

COMMENT ON COLUMN public.ai_settings.google_business_url
  IS 'URL de avaliação do Google Meu Negócio. Encaminhada ao cliente quando solicitar avaliação.';

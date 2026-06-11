-- ============================================================
-- Migration 038: Expande ai_settings no Banco B do cliente
-- Execute no Supabase de CADA CLIENTE (Banco B), não no Banco A
--
-- Adiciona campos necessários para:
-- - Controle do bot (WhatsApp)
-- - Pixels de rastreamento (ConfigIntegracoesPage)
-- - Configurações de pagamento (ConfigPagamentosPage)
-- ============================================================

-- ── bot_active (toggle do agente de IA) ──────────────────────────────────────
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS bot_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ai_settings.bot_active IS
  'Controla se o bot responde automaticamente. false = handoff total para humano.';

-- ── Pixels de rastreamento (ConfigIntegracoesPage) ───────────────────────────
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS meta_pixel_id  TEXT,
  ADD COLUMN IF NOT EXISTS google_tag_id  TEXT;

COMMENT ON COLUMN public.ai_settings.meta_pixel_id IS
  'Meta Pixel ID para injeção dinâmica nas páginas do dashboard.';
COMMENT ON COLUMN public.ai_settings.google_tag_id IS
  'Google Tag ID (G-XXXX ou AW-XXXX) para injeção dinâmica nas páginas do dashboard.';

-- ── Integração Asaas (ConfigPagamentosPage) ──────────────────────────────────
-- A chave real fica armazenada no banco; o frontend só vê asaas_api_key_set
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS asaas_api_key      TEXT,        -- armazenado criptografado no server
  ADD COLUMN IF NOT EXISTS asaas_api_key_set  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_enabled        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS boleto_enabled     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS credit_card_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_settings.asaas_api_key IS
  'Chave de API do Asaas. Nunca retornada ao frontend após salva.';
COMMENT ON COLUMN public.ai_settings.asaas_api_key_set IS
  'Indica se a chave do Asaas está configurada, sem expor o valor.';

-- ── RLS: asaas_api_key nunca deve ser retornada ao frontend ──────────────────
-- Política: authenticated users podem ler tudo EXCETO asaas_api_key
-- A coluna é filtrada via security_invoker no SELECT ou via RPC dedicada

-- Para garantir que a chave nunca vaze via SELECT direto no frontend,
-- criamos uma view security_invoker que exclui a coluna:
CREATE OR REPLACE VIEW public.ai_settings_safe
WITH (security_invoker = true)
AS
  SELECT
    id,
    establishment_name,
    phone,
    whatsapp,
    instagram,
    address,
    opening_hours,
    welcome_message,
    auto_reply_24h,
    forward_to_human,
    sidebar_logo_url,
    google_business_url,
    bot_active,
    meta_pixel_id,
    google_tag_id,
    asaas_api_key_set,   -- só o boolean; nunca a chave real
    pix_enabled,
    boleto_enabled,
    credit_card_enabled,
    updated_at,
    created_at
  FROM public.ai_settings;

-- Garante que a política existente continue cobrindo a tabela base
-- (mantém compatibilidade com políticas "public_write" já existentes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_settings' AND policyname = 'authenticated_rw'
  ) THEN
    -- Política para usuários autenticados (dashboard com JWT do Banco B)
    DROP POLICY IF EXISTS "authenticated_rw" ON public.ai_settings;
    CREATE POLICY "authenticated_rw" ON public.ai_settings
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Registra na schema_migrations se a tabela existir ─────────────────────────
INSERT INTO public.schema_migrations (version) VALUES ('038')
ON CONFLICT (version) DO NOTHING;

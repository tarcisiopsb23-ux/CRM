-- =============================================================================
-- Migration 079: Campos de marca em client_ai_settings
--
-- Adiciona campos de identidade visual que o cliente pode configurar
-- no dashboard público, alimentando /booking/:slug e a página de agendamento.
--
-- Campos adicionados:
--   display_name  — nome de exibição público (pode diferir do clients.name)
--   logo_url      — URL do logotipo (fonte única para booking + sidebar)
--   primary_color — cor primária (hex) para personalizar a BookingPage
--   description   — slogan ou descrição curta exibida na BookingPage
--
-- Estratégia: centraliza tudo em client_ai_settings para não fragmentar
-- a identidade de marca entre clients.metadata e client_ai_settings.
-- A Edge Function agenda-booking é atualizada para ler daqui.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adiciona colunas de marca
ALTER TABLE public.client_ai_settings
  ADD COLUMN IF NOT EXISTS display_name  TEXT,
  ADD COLUMN IF NOT EXISTS logo_url      TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS description   TEXT;

-- Atualiza a view segura para incluir os novos campos
-- Usa DROP CASCADE porque ai_settings depende de client_ai_settings_safe
DROP VIEW IF EXISTS public.ai_settings CASCADE;
DROP VIEW IF EXISTS public.client_ai_settings_safe CASCADE;

CREATE VIEW public.client_ai_settings_safe
WITH (security_invoker = true) AS
  SELECT
    id, client_id, organization_id,
    establishment_name, phone, whatsapp, instagram, address,
    opening_hours, welcome_message, auto_reply_24h, forward_to_human,
    sidebar_logo_url, google_business_url, bot_active,
    meta_pixel_id, google_tag_id,
    asaas_api_key_set,
    pix_enabled, boleto_enabled, credit_card_enabled,
    -- Novos campos de marca
    display_name, logo_url, primary_color, description,
    updated_at, created_at
  FROM public.client_ai_settings;

-- Recria a view ai_settings (era um alias da safe, migration 077)
CREATE VIEW public.ai_settings
WITH (security_invoker = true) AS
SELECT * FROM public.client_ai_settings_safe;

COMMENT ON COLUMN public.client_ai_settings.display_name  IS 'Nome de exibição público — aparece na BookingPage e no header do dashboard. Pode diferir do clients.name.';
COMMENT ON COLUMN public.client_ai_settings.logo_url      IS 'URL do logotipo público. Fonte única para /booking/:slug e sidebar do dashboard.';
COMMENT ON COLUMN public.client_ai_settings.primary_color IS 'Cor primária em hex (ex: #6366f1). Usada para personalizar botões e destaques na BookingPage.';
COMMENT ON COLUMN public.client_ai_settings.description   IS 'Slogan ou descrição curta exibida na BookingPage abaixo do nome.';

INSERT INTO public.schema_migrations (version)
VALUES ('079_client_ai_settings_branding_v1')
ON CONFLICT (version) DO NOTHING;

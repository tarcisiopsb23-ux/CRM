-- =============================================================================
-- Migration 112: Notificações por E-mail para Agenda
--
-- Adiciona suporte a notificações via e-mail em paralelo ao WhatsApp (migration 108).
-- Campos espelham a estrutura já existente de whatsapp_notify_*,
-- permitindo que cada canal seja ativado/desativado independentemente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Campos de notificação por e-mail em client_ai_settings ─────────────────

ALTER TABLE public.client_ai_settings
  -- Toggle global de e-mail
  ADD COLUMN IF NOT EXISTS email_notify_enabled      BOOLEAN NOT NULL DEFAULT false,
  -- Eventos individualmente controláveis (espelham os de WhatsApp)
  ADD COLUMN IF NOT EXISTS email_notify_on_created   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notify_on_confirmed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notify_on_cancelled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notify_on_reminder  BOOLEAN NOT NULL DEFAULT true,
  -- Antecedência do lembrete em horas (independente do WhatsApp)
  ADD COLUMN IF NOT EXISTS email_reminder_hours      INTEGER NOT NULL DEFAULT 24
                           CHECK (email_reminder_hours BETWEEN 1 AND 168),
  -- E-mail remetente personalizado (null = usa o padrão da organização)
  ADD COLUMN IF NOT EXISTS email_notify_from         TEXT,
  -- Assuntos personalizados por evento (null = usa template padrão)
  ADD COLUMN IF NOT EXISTS email_subject_created     TEXT,
  ADD COLUMN IF NOT EXISTS email_subject_confirmed   TEXT,
  ADD COLUMN IF NOT EXISTS email_subject_cancelled   TEXT,
  ADD COLUMN IF NOT EXISTS email_subject_reminder    TEXT,
  -- Corpo do e-mail personalizado por evento (HTML ou texto simples)
  ADD COLUMN IF NOT EXISTS email_msg_created         TEXT,
  ADD COLUMN IF NOT EXISTS email_msg_confirmed       TEXT,
  ADD COLUMN IF NOT EXISTS email_msg_cancelled       TEXT,
  ADD COLUMN IF NOT EXISTS email_msg_reminder        TEXT;

COMMENT ON COLUMN public.client_ai_settings.email_notify_enabled IS
  'Habilita notificações por e-mail para agendamentos. Independente do canal WhatsApp.';

COMMENT ON COLUMN public.client_ai_settings.email_notify_from IS
  'E-mail remetente para notificações. Se null, usa o e-mail padrão da organização (Resend).';

-- ── 2. Campos em client_appointments para rastrear envio do e-mail ────────────

ALTER TABLE public.client_appointments
  ADD COLUMN IF NOT EXISTS email_notify_address TEXT,
  ADD COLUMN IF NOT EXISTS email_notified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_appointments.email_notify_address IS
  'E-mail para notificações. Se null, usa o e-mail do cliente (customer_email).';

-- ── 3. Atualiza a view client_ai_settings_safe para expor os novos campos ─────

DROP VIEW IF EXISTS public.client_ai_settings_safe CASCADE;

CREATE OR REPLACE VIEW public.client_ai_settings_safe
WITH (security_invoker = true) AS
  SELECT
    id, client_id, organization_id,
    establishment_name, phone, whatsapp, instagram,
    address, opening_hours, welcome_message,
    auto_reply_24h, forward_to_human, bot_active,
    display_name, logo_url, primary_color, description,
    sidebar_logo_url, google_business_url,
    meta_pixel_id, google_tag_id,
    asaas_api_key_set,
    pix_enabled, boleto_enabled, credit_card_enabled,
    -- Notificações WhatsApp
    whatsapp_notify_enabled,
    whatsapp_notify_on_created,
    whatsapp_notify_on_confirmed,
    whatsapp_notify_on_cancelled,
    whatsapp_notify_on_reminder,
    whatsapp_reminder_hours,
    whatsapp_msg_created,
    whatsapp_msg_confirmed,
    whatsapp_msg_cancelled,
    whatsapp_msg_reminder,
    whatsapp_connection_id,
    -- Notificações E-mail
    email_notify_enabled,
    email_notify_on_created,
    email_notify_on_confirmed,
    email_notify_on_cancelled,
    email_notify_on_reminder,
    email_reminder_hours,
    email_notify_from,
    email_subject_created,
    email_subject_confirmed,
    email_subject_cancelled,
    email_subject_reminder,
    email_msg_created,
    email_msg_confirmed,
    email_msg_cancelled,
    email_msg_reminder,
    updated_at, created_at
  FROM public.client_ai_settings;

-- Recria ai_settings (dependente — derrubada pelo CASCADE acima)
CREATE OR REPLACE VIEW public.ai_settings AS
  SELECT * FROM public.client_ai_settings_safe;

GRANT SELECT ON public.ai_settings TO authenticated, anon;

-- ── 4. RPC: get_email_notify_config ──────────────────────────────────────────
-- Retorna a configuração completa de notificação por e-mail para o n8n usar.

CREATE OR REPLACE FUNCTION public.get_email_notify_config(p_client_id UUID)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cfg JSONB;
BEGIN
  SELECT jsonb_build_object(
    'enabled',           email_notify_enabled,
    'on_created',        email_notify_on_created,
    'on_confirmed',      email_notify_on_confirmed,
    'on_cancelled',      email_notify_on_cancelled,
    'on_reminder',       email_notify_on_reminder,
    'reminder_hours',    email_reminder_hours,
    'from',              email_notify_from,
    'subject_created',   email_subject_created,
    'subject_confirmed', email_subject_confirmed,
    'subject_cancelled', email_subject_cancelled,
    'subject_reminder',  email_subject_reminder,
    'msg_created',       email_msg_created,
    'msg_confirmed',     email_msg_confirmed,
    'msg_cancelled',     email_msg_cancelled,
    'msg_reminder',      email_msg_reminder
  )
  INTO v_cfg
  FROM public.client_ai_settings
  WHERE client_id = p_client_id;

  IF NOT FOUND OR (v_cfg->>'enabled')::boolean = false THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  RETURN v_cfg;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_notify_config FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_notify_config FROM anon;
GRANT EXECUTE ON FUNCTION public.get_email_notify_config TO authenticated;

-- ── 5. Versão ─────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('112_agenda_email_notifications_v1')
ON CONFLICT (version) DO NOTHING;

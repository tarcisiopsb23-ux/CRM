-- =============================================================================
-- Migration 108: Configuração de Notificações WhatsApp para Agenda
--
-- Adiciona campos em client_ai_settings para controlar se o cliente
-- quer receber notificações WhatsApp dos agendamentos.
-- A funcionalidade só é habilitável se automation_enabled = true no plano.
--
-- Também adiciona coluna whatsapp_notify_phone em client_appointments
-- para saber qual número WhatsApp notificar (pode diferir do customer_phone).
-- =============================================================================

-- ── 1. Campos de notificação WhatsApp em client_ai_settings ──────────────────

ALTER TABLE public.client_ai_settings
  ADD COLUMN IF NOT EXISTS whatsapp_notify_enabled    BOOLEAN NOT NULL DEFAULT false,
  -- Tipos de notificação individualmente controláveis
  ADD COLUMN IF NOT EXISTS whatsapp_notify_on_created  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_notify_on_confirmed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_notify_on_cancelled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_notify_on_reminder  BOOLEAN NOT NULL DEFAULT true,
  -- Antecedência do lembrete (em horas antes do agendamento)
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_hours     INTEGER NOT NULL DEFAULT 24
                           CHECK (whatsapp_reminder_hours BETWEEN 1 AND 168),
  -- Mensagens personalizadas (null = usa o template padrão do sistema)
  ADD COLUMN IF NOT EXISTS whatsapp_msg_created        TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_msg_confirmed      TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_msg_cancelled      TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_msg_reminder       TEXT,
  -- Conexão Meta usada para envio (null = usa a primeira conexão WhatsApp ativa)
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id      UUID
                           REFERENCES public.meta_connections(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.client_ai_settings.whatsapp_notify_enabled IS
  'Habilita notificações WhatsApp para agendamentos. Só funciona se automation_enabled=true no plano do cliente.';

COMMENT ON COLUMN public.client_ai_settings.whatsapp_connection_id IS
  'Conexão Meta (WhatsApp) usada para enviar notificações. Se null, usa a primeira meta_connection ativa com provider=whatsapp.';

-- ── 2. Número WhatsApp em client_appointments ─────────────────────────────────
-- Permite notificar um número diferente do customer_phone (ex: responsável).

ALTER TABLE public.client_appointments
  ADD COLUMN IF NOT EXISTS whatsapp_notify_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_notified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.client_appointments.whatsapp_notify_phone IS
  'Número WhatsApp para notificações. Se null, usa customer_phone.';

-- ── 3. Índice para buscar agendamentos que precisam de lembrete ──────────────
CREATE INDEX IF NOT EXISTS idx_appointments_reminder
  ON public.client_appointments(client_id, start_at, status, reminder_sent_at)
  WHERE status IN ('confirmed','pending') AND reminder_sent_at IS NULL;

-- ── 4. View segura de client_ai_settings — atualizar para incluir novos campos
-- Usa DROP + CREATE para garantir que a ordem de colunas não conflite com a versão anterior.

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
    -- Notificações WhatsApp (sem exposição da connection_id internamente — apenas o boolean)
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
    updated_at, created_at
  FROM public.client_ai_settings;

-- Recria ai_settings (dependente de client_ai_settings_safe, derrubada pelo CASCADE acima)
CREATE OR REPLACE VIEW public.ai_settings AS
  SELECT * FROM public.client_ai_settings_safe;

GRANT SELECT ON public.ai_settings TO authenticated, anon;

-- ── 5. RPC: get_whatsapp_notify_config ───────────────────────────────────────
-- Retorna a configuração completa de notificação para o n8n usar.
-- Inclui o connection_id para resolução do token pela meta-credential-provider.

CREATE OR REPLACE FUNCTION public.get_whatsapp_notify_config(p_client_id UUID)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cfg     JSONB;
  v_conn_id UUID;
BEGIN
  -- Busca configuração do cliente
  SELECT
    jsonb_build_object(
      'enabled',           whatsapp_notify_enabled,
      'on_created',        whatsapp_notify_on_created,
      'on_confirmed',      whatsapp_notify_on_confirmed,
      'on_cancelled',      whatsapp_notify_on_cancelled,
      'on_reminder',       whatsapp_notify_on_reminder,
      'reminder_hours',    whatsapp_reminder_hours,
      'msg_created',       whatsapp_msg_created,
      'msg_confirmed',     whatsapp_msg_confirmed,
      'msg_cancelled',     whatsapp_msg_cancelled,
      'msg_reminder',      whatsapp_msg_reminder,
      'connection_id',     whatsapp_connection_id
    )
  INTO v_cfg
  FROM public.client_ai_settings
  WHERE client_id = p_client_id;

  IF NOT FOUND OR (v_cfg->>'enabled')::boolean = false THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  -- Se não tem connection_id explícito, busca a primeira conexão WhatsApp ativa
  v_conn_id := (v_cfg->>'connection_id')::UUID;
  IF v_conn_id IS NULL THEN
    SELECT id INTO v_conn_id
    FROM public.meta_connections mc
    JOIN public.clients c ON c.id = p_client_id
    WHERE mc.organization_id = c.organization_id
      AND mc.provider = 'whatsapp'
      AND mc.status = 'active'
    ORDER BY mc.created_at DESC
    LIMIT 1;
  END IF;

  RETURN v_cfg || jsonb_build_object('resolved_connection_id', v_conn_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_notify_config FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_whatsapp_notify_config FROM anon;
-- Acessível apenas por authenticated (n8n usa service_role)
GRANT EXECUTE ON FUNCTION public.get_whatsapp_notify_config TO authenticated;

-- ── 6. Registra versão ────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('108_agenda_whatsapp_notifications', now())
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- Migration 113: RPC get_appointments_needing_reminder
--
-- Retorna agendamentos que precisam de lembrete via e-mail e/ou WhatsApp.
-- Usada pelo workflow n8n n8n_workflow_agenda_reminder.json (Schedule Trigger).
--
-- Lógica:
--   - Agendamento confirmado ou pendente
--   - start_at no futuro
--   - start_at dentro da janela de antecedência configurada pelo cliente
--     (email_reminder_hours ou whatsapp_reminder_hours em client_ai_settings)
--   - Ainda não enviado (*_reminder_sent_at IS NULL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.get_appointments_needing_reminder()
RETURNS TABLE (
  id                       UUID,
  client_id                UUID,
  customer_name            TEXT,
  customer_email           TEXT,
  customer_phone           TEXT,
  whatsapp_notify_phone    TEXT,
  service_name             TEXT,
  start_at                 TIMESTAMPTZ,
  end_at                   TIMESTAMPTZ,
  -- Controle de envio
  email_reminder_sent_at   TIMESTAMPTZ,
  reminder_sent_at         TIMESTAMPTZ,
  -- Config e-mail
  email_notify_enabled     BOOLEAN,
  email_notify_on_reminder BOOLEAN,
  email_reminder_hours     INTEGER,
  -- Config WhatsApp
  whatsapp_notify_enabled      BOOLEAN,
  whatsapp_notify_on_reminder  BOOLEAN,
  whatsapp_reminder_hours      INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    a.id,
    a.client_id,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.whatsapp_notify_phone,
    a.service_name,
    a.start_at,
    a.end_at,
    a.email_reminder_sent_at,
    a.reminder_sent_at,
    -- Config e-mail
    COALESCE(s.email_notify_enabled,     false) AS email_notify_enabled,
    COALESCE(s.email_notify_on_reminder, false) AS email_notify_on_reminder,
    COALESCE(s.email_reminder_hours,     24)    AS email_reminder_hours,
    -- Config WhatsApp
    COALESCE(s.whatsapp_notify_enabled,      false) AS whatsapp_notify_enabled,
    COALESCE(s.whatsapp_notify_on_reminder,  false) AS whatsapp_notify_on_reminder,
    COALESCE(s.whatsapp_reminder_hours,      24)    AS whatsapp_reminder_hours
  FROM public.client_appointments a
  JOIN public.client_ai_settings  s ON s.client_id = a.client_id
  WHERE
    -- Apenas agendamentos ativos no futuro
    a.status IN ('confirmed', 'pending')
    AND a.start_at > now()
    -- Pelo menos um canal precisa de lembrete
    AND (
      -- E-mail: habilitado, ainda não enviado, dentro da janela
      (
        COALESCE(s.email_notify_enabled,     false) = true
        AND COALESCE(s.email_notify_on_reminder, false) = true
        AND a.email_reminder_sent_at IS NULL
        AND a.start_at <= now() + (COALESCE(s.email_reminder_hours, 24)::text || ' hours')::interval
      )
      OR
      -- WhatsApp: habilitado, ainda não enviado, dentro da janela
      (
        COALESCE(s.whatsapp_notify_enabled,     false) = true
        AND COALESCE(s.whatsapp_notify_on_reminder, false) = true
        AND a.reminder_sent_at IS NULL
        AND a.start_at <= now() + (COALESCE(s.whatsapp_reminder_hours, 24)::text || ' hours')::interval
      )
    )
  ORDER BY a.start_at ASC;
$$;

-- Permissões — acessível pelo service_role (n8n) e authenticated (agência)
REVOKE ALL ON FUNCTION public.get_appointments_needing_reminder() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointments_needing_reminder() TO authenticated;
-- service_role já tem acesso por padrão via SECURITY DEFINER

COMMENT ON FUNCTION public.get_appointments_needing_reminder() IS
  'Retorna agendamentos que precisam de lembrete (e-mail e/ou WhatsApp). '
  'Usada pelo workflow n8n n8n_workflow_agenda_reminder.json a cada 30 minutos.';

-- ── Versão ────────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('113_agenda_reminder_rpc_v1')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- Migration 114: Templates WhatsApp + Lembretes Automáticos de Agendamento
--
-- 1. Adiciona timezone em organizations e clients
-- 2. Cria whatsapp_templates (gerenciamento de templates Meta HSM)
-- 3. Cria appointment_reminder_settings (regras de lembrete por cliente)
-- 4. Cria appointment_reminders (fila persistente de lembretes)
-- 5. RPC claim_appointment_reminders (claim atômico — evita duplicidade)
-- 6. RPC schedule_appointment_reminders (gera lembretes ao criar/atualizar agendamento)
-- 7. RPC cancel_appointment_reminders (cancela lembretes ao cancelar agendamento)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Timezone ───────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS timezone TEXT;
-- NULL = herda da organização

COMMENT ON COLUMN public.organizations.timezone IS
  'Fuso horário padrão da organização. Ex: America/Sao_Paulo, America/Manaus.';
COMMENT ON COLUMN public.clients.timezone IS
  'Fuso horário do cliente. Se NULL, herda da organização.';

-- ── 2. Templates WhatsApp ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identificação Meta
  meta_template_id  TEXT,                    -- ID retornado pela Meta após criação
  waba_id           TEXT        NOT NULL,    -- WABA a qual pertence
  connection_id     UUID        REFERENCES public.meta_connections(id) ON DELETE SET NULL,

  -- Dados do template
  name              TEXT        NOT NULL,    -- nome único na WABA (snake_case)
  category          TEXT        NOT NULL     -- UTILITY | MARKETING | AUTHENTICATION
                    CHECK (category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  language          TEXT        NOT NULL DEFAULT 'pt_BR',

  -- Status sincronizado da Meta
  -- APPROVED | PENDING | REJECTED | PAUSED | DISABLED | IN_APPEAL | DELETED
  status            TEXT        NOT NULL DEFAULT 'PENDING',
  status_meta       TEXT,                    -- status original exato da Meta (preservado)
  rejection_reason  TEXT,                    -- motivo de rejeição quando REJECTED

  -- Conteúdo (armazenado como JSONB — estrutura da Meta)
  components        JSONB       NOT NULL DEFAULT '[]',
  -- Ex: [
  --   { "type": "HEADER", "format": "TEXT", "text": "Lembrete" },
  --   { "type": "BODY", "text": "Olá {{1}}, seu agendamento é dia {{2}} às {{3}}." },
  --   { "type": "FOOTER", "text": "Responda para confirmar." }
  -- ]

  -- Mapeamento de variáveis (semântico)
  -- Ex: { "1": "customer.name", "2": "appointment.date", "3": "appointment.time" }
  variable_mapping  JSONB       DEFAULT '{}',

  -- Exemplos para submissão à Meta
  -- Ex: { "1": "João Silva", "2": "07/10/2026", "3": "14:30" }
  variable_examples JSONB       DEFAULT '{}',

  -- Payload completo enviado/recebido da Meta (para debug)
  meta_payload      JSONB,

  -- Sync
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wt_organization
  ON public.whatsapp_templates(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_wt_waba
  ON public.whatsapp_templates(waba_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wt_meta_id
  ON public.whatsapp_templates(meta_template_id)
  WHERE meta_template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wt_name_waba
  ON public.whatsapp_templates(waba_id, name);

-- RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wt_select ON public.whatsapp_templates;
CREATE POLICY wt_select ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS wt_insert ON public.whatsapp_templates;
CREATE POLICY wt_insert ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin','manager']::public.user_role[])
  );

DROP POLICY IF EXISTS wt_update ON public.whatsapp_templates;
CREATE POLICY wt_update ON public.whatsapp_templates
  FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin','manager']::public.user_role[])
  );

DROP POLICY IF EXISTS wt_delete ON public.whatsapp_templates;
CREATE POLICY wt_delete ON public.whatsapp_templates
  FOR DELETE TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND user_has_role(ARRAY['owner','admin']::public.user_role[])
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_wt_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_wt_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 3. Configuração de lembretes por cliente ──────────────────────────────────
-- Cada linha = uma regra de lembrete (canal + timing).
-- Um cliente pode ter múltiplas regras (ex: WhatsApp dia anterior + e-mail 2h antes).

CREATE TABLE IF NOT EXISTS public.appointment_reminder_settings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Canal
  channel               TEXT        NOT NULL CHECK (channel IN ('whatsapp','email')),
  enabled               BOOLEAN     NOT NULL DEFAULT true,

  -- Timing
  -- previous_day: dia anterior no horário send_time
  -- hours_before: X horas antes do agendamento
  -- same_day: mesmo dia no horário send_time
  -- custom: combinação de days_before + send_time
  timing_type           TEXT        NOT NULL DEFAULT 'previous_day'
                        CHECK (timing_type IN ('previous_day','hours_before','same_day','custom')),
  days_before           INTEGER     NOT NULL DEFAULT 1 CHECK (days_before >= 0),
  hours_before          INTEGER     CHECK (hours_before > 0 AND hours_before <= 168),
  -- Horário do envio no timezone do cliente/organização (HH:MM)
  -- Usado para timing_type IN ('previous_day','same_day','custom')
  -- NULL para timing_type = 'hours_before'
  send_time             TIME,

  -- WhatsApp: template selecionado (deve estar APPROVED)
  whatsapp_template_id  UUID        REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,

  -- E-mail: assunto e corpo
  email_subject         TEXT,
  email_body            TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ars_client
  ON public.appointment_reminder_settings(client_id, channel, enabled);
CREATE INDEX IF NOT EXISTS idx_ars_organization
  ON public.appointment_reminder_settings(organization_id);

-- RLS
ALTER TABLE public.appointment_reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ars_all ON public.appointment_reminder_settings;
CREATE POLICY ars_all ON public.appointment_reminder_settings
  FOR ALL TO authenticated
  USING (organization_id = get_user_organization_id());

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ars_updated_at ON public.appointment_reminder_settings;
CREATE TRIGGER trg_ars_updated_at
  BEFORE UPDATE ON public.appointment_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. Fila persistente de lembretes ─────────────────────────────────────────

CREATE TYPE IF NOT EXISTS public.reminder_status_enum AS ENUM
  ('pending', 'processing', 'sent', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id             UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id        UUID        NOT NULL REFERENCES public.client_appointments(id) ON DELETE CASCADE,
  reminder_setting_id   UUID        REFERENCES public.appointment_reminder_settings(id) ON DELETE SET NULL,

  channel               TEXT        NOT NULL CHECK (channel IN ('whatsapp','email')),

  -- Quando deve ser enviado (UTC, calculado a partir do timing + timezone)
  scheduled_at          TIMESTAMPTZ NOT NULL,

  -- Status
  status                public.reminder_status_enum NOT NULL DEFAULT 'pending',

  -- Controle de processamento (claim atômico)
  processing_at         TIMESTAMPTZ,  -- quando foi reservado para processamento
  processing_worker_id  TEXT,         -- ID do worker que reservou (prevenção de conflito)

  -- Resultado
  sent_at               TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  last_error            TEXT,
  error_retryable       BOOLEAN,
  provider_message_id   TEXT,         -- wamid... ou ID do Resend

  -- Tentativas
  attempts              INTEGER     NOT NULL DEFAULT 0,
  max_attempts          INTEGER     NOT NULL DEFAULT 3,

  -- Snapshot dos dados no momento do agendamento (para envio sem re-buscar)
  payload               JSONB       NOT NULL DEFAULT '{}',
  -- Contém: customer_name, customer_phone, customer_email, service_name,
  --         appointment_date (formatted), appointment_time (formatted),
  --         professional_name, template_name, template_params, etc.

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices críticos para performance do worker
CREATE INDEX IF NOT EXISTS idx_ar_pending
  ON public.appointment_reminders(scheduled_at, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ar_appointment
  ON public.appointment_reminders(appointment_id, channel, status);

CREATE INDEX IF NOT EXISTS idx_ar_client
  ON public.appointment_reminders(client_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_ar_processing
  ON public.appointment_reminders(processing_at)
  WHERE status = 'processing';

-- Idempotência: um lembrete por regra+canal por agendamento (enquanto não cancelado)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_unique_active
  ON public.appointment_reminders(appointment_id, reminder_setting_id, channel)
  WHERE status IN ('pending','processing','sent');

-- RLS — worker usa service_role, frontend usa authenticated
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_select ON public.appointment_reminders;
CREATE POLICY ar_select ON public.appointment_reminders
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ar_updated_at ON public.appointment_reminders;
CREATE TRIGGER trg_ar_updated_at
  BEFORE UPDATE ON public.appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 5. RPC: claim_appointment_reminders (atômico) ────────────────────────────
-- Reserva atômicamente lembretes PENDING elegíveis para processamento.
-- Usa UPDATE ... RETURNING para garantir que dois workers não obtenham o mesmo.

CREATE OR REPLACE FUNCTION public.claim_appointment_reminders(
  p_limit        INTEGER DEFAULT 50,
  p_worker_id    TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id                  UUID,
  organization_id     UUID,
  client_id           UUID,
  appointment_id      UUID,
  reminder_setting_id UUID,
  channel             TEXT,
  scheduled_at        TIMESTAMPTZ,
  attempts            INTEGER,
  max_attempts        INTEGER,
  payload             JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_worker_id TEXT;
BEGIN
  v_worker_id := COALESCE(p_worker_id, gen_random_uuid()::TEXT);

  RETURN QUERY
  WITH eligible AS (
    SELECT ar.id
    FROM   public.appointment_reminders ar
    WHERE  ar.status      = 'pending'
    AND    ar.scheduled_at <= now()
    AND    ar.attempts     < ar.max_attempts
    ORDER  BY ar.scheduled_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED   -- evita bloqueio entre workers concorrentes
  ),
  claimed AS (
    UPDATE public.appointment_reminders ar
    SET    status             = 'processing',
           processing_at     = now(),
           processing_worker_id = v_worker_id,
           updated_at        = now()
    FROM   eligible
    WHERE  ar.id = eligible.id
    RETURNING
      ar.id,
      ar.organization_id,
      ar.client_id,
      ar.appointment_id,
      ar.reminder_setting_id,
      ar.channel,
      ar.scheduled_at,
      ar.attempts,
      ar.max_attempts,
      ar.payload
  )
  SELECT * FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_appointment_reminders TO authenticated;

-- ── 6. RPC: schedule_appointment_reminders ────────────────────────────────────
-- Gera registros na fila ao criar ou reagendar um agendamento.
-- Chama a função utilitária _compute_scheduled_at internamente.

CREATE OR REPLACE FUNCTION public._compute_reminder_scheduled_at(
  p_appointment_start  TIMESTAMPTZ,
  p_timing_type        TEXT,
  p_days_before        INTEGER,
  p_hours_before       INTEGER,
  p_send_time          TIME,
  p_timezone           TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_tz       TEXT;
  v_result   TIMESTAMPTZ;
  v_base_day DATE;
  v_send_day DATE;
BEGIN
  v_tz := COALESCE(p_timezone, 'America/Sao_Paulo');

  CASE p_timing_type
    WHEN 'hours_before' THEN
      v_result := p_appointment_start - (p_hours_before || ' hours')::interval;

    WHEN 'previous_day' THEN
      -- Dia do agendamento no timezone da empresa
      v_base_day := (p_appointment_start AT TIME ZONE v_tz)::DATE;
      v_send_day := v_base_day - INTERVAL '1 day';
      v_result   := (v_send_day::TEXT || ' ' || p_send_time::TEXT)::TIMESTAMPTZ AT TIME ZONE v_tz;

    WHEN 'same_day' THEN
      v_base_day := (p_appointment_start AT TIME ZONE v_tz)::DATE;
      v_result   := (v_base_day::TEXT || ' ' || p_send_time::TEXT)::TIMESTAMPTZ AT TIME ZONE v_tz;

    WHEN 'custom' THEN
      v_base_day := (p_appointment_start AT TIME ZONE v_tz)::DATE;
      v_send_day := v_base_day - (p_days_before || ' days')::interval;
      v_result   := (v_send_day::TEXT || ' ' || p_send_time::TEXT)::TIMESTAMPTZ AT TIME ZONE v_tz;

    ELSE
      -- Fallback: 24h antes
      v_result := p_appointment_start - INTERVAL '24 hours';
  END CASE;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_appointment_reminders(
  p_appointment_id UUID
)
RETURNS INTEGER  -- número de lembretes gerados/atualizados
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appt        RECORD;
  v_setting     RECORD;
  v_timezone    TEXT;
  v_scheduled   TIMESTAMPTZ;
  v_payload     JSONB;
  v_count       INTEGER := 0;
BEGIN
  -- Busca agendamento
  SELECT
    a.*,
    c.timezone           AS client_timezone,
    o.timezone           AS org_timezone,
    o.id                 AS org_id,
    ss.name              AS service_name_resolved,
    pr.name              AS professional_name_resolved
  INTO v_appt
  FROM  public.client_appointments a
  JOIN  public.clients c          ON c.id = a.client_id
  JOIN  public.organizations o    ON o.id = a.organization_id
  LEFT JOIN public.client_schedule_services ss ON ss.id = a.service_id
  LEFT JOIN public.client_schedule_professionals pr ON pr.id = a.professional_id
  WHERE a.id = p_appointment_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  -- Só gera lembretes para agendamentos futuros e não cancelados
  IF v_appt.status = 'cancelled' OR v_appt.start_at <= now() THEN
    RETURN 0;
  END IF;

  -- Timezone efetivo (cliente > organização > fallback)
  v_timezone := COALESCE(v_appt.client_timezone, v_appt.org_timezone, 'America/Sao_Paulo');

  -- Para cada regra ativa deste cliente
  FOR v_setting IN
    SELECT ars.*, wt.name AS template_name, wt.language AS template_language,
           wt.variable_mapping
    FROM   public.appointment_reminder_settings ars
    LEFT JOIN public.whatsapp_templates wt ON wt.id = ars.whatsapp_template_id
    WHERE  ars.client_id = v_appt.client_id
    AND    ars.enabled   = true
    AND    (ars.channel  = 'email'
            OR (ars.channel = 'whatsapp' AND (ars.whatsapp_template_id IS NULL
                OR wt.status = 'APPROVED')))
  LOOP
    -- Calcula scheduled_at
    v_scheduled := public._compute_reminder_scheduled_at(
      v_appt.start_at,
      v_setting.timing_type,
      v_setting.days_before,
      v_setting.hours_before,
      v_setting.send_time,
      v_timezone
    );

    -- Edge case: horário já passou mas agendamento ainda é futuro — enviar imediatamente
    IF v_scheduled < now() AND v_appt.start_at > now() THEN
      v_scheduled := now();
    END IF;

    -- Monta payload com todos os dados necessários para o n8n
    v_payload := jsonb_build_object(
      'channel',            v_setting.channel,
      'customer_name',      v_appt.customer_name,
      'customer_phone',     COALESCE(v_appt.whatsapp_notify_phone, v_appt.customer_phone),
      'customer_email',     COALESCE(v_appt.email_notify_address, v_appt.customer_email),
      'service_name',       COALESCE(v_appt.service_name, v_setting.service_name_resolved),
      'professional_name',  v_appt.professional_name_resolved,
      'appointment_date',   to_char(v_appt.start_at AT TIME ZONE v_timezone, 'DD/MM/YYYY'),
      'appointment_time',   to_char(v_appt.start_at AT TIME ZONE v_timezone, 'HH24:MI'),
      'appointment_weekday',to_char(v_appt.start_at AT TIME ZONE v_timezone, 'TMDay'),
      'start_at',           v_appt.start_at,
      'whatsapp_template',  CASE WHEN v_setting.channel = 'whatsapp' THEN jsonb_build_object(
        'name',      v_setting.template_name,
        'language',  COALESCE(v_setting.template_language, 'pt_BR'),
        'mapping',   COALESCE(v_setting.variable_mapping, '{}')
      ) ELSE NULL END,
      'email_subject',      v_setting.email_subject,
      'email_body',         v_setting.email_body
    );

    -- Upsert: se já existe lembrete PENDING/PROCESSING para este appointment+setting+channel, atualiza
    INSERT INTO public.appointment_reminders (
      organization_id, client_id, appointment_id, reminder_setting_id,
      channel, scheduled_at, status, payload
    )
    VALUES (
      v_appt.org_id, v_appt.client_id, p_appointment_id, v_setting.id,
      v_setting.channel, v_scheduled, 'pending', v_payload
    )
    ON CONFLICT (appointment_id, reminder_setting_id, channel)
    WHERE status IN ('pending','processing','sent')
    DO UPDATE SET
      scheduled_at = EXCLUDED.scheduled_at,
      payload      = EXCLUDED.payload,
      status       = CASE
        WHEN appointment_reminders.status = 'sent' THEN 'sent'  -- não reabre enviado
        ELSE 'pending'
      END,
      updated_at   = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_appointment_reminders TO authenticated;

-- ── 7. RPC: cancel_appointment_reminders ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_appointment_reminders(
  p_appointment_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.appointment_reminders
  SET    status       = 'cancelled',
         cancelled_at = now(),
         updated_at   = now()
  WHERE  appointment_id = p_appointment_id
  AND    status IN ('pending','processing');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_reminders TO authenticated;

-- ── 8. Trigger automático em client_appointments ─────────────────────────────
-- Gera/recalcula lembretes ao criar ou atualizar agendamento.
-- Cancela lembretes ao cancelar agendamento.

CREATE OR REPLACE FUNCTION public._trg_appointment_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Cancelamento: cancela todos os lembretes pendentes
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    PERFORM public.cancel_appointment_reminders(NEW.id);
    RETURN NEW;
  END IF;

  -- Criação ou mudança relevante (data/hora ou status saindo de cancelado)
  IF TG_OP = 'INSERT'
     OR NEW.start_at <> OLD.start_at
     OR NEW.end_at   <> OLD.end_at
     OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled')
  THEN
    -- Cancela lembretes pendentes antigos (para reagendamento)
    IF TG_OP = 'UPDATE' THEN
      UPDATE public.appointment_reminders
      SET    status       = 'cancelled',
             cancelled_at = now(),
             updated_at   = now()
      WHERE  appointment_id = NEW.id
      AND    status IN ('pending','processing');
    END IF;

    -- Gera novos lembretes
    PERFORM public.schedule_appointment_reminders(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_reminders ON public.client_appointments;
CREATE TRIGGER trg_appointment_reminders
  AFTER INSERT OR UPDATE OF start_at, end_at, status
  ON public.client_appointments
  FOR EACH ROW EXECUTE FUNCTION public._trg_appointment_reminders();

-- ── 9. Versão ─────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('114_whatsapp_templates_and_reminders_v1')
ON CONFLICT (version) DO NOTHING;

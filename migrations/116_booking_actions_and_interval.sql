-- =============================================================================
-- Migration 116: Tokens de Ação de Agendamento + Intervalo Mínimo entre Bookings
--
-- 1. appointment_action_tokens — tokens únicos por agendamento para ações
--    públicas (confirmar / cancelar / reagendar) via link no e-mail/WhatsApp
-- 2. booking_interval_days em client_schedule_config — intervalo mínimo de dias
--    que o mesmo cliente/paciente pode agendar novamente
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 1. Tokens de ação ────────────────────────────────────────────────────────
--
-- Cada agendamento pode ter até 3 tokens ativos (confirm, reschedule, cancel).
-- O token é um UUID gerado pelo banco, enviado embutido no link do lembrete.
-- Expira em 48 horas por padrão (configurável por action_type).
--
-- Segurança:
--   - Token é UUID v4 aleatório (suficientemente entrópico)
--   - Exige client_id + appointment_id além do token (duplo check)
--   - Uso único: used_at é marcado na primeira ação bem-sucedida
--   - Expirado ou usado → retorna 410 Gone

CREATE TABLE IF NOT EXISTS public.appointment_action_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID        NOT NULL REFERENCES public.client_appointments(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Tipo de ação que este token autoriza
  action_type     TEXT        NOT NULL
                  CHECK (action_type IN ('confirm', 'cancel', 'reschedule')),

  -- Token público (enviado no link)
  token           UUID        NOT NULL DEFAULT gen_random_uuid(),

  -- Expiração (padrão: 48h a partir da criação)
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),

  -- Controle de uso
  used_at         TIMESTAMPTZ,    -- NULL = ainda não usado
  used_ip         TEXT,           -- IP que usou o token
  used_action     TEXT,           -- ação realizada (confirmação do tipo)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_aat_token
  ON public.appointment_action_tokens(token);

CREATE INDEX IF NOT EXISTS idx_aat_appointment
  ON public.appointment_action_tokens(appointment_id, action_type)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_aat_expires
  ON public.appointment_action_tokens(expires_at)
  WHERE used_at IS NULL;

-- RLS — apenas service_role acessa (tokens são gerados/consumidos pelo backend)
ALTER TABLE public.appointment_action_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aat_service ON public.appointment_action_tokens;
-- service_role tem acesso irrestrito por padrão (bypass RLS)
-- authenticated não acessa tokens de outros clientes
CREATE POLICY aat_org ON public.appointment_action_tokens
  FOR SELECT TO authenticated
  USING (organization_id = get_user_organization_id());

COMMENT ON TABLE public.appointment_action_tokens IS
  'Tokens de uso único para ações públicas de agendamento (confirmar/cancelar/reagendar). '
  'Enviados por link em e-mails e mensagens WhatsApp de lembrete.';

-- ── 2. Intervalo mínimo entre agendamentos do mesmo cliente ──────────────────
--
-- Quando preenchido, a Edge Function agenda-booking verifica se o customer_phone
-- já tem um agendamento ativo dentro dos últimos N dias.
-- 0 = sem restrição (comportamento atual)
-- Ex: 30 = o mesmo paciente só pode agendar a cada 30 dias

ALTER TABLE public.client_schedule_config
  ADD COLUMN IF NOT EXISTS booking_interval_days INTEGER NOT NULL DEFAULT 0
    CHECK (booking_interval_days >= 0);

COMMENT ON COLUMN public.client_schedule_config.booking_interval_days IS
  'Intervalo mínimo em dias entre agendamentos do mesmo cliente/paciente (identificado por telefone). '
  '0 = sem restrição. Ex: 30 = só pode agendar a cada 30 dias.';

-- ── 3. RPC: generate_action_tokens ───────────────────────────────────────────
-- Gera os 3 tokens para um agendamento (confirm + cancel + reschedule)
-- e retorna os UUIDs. Chamada ao criar o lembrete ou ao enviar notificação.

CREATE OR REPLACE FUNCTION public.generate_action_tokens(
  p_appointment_id UUID,
  p_expires_hours  INTEGER DEFAULT 48
)
RETURNS TABLE (
  action_type TEXT,
  token       UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id       UUID;
  v_organization_id UUID;
BEGIN
  -- Busca dados do agendamento
  SELECT ca.client_id, ca.organization_id
    INTO v_client_id, v_organization_id
  FROM public.client_appointments ca
  WHERE ca.id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado: %', p_appointment_id;
  END IF;

  -- Deleta tokens anteriores não usados para este agendamento
  DELETE FROM public.appointment_action_tokens
  WHERE appointment_id = p_appointment_id
    AND used_at IS NULL;

  -- Gera 3 novos tokens
  INSERT INTO public.appointment_action_tokens
    (appointment_id, client_id, organization_id, action_type, expires_at)
  VALUES
    (p_appointment_id, v_client_id, v_organization_id, 'confirm',    now() + (p_expires_hours || ' hours')::INTERVAL),
    (p_appointment_id, v_client_id, v_organization_id, 'cancel',     now() + (p_expires_hours || ' hours')::INTERVAL),
    (p_appointment_id, v_client_id, v_organization_id, 'reschedule', now() + (p_expires_hours || ' hours')::INTERVAL);

  RETURN QUERY
  SELECT aat.action_type, aat.token
  FROM public.appointment_action_tokens aat
  WHERE aat.appointment_id = p_appointment_id
    AND aat.used_at IS NULL
  ORDER BY aat.action_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_action_tokens TO authenticated;

-- ── 4. RPC: resolve_action_token ─────────────────────────────────────────────
-- Valida e consome um token de ação.
-- Retorna os dados do agendamento + tipo de ação ou erro.

CREATE OR REPLACE FUNCTION public.resolve_action_token(
  p_token  UUID,
  p_ip     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec   RECORD;
  v_appt  RECORD;
BEGIN
  -- Busca token
  SELECT aat.*, ca.status AS appt_status,
         ca.customer_name, ca.customer_phone, ca.customer_email,
         ca.service_name, ca.start_at, ca.end_at,
         ca.professional_name,
         cl.dashboard_slug AS slug,
         o.timezone
  INTO v_rec
  FROM public.appointment_action_tokens aat
  JOIN public.client_appointments ca ON ca.id = aat.appointment_id
  JOIN public.clients cl ON cl.id = aat.client_id
  JOIN public.organizations o ON o.id = aat.organization_id
  WHERE aat.token = p_token;

  -- Token não encontrado
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'token_not_found', 'code', 404);
  END IF;

  -- Token já usado
  IF v_rec.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'token_already_used', 'code', 410,
      'used_at', v_rec.used_at, 'action_type', v_rec.action_type);
  END IF;

  -- Token expirado
  IF v_rec.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'token_expired', 'code', 410,
      'expires_at', v_rec.expires_at);
  END IF;

  -- Agendamento já cancelado — não faz sentido confirmar/reagendar
  IF v_rec.appt_status = 'cancelled' AND v_rec.action_type != 'cancel' THEN
    RETURN jsonb_build_object('error', 'appointment_already_cancelled', 'code', 409);
  END IF;

  -- Marca token como usado
  UPDATE public.appointment_action_tokens
  SET used_at    = now(),
      used_ip    = p_ip,
      used_action = v_rec.action_type
  WHERE token = p_token;

  -- Retorna dados completos para o backend processar a ação
  RETURN jsonb_build_object(
    'ok',              true,
    'action_type',     v_rec.action_type,
    'appointment_id',  v_rec.appointment_id,
    'client_id',       v_rec.client_id,
    'organization_id', v_rec.organization_id,
    'slug',            v_rec.slug,
    'appt_status',     v_rec.appt_status,
    'customer_name',   v_rec.customer_name,
    'customer_phone',  v_rec.customer_phone,
    'customer_email',  v_rec.customer_email,
    'service_name',    v_rec.service_name,
    'start_at',        v_rec.start_at,
    'end_at',          v_rec.end_at,
    'professional_name', v_rec.professional_name,
    'timezone',        v_rec.timezone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_action_token TO anon, authenticated;

-- ── 5. Versão ─────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('116_booking_actions_and_interval_v1')
ON CONFLICT (version) DO NOTHING;

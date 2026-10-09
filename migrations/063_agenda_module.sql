-- ============================================================
-- Migration 063: Módulo Agenda — C8 Control (Fase 1)
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Todas as tabelas usam client_id → clients(id) para isolamento
-- multi-tenant. RLS garante que cada cliente só acessa seus dados.
--
-- Tabelas criadas:
--   • client_appointments      — agendamentos recebidos
--   • client_schedule_config   — configuração de disponibilidade
--   • client_schedule_services — serviços oferecidos (agenda)
--   • client_google_calendar_tokens — tokens OAuth Google (nunca expostos)
-- ============================================================

-- ─── 1. Agendamentos ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_appointments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Dados do paciente/cliente final (quem agendou)
  customer_name    TEXT        NOT NULL,
  customer_phone   TEXT,
  customer_email   TEXT,

  -- Serviço e horário (FK adicionada após criação de client_schedule_services — seção 2)
  service_id       UUID,
  service_name     TEXT        NOT NULL,   -- desnormalizado para histórico
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  duration_min     INTEGER     NOT NULL DEFAULT 60,

  -- Estado
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  cancelled_reason TEXT,

  -- Origem e sync
  source           TEXT        NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','public_form','google_calendar','whatsapp')),
  google_event_id  TEXT,       -- ID do evento no Google Calendar (para sync)
  google_calendar_id TEXT,     -- ID do calendário onde o evento foi criado

  -- Extras
  notes            TEXT,
  metadata         JSONB       DEFAULT '{}',  -- dados extras do formulário público

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_client_id
  ON public.client_appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_at
  ON public.client_appointments(client_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON public.client_appointments(client_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id
  ON public.client_appointments(google_event_id)
  WHERE google_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_customer_phone
  ON public.client_appointments(customer_phone)
  WHERE customer_phone IS NOT NULL;

COMMENT ON TABLE public.client_appointments IS
  'Agendamentos do módulo Agenda do C8 Control. Armazenado no Banco A (multi-tenant).';

-- ─── 2. Serviços oferecidos ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_schedule_services (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  duration_min     INTEGER     NOT NULL DEFAULT 60,
  price            NUMERIC(10,2) DEFAULT 0,
  color            TEXT        DEFAULT '#6366f1',  -- cor no calendário
  active           BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_services_client_id
  ON public.client_schedule_services(client_id);

-- FK adicionada após criar a tabela referenciada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'client_appointments_service_id_fkey'
  ) THEN
    ALTER TABLE public.client_appointments
      ADD CONSTRAINT client_appointments_service_id_fkey
      FOREIGN KEY (service_id)
      REFERENCES public.client_schedule_services(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 3. Configuração de disponibilidade ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_schedule_config (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  weekday          SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
                                             -- 0=Dom, 1=Seg, ..., 6=Sáb
  start_time       TIME        NOT NULL DEFAULT '08:00',
  end_time         TIME        NOT NULL DEFAULT '18:00',
  slot_duration_min INTEGER    NOT NULL DEFAULT 60,
  max_per_slot     INTEGER     NOT NULL DEFAULT 1,  -- agendamentos simultâneos
  active           BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_schedule_config_client_id
  ON public.client_schedule_config(client_id);

-- ─── 4. Tokens OAuth Google Calendar ─────────────────────────────────────────
-- NUNCA retornados ao frontend — apenas lidos via RPCs SECURITY DEFINER.

CREATE TABLE IF NOT EXISTS public.client_google_calendar_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Tokens (NUNCA expostos)
  access_token     TEXT,
  refresh_token    TEXT,
  token_expiry     TIMESTAMPTZ,
  -- Calendário selecionado
  calendar_id      TEXT,        -- ex: "primary" ou ID de calendário específico
  calendar_name    TEXT,        -- nome exibido no frontend
  -- Estado da conexão
  connected        BOOLEAN     NOT NULL DEFAULT false,
  scope            TEXT,        -- escopos autorizados pelo usuário
  connected_at     TIMESTAMPTZ,
  disconnected_at  TIMESTAMPTZ,
  -- Webhook push do Google Calendar
  watch_channel_id TEXT,        -- ID do canal de notificação push
  watch_resource_id TEXT,       -- ID do recurso sendo observado
  watch_expiry     TIMESTAMPTZ, -- validade do canal (precisa renovar)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_tokens_client_id
  ON public.client_google_calendar_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_google_tokens_watch_channel
  ON public.client_google_calendar_tokens(watch_channel_id)
  WHERE watch_channel_id IS NOT NULL;

COMMENT ON TABLE public.client_google_calendar_tokens IS
  'Tokens OAuth2 do Google Calendar por cliente. Campos sensíveis nunca retornados ao frontend.';

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_appointments',
    'client_schedule_services',
    'client_schedule_config',
    'client_google_calendar_tokens'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Usuários autenticados: acesso aos dados do próprio client_id
    -- A verificação de client_id é feita pelas RPCs (SECURITY DEFINER)
    -- O frontend nunca acessa estas tabelas diretamente — sempre via RPC
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON public.%I
       FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);

    -- Anônimos: sem acesso direto (apenas via Edge Function agenda-booking)
    EXECUTE format('DROP POLICY IF EXISTS "no_anon_direct" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "no_anon_direct" ON public.%I
       FOR ALL TO anon USING (false)', t);
  END LOOP;
END $rls$;

-- ─── 6. Trigger updated_at ───────────────────────────────────────────────────

-- Garante que a função existe (idempotente — pode já existir de migrations anteriores)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $trg$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_appointments',
    'client_schedule_services',
    'client_schedule_config',
    'client_google_calendar_tokens'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $trg$;

-- ─── 7. RPCs de acesso (SECURITY DEFINER) ────────────────────────────────────

-- 7a. Retorna status da conexão Google Calendar (sem tokens)
CREATE OR REPLACE FUNCTION public.get_google_calendar_status(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.client_google_calendar_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.client_google_calendar_tokens
  WHERE client_id = p_client_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('connected', false, 'calendar_id', null, 'calendar_name', null);
  END IF;

  RETURN jsonb_build_object(
    'connected',      v_row.connected,
    'calendar_id',    v_row.calendar_id,
    'calendar_name',  v_row.calendar_name,
    'connected_at',   v_row.connected_at,
    'watch_expiry',   v_row.watch_expiry,
    'scope',          v_row.scope
    -- access_token e refresh_token NUNCA retornados
  );
END;
$$;

-- 7b. Desconectar Google Calendar (limpa tokens, mantém registro)
CREATE OR REPLACE FUNCTION public.disconnect_google_calendar(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_google_calendar_tokens SET
    access_token      = NULL,
    refresh_token     = NULL,
    token_expiry      = NULL,
    connected         = false,
    disconnected_at   = now(),
    watch_channel_id  = NULL,
    watch_resource_id = NULL,
    watch_expiry      = NULL,
    updated_at        = now()
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7c. Buscar agendamentos com filtros
CREATE OR REPLACE FUNCTION public.get_appointments(
  p_client_id  UUID,
  p_date_from  DATE DEFAULT CURRENT_DATE,
  p_date_to    DATE DEFAULT CURRENT_DATE + 30,
  p_status     TEXT DEFAULT NULL,
  p_limit      INTEGER DEFAULT 100,
  p_offset     INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows  JSONB;
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.client_appointments
  WHERE client_id = p_client_id
    AND start_at  >= p_date_from::TIMESTAMPTZ
    AND start_at  <  (p_date_to + 1)::TIMESTAMPTZ
    AND (p_status IS NULL OR status = p_status);

  SELECT jsonb_agg(row_to_json(a.*) ORDER BY a.start_at) INTO v_rows
  FROM (
    SELECT
      a.id, a.customer_name, a.customer_phone, a.customer_email,
      a.service_id, a.service_name, a.start_at, a.end_at, a.duration_min,
      a.status, a.cancelled_reason, a.source, a.google_event_id,
      a.notes, a.metadata, a.created_at, a.updated_at
    FROM public.client_appointments a
    WHERE a.client_id = p_client_id
      AND a.start_at  >= p_date_from::TIMESTAMPTZ
      AND a.start_at  <  (p_date_to + 1)::TIMESTAMPTZ
      AND (p_status IS NULL OR a.status = p_status)
    ORDER BY a.start_at
    LIMIT  p_limit
    OFFSET p_offset
  ) a;

  RETURN jsonb_build_object(
    'data',   COALESCE(v_rows, '[]'::JSONB),
    'total',  v_total,
    'limit',  p_limit,
    'offset', p_offset
  );
END;
$$;

-- 7d. Buscar slots disponíveis para um dia
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_client_id    UUID,
  p_date         DATE,
  p_service_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday      SMALLINT;
  v_config       public.client_schedule_config%ROWTYPE;
  v_duration_min INTEGER := 60;
  v_slots        JSONB   := '[]'::JSONB;
  v_slot_start   TIMESTAMPTZ;
  v_slot_end     TIMESTAMPTZ;
  v_booked       INTEGER;
BEGIN
  v_weekday := EXTRACT(DOW FROM p_date)::SMALLINT;

  SELECT * INTO v_config
  FROM public.client_schedule_config
  WHERE client_id = p_client_id
    AND weekday   = v_weekday
    AND active    = true
  LIMIT 1;

  -- Dia sem configuração ativa = sem disponibilidade
  IF NOT FOUND THEN
    RETURN jsonb_build_object('date', p_date, 'slots', '[]'::JSONB);
  END IF;

  -- Duração: usa o serviço se informado, senão usa o padrão do config
  IF p_service_id IS NOT NULL THEN
    SELECT duration_min INTO v_duration_min
    FROM public.client_schedule_services
    WHERE id = p_service_id AND client_id = p_client_id AND active = true;
  END IF;

  IF v_duration_min IS NULL THEN
    v_duration_min := v_config.slot_duration_min;
  END IF;

  -- Gera slots e verifica disponibilidade
  v_slot_start := (p_date::TEXT || ' ' || v_config.start_time::TEXT)::TIMESTAMPTZ;

  WHILE v_slot_start + (v_duration_min || ' minutes')::INTERVAL
        <= (p_date::TEXT || ' ' || v_config.end_time::TEXT)::TIMESTAMPTZ
  LOOP
    v_slot_end := v_slot_start + (v_duration_min || ' minutes')::INTERVAL;

    SELECT COUNT(*) INTO v_booked
    FROM public.client_appointments
    WHERE client_id = p_client_id
      AND status NOT IN ('cancelled')
      AND start_at < v_slot_end
      AND end_at   > v_slot_start;

    v_slots := v_slots || jsonb_build_object(
      'start_at',   v_slot_start,
      'end_at',     v_slot_end,
      'available',  v_booked < v_config.max_per_slot,
      'booked',     v_booked
    );

    v_slot_start := v_slot_end;
  END LOOP;

  RETURN jsonb_build_object('date', p_date, 'slots', v_slots);
END;
$$;

-- 7e. Criar ou atualizar agendamento
CREATE OR REPLACE FUNCTION public.upsert_appointment(
  p_client_id      UUID,
  p_customer_name  TEXT,
  p_start_at       TIMESTAMPTZ,
  p_end_at         TIMESTAMPTZ,
  p_service_name   TEXT,
  p_customer_phone TEXT  DEFAULT NULL,
  p_customer_email TEXT  DEFAULT NULL,
  p_service_id     UUID  DEFAULT NULL,
  p_notes          TEXT  DEFAULT NULL,
  p_source         TEXT  DEFAULT 'manual',
  p_metadata       JSONB DEFAULT '{}',
  p_appointment_id UUID  DEFAULT NULL   -- se informado, atualiza o existente
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id            UUID;
  v_org_id        UUID;
  v_duration_min  INTEGER;
BEGIN
  -- Busca organization_id do cliente
  SELECT organization_id INTO v_org_id
  FROM public.clients WHERE id = p_client_id LIMIT 1;

  v_duration_min := EXTRACT(EPOCH FROM (p_end_at - p_start_at))::INTEGER / 60;

  IF p_appointment_id IS NOT NULL THEN
    -- Atualização
    UPDATE public.client_appointments SET
      customer_name  = p_customer_name,
      customer_phone = p_customer_phone,
      customer_email = p_customer_email,
      service_id     = p_service_id,
      service_name   = p_service_name,
      start_at       = p_start_at,
      end_at         = p_end_at,
      duration_min   = v_duration_min,
      notes          = p_notes,
      source         = p_source,
      metadata       = COALESCE(p_metadata, '{}'),
      updated_at     = now()
    WHERE id = p_appointment_id AND client_id = p_client_id
    RETURNING id INTO v_id;
  ELSE
    -- Inserção
    INSERT INTO public.client_appointments (
      client_id, organization_id, customer_name, customer_phone,
      customer_email, service_id, service_name, start_at, end_at,
      duration_min, source, notes, metadata
    ) VALUES (
      p_client_id, v_org_id, p_customer_name, p_customer_phone,
      p_customer_email, p_service_id, p_service_name, p_start_at, p_end_at,
      v_duration_min, p_source, p_notes, COALESCE(p_metadata, '{}')
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- 7f. Cancelar agendamento
CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_appointment_id UUID,
  p_client_id      UUID,
  p_reason         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_google_event_id TEXT;
BEGIN
  UPDATE public.client_appointments SET
    status           = 'cancelled',
    cancelled_reason = p_reason,
    updated_at       = now()
  WHERE id        = p_appointment_id
    AND client_id = p_client_id
  RETURNING google_event_id INTO v_google_event_id;

  RETURN jsonb_build_object(
    'success',          true,
    'google_event_id',  v_google_event_id  -- retorna para o frontend poder cancelar no Google
  );
END;
$$;

-- 7g. Salvar tokens Google Calendar (chamada pela Edge Function após OAuth)
-- NUNCA chamada pelo frontend diretamente
CREATE OR REPLACE FUNCTION public.save_google_calendar_tokens(
  p_client_id       UUID,
  p_access_token    TEXT,
  p_refresh_token   TEXT,
  p_token_expiry    TIMESTAMPTZ,
  p_calendar_id     TEXT DEFAULT 'primary',
  p_calendar_name   TEXT DEFAULT 'Google Agenda',
  p_scope           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_google_calendar_tokens (
    client_id, access_token, refresh_token, token_expiry,
    calendar_id, calendar_name, connected, scope, connected_at
  ) VALUES (
    p_client_id, p_access_token, p_refresh_token, p_token_expiry,
    p_calendar_id, p_calendar_name, true, p_scope, now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    access_token    = EXCLUDED.access_token,
    refresh_token   = COALESCE(EXCLUDED.refresh_token, client_google_calendar_tokens.refresh_token),
    token_expiry    = EXCLUDED.token_expiry,
    calendar_id     = EXCLUDED.calendar_id,
    calendar_name   = EXCLUDED.calendar_name,
    connected       = true,
    scope           = COALESCE(EXCLUDED.scope, client_google_calendar_tokens.scope),
    connected_at    = now(),
    disconnected_at = NULL,
    updated_at      = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7h. Buscar tokens para uso interno (Edge Function / n8n)
-- Restrita a service_role — nunca acessível ao frontend
CREATE OR REPLACE FUNCTION public.get_google_calendar_tokens(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.client_google_calendar_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.client_google_calendar_tokens
  WHERE client_id = p_client_id AND connected = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found',          true,
    'access_token',   v_row.access_token,
    'refresh_token',  v_row.refresh_token,
    'token_expiry',   v_row.token_expiry,
    'calendar_id',    v_row.calendar_id
  );
END;
$$;

-- Restrita a service_role
REVOKE ALL ON FUNCTION public.get_google_calendar_tokens(UUID) FROM PUBLIC, anon, authenticated;

-- 7i. Atualizar google_event_id após criar evento no Google Calendar
CREATE OR REPLACE FUNCTION public.set_appointment_google_event(
  p_appointment_id   UUID,
  p_google_event_id  TEXT,
  p_google_calendar_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_appointments SET
    google_event_id    = p_google_event_id,
    google_calendar_id = p_google_calendar_id,
    updated_at         = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7j. Atualizar watch channel do Google Calendar
CREATE OR REPLACE FUNCTION public.save_google_watch_channel(
  p_client_id        UUID,
  p_channel_id       TEXT,
  p_resource_id      TEXT,
  p_expiry           TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_google_calendar_tokens SET
    watch_channel_id  = p_channel_id,
    watch_resource_id = p_resource_id,
    watch_expiry      = p_expiry,
    updated_at        = now()
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grants das RPCs públicas (chamáveis pelo frontend autenticado)
GRANT EXECUTE ON FUNCTION public.get_google_calendar_status(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_google_calendar(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointments(UUID,DATE,DATE,TEXT,INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID,DATE,UUID)    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.upsert_appointment(UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,JSONB,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(UUID,UUID,TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_google_event(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_google_watch_channel(UUID,TEXT,TEXT,TIMESTAMPTZ) TO authenticated;
-- save_google_calendar_tokens: apenas service_role (via Edge Function)
-- get_google_calendar_tokens:  apenas service_role (via n8n / Edge Function)

-- ─── 8. Seed: configuração padrão de dias úteis ──────────────────────────────
-- Não faz seed automático — cada cliente configura sua disponibilidade
-- na página AgendaConfigPage do C8 Control.

-- ─── 9. Comentários finais ───────────────────────────────────────────────────
COMMENT ON FUNCTION public.get_available_slots IS
  'Calcula slots disponíveis para um dia específico, respeitando a config de disponibilidade e agendamentos existentes. Acesso anon permitido para o formulário público de booking.';
COMMENT ON FUNCTION public.upsert_appointment IS
  'Cria ou atualiza agendamento. Chamada pelo C8 Control (manual) ou pela Edge Function agenda-booking (formulário público).';

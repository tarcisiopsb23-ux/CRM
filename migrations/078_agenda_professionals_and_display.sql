-- =============================================================================
-- Migration 078: Agenda — Profissionais, vínculo com produtos CRM e
--                configurações de exibição no formulário público
--
-- Alterações:
--   1. Nova tabela: client_schedule_professionals
--      Profissionais/atendentes disponíveis para agendamento por cliente.
--
--   2. client_schedule_services: adiciona crm_product_id (FK opcional)
--      Vincula o serviço de agenda a um produto do CRM sem duplicar dados.
--      O name/description/price são herdados do produto — só duration_min
--      e color são configurados aqui.
--
--   3. client_appointments: adiciona professional_id e professional_name
--      Qual profissional foi reservado no agendamento.
--
--   4. client_schedule_config: adiciona colunas de exibição
--      show_services     — exibir seleção de serviço no formulário público
--      show_professionals — exibir seleção de profissional no formulário público
--      (quando ambos false → agendamento direto sem seleções)
--
-- Execute: Supabase SQL Editor com service_role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 1. Profissionais/atendentes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_schedule_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,                    -- nome de exibição
  role            TEXT,                                    -- cargo/especialidade (ex: "Médico", "Nutricionista")
  bio             TEXT,                                    -- descrição curta opcional
  avatar_url      TEXT,                                    -- foto opcional
  color           TEXT        NOT NULL DEFAULT '#6366f1',  -- cor no calendário
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_professionals_client_id
  ON public.client_schedule_professionals(client_id);
CREATE INDEX IF NOT EXISTS idx_schedule_professionals_active
  ON public.client_schedule_professionals(client_id, active)
  WHERE active = true;

ALTER TABLE public.client_schedule_professionals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.client_schedule_professionals;
CREATE POLICY "authenticated_access" ON public.client_schedule_professionals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "no_anon_access" ON public.client_schedule_professionals;
CREATE POLICY "no_anon_access" ON public.client_schedule_professionals
  FOR ALL TO anon USING (false);

CREATE TRIGGER trg_schedule_professionals_updated_at
  BEFORE UPDATE ON public.client_schedule_professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.client_schedule_professionals IS
  'Profissionais/atendentes disponíveis para agendamento. Exibição no formulário público controlada por client_schedule_config.show_professionals.';

-- ─── 2. client_schedule_services: vínculo com produto CRM ────────────────────
-- crm_product_id é opcional — quando preenchido, name/description/price
-- são herdados do produto. Quando NULL, o serviço é autônomo (legado).

ALTER TABLE public.client_schedule_services
  ADD COLUMN IF NOT EXISTS crm_product_id UUID REFERENCES public.client_crm_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_services_crm_product_id
  ON public.client_schedule_services(crm_product_id)
  WHERE crm_product_id IS NOT NULL;

COMMENT ON COLUMN public.client_schedule_services.crm_product_id IS
  'Produto do CRM vinculado a este serviço. Quando preenchido, name/description/price são herdados do produto. Apenas duration_min e color são configurados aqui.';

-- ─── 3. client_appointments: profissional reservado ──────────────────────────

ALTER TABLE public.client_appointments
  ADD COLUMN IF NOT EXISTS professional_id   UUID REFERENCES public.client_schedule_professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professional_name TEXT; -- desnormalizado para histórico

CREATE INDEX IF NOT EXISTS idx_appointments_professional_id
  ON public.client_appointments(professional_id)
  WHERE professional_id IS NOT NULL;

COMMENT ON COLUMN public.client_appointments.professional_id IS
  'Profissional reservado. NULL quando show_professionals=false ou não selecionado.';
COMMENT ON COLUMN public.client_appointments.professional_name IS
  'Nome do profissional desnormalizado — mantém histórico mesmo se profissional for removido.';

-- ─── 4. client_schedule_config: configurações de exibição ────────────────────

ALTER TABLE public.client_schedule_config
  ADD COLUMN IF NOT EXISTS show_services      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_professionals BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_schedule_config.show_services IS
  'Exibir seleção de serviço no formulário público de agendamento.';
COMMENT ON COLUMN public.client_schedule_config.show_professionals IS
  'Exibir seleção de profissional no formulário público de agendamento.';

-- ─── 5. RPC: get_schedule_professionals (pública, sem auth) ──────────────────
-- Usada pelo BookingPage (formulário público /booking/:slug).

CREATE OR REPLACE FUNCTION public.get_schedule_professionals(
  p_client_id UUID
)
RETURNS TABLE (
  id        UUID,
  name      TEXT,
  role      TEXT,
  bio       TEXT,
  avatar_url TEXT,
  color     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id,
    sp.name,
    sp.role,
    sp.bio,
    sp.avatar_url,
    sp.color
  FROM public.client_schedule_professionals sp
  WHERE sp.client_id = p_client_id
    AND sp.active = true
  ORDER BY sp.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_professionals(UUID) TO anon, authenticated, service_role;

-- ─── 6. RPC: get_agenda_display_config (pública, sem auth) ───────────────────
-- Retorna configurações de exibição do formulário público.

CREATE OR REPLACE FUNCTION public.get_agenda_display_config(
  p_client_id UUID
)
RETURNS TABLE (
  show_services      BOOLEAN,
  show_professionals BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lê de qualquer linha da config (todos os dias têm o mesmo valor)
  RETURN QUERY
  SELECT
    COALESCE(bool_or(sc.show_services),      true)  AS show_services,
    COALESCE(bool_or(sc.show_professionals), false) AS show_professionals
  FROM public.client_schedule_config sc
  WHERE sc.client_id = p_client_id;

  -- Se não tem config ainda, retorna defaults
  IF NOT FOUND THEN
    RETURN QUERY SELECT true, false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agenda_display_config(UUID) TO anon, authenticated, service_role;

-- ─── 7. Atualizar RPC get_available_slots para aceitar professional_id ────────
-- O slot considera profissional reservado quando selecionado.
-- Mantém compatibilidade: professional_id = NULL = sem filtro por profissional.

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_client_id   UUID,
  p_date        DATE,
  p_service_id  UUID DEFAULT NULL,
  p_professional_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday    INTEGER := EXTRACT(DOW FROM p_date)::INTEGER;
  v_config     public.client_schedule_config%ROWTYPE;
  v_duration   INTEGER := 60;
  v_slots      JSONB   := '[]'::JSONB;
  v_slot_start TIMESTAMPTZ;
  v_slot_end   TIMESTAMPTZ;
  v_booked     INTEGER;
  v_tz         TEXT    := 'America/Sao_Paulo';
BEGIN
  -- Busca config do dia
  SELECT * INTO v_config
  FROM public.client_schedule_config
  WHERE client_id = p_client_id AND weekday = v_weekday AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Duração: usa a do serviço se fornecido, senão a do config do dia
  IF p_service_id IS NOT NULL THEN
    SELECT duration_min INTO v_duration
    FROM public.client_schedule_services
    WHERE id = p_service_id AND client_id = p_client_id AND active = true;
  END IF;

  IF v_duration IS NULL THEN
    v_duration := v_config.slot_duration_min;
  END IF;

  -- Gera slots
  v_slot_start := (p_date || ' ' || v_config.start_time)::TIMESTAMPTZ AT TIME ZONE v_tz;

  WHILE v_slot_start + (v_duration || ' minutes')::INTERVAL <=
        (p_date || ' ' || v_config.end_time)::TIMESTAMPTZ AT TIME ZONE v_tz
  LOOP
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;

    -- Conta agendamentos no slot (filtra por profissional se informado)
    SELECT COUNT(*) INTO v_booked
    FROM public.client_appointments
    WHERE client_id = p_client_id
      AND status NOT IN ('cancelled', 'no_show')
      AND start_at < v_slot_end
      AND end_at   > v_slot_start
      AND (p_professional_id IS NULL OR professional_id = p_professional_id);

    v_slots := v_slots || jsonb_build_object(
      'start_at',  v_slot_start,
      'end_at',    v_slot_end,
      'available', v_booked < v_config.max_per_slot,
      'booked',    v_booked
    );

    v_slot_start := v_slot_end;
  END LOOP;

  RETURN v_slots;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, UUID, UUID) TO anon, authenticated, service_role;

-- ─── 8. Atualizar RPC upsert_appointment para aceitar professional_id ─────────

CREATE OR REPLACE FUNCTION public.upsert_appointment(
  p_client_id        UUID,
  p_customer_name    TEXT,
  p_customer_phone   TEXT    DEFAULT NULL,
  p_customer_email   TEXT    DEFAULT NULL,
  p_service_id       UUID    DEFAULT NULL,
  p_service_name     TEXT    DEFAULT 'Agendamento',
  p_start_at         TIMESTAMPTZ DEFAULT NULL,
  p_end_at           TIMESTAMPTZ DEFAULT NULL,
  p_notes            TEXT    DEFAULT NULL,
  p_source           TEXT    DEFAULT 'manual',
  p_metadata         JSONB   DEFAULT '{}',
  p_appointment_id   UUID    DEFAULT NULL,
  p_professional_id  UUID    DEFAULT NULL,
  p_professional_name TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id   UUID;
  v_duration INTEGER := 60;
  v_id       UUID;
  v_prof_name TEXT := p_professional_name;
BEGIN
  -- Busca organization_id do cliente
  SELECT organization_id INTO v_org_id FROM public.clients WHERE id = p_client_id;

  -- Duração do serviço
  IF p_service_id IS NOT NULL THEN
    SELECT duration_min INTO v_duration
    FROM public.client_schedule_services
    WHERE id = p_service_id AND client_id = p_client_id;
  END IF;

  -- Busca nome do profissional se não fornecido
  IF p_professional_id IS NOT NULL AND v_prof_name IS NULL THEN
    SELECT name INTO v_prof_name
    FROM public.client_schedule_professionals
    WHERE id = p_professional_id AND client_id = p_client_id;
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    -- Atualiza existente
    UPDATE public.client_appointments SET
      customer_name    = p_customer_name,
      customer_phone   = p_customer_phone,
      customer_email   = p_customer_email,
      service_id       = p_service_id,
      service_name     = p_service_name,
      start_at         = p_start_at,
      end_at           = p_end_at,
      duration_min     = COALESCE(v_duration, 60),
      notes            = p_notes,
      source           = p_source,
      metadata         = p_metadata,
      professional_id  = p_professional_id,
      professional_name = v_prof_name,
      updated_at       = now()
    WHERE id = p_appointment_id AND client_id = p_client_id
    RETURNING id INTO v_id;
  ELSE
    -- Cria novo
    INSERT INTO public.client_appointments (
      client_id, organization_id,
      customer_name, customer_phone, customer_email,
      service_id, service_name, start_at, end_at, duration_min,
      notes, source, metadata,
      professional_id, professional_name
    ) VALUES (
      p_client_id, v_org_id,
      p_customer_name, p_customer_phone, p_customer_email,
      p_service_id, p_service_name, p_start_at, p_end_at, COALESCE(v_duration, 60),
      p_notes, p_source, p_metadata,
      p_professional_id, v_prof_name
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_appointment(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,JSONB,UUID,UUID,TEXT) TO authenticated, service_role;

-- ─── Registra versão ──────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version)
VALUES ('078_agenda_professionals_and_display_v1')
ON CONFLICT (version) DO NOTHING;

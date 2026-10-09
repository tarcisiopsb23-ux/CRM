-- =============================================================================
-- Migration 080: Horário de intervalo na configuração da agenda
--
-- Adiciona break_start e break_end em client_schedule_config.
-- Quando preenchidos, a RPC get_available_slots pula os slots que caem
-- dentro do intervalo — ex: almoço 12:00-13:00.
--
-- Ambos NULL = sem intervalo (comportamento anterior preservado).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_schedule_config
  ADD COLUMN IF NOT EXISTS break_start TIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS break_end   TIME DEFAULT NULL;

COMMENT ON COLUMN public.client_schedule_config.break_start IS
  'Início do intervalo/pausa (ex: 12:00). NULL = sem intervalo.';
COMMENT ON COLUMN public.client_schedule_config.break_end IS
  'Fim do intervalo/pausa (ex: 13:00). NULL = sem intervalo.';

-- Recria get_available_slots para pular slots que caem no intervalo
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_client_id       UUID,
  p_date            DATE,
  p_service_id      UUID DEFAULT NULL,
  p_professional_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday     INTEGER := EXTRACT(DOW FROM p_date)::INTEGER;
  v_config      public.client_schedule_config%ROWTYPE;
  v_duration    INTEGER := 60;
  v_slots       JSONB   := '[]'::JSONB;
  v_slot_start  TIMESTAMPTZ;
  v_slot_end    TIMESTAMPTZ;
  v_day_end     TIMESTAMPTZ;
  v_break_start TIMESTAMPTZ;
  v_break_end   TIMESTAMPTZ;
  v_booked      INTEGER;
  v_in_break    BOOLEAN;
  v_tz          TEXT    := 'America/Sao_Paulo';
BEGIN
  -- Busca config do dia
  SELECT * INTO v_config
  FROM public.client_schedule_config
  WHERE client_id = p_client_id
    AND weekday   = v_weekday
    AND active    = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '{"slots":[]}'::JSONB;
  END IF;

  -- Duração do serviço ou padrão do dia
  IF p_service_id IS NOT NULL THEN
    SELECT COALESCE(duration_min, v_config.slot_duration_min)
      INTO v_duration
    FROM public.client_schedule_services
    WHERE id        = p_service_id
      AND client_id = p_client_id
      AND active    = true;
  END IF;

  IF v_duration IS NULL OR v_duration <= 0 THEN
    v_duration := v_config.slot_duration_min;
  END IF;

  -- Converte horários para TIMESTAMPTZ no fuso do estabelecimento
  v_slot_start := timezone(v_tz,
    (p_date::TEXT || ' ' || v_config.start_time::TEXT)::TIMESTAMP);

  v_day_end := timezone(v_tz,
    (p_date::TEXT || ' ' || v_config.end_time::TEXT)::TIMESTAMP);

  -- Intervalo (se configurado)
  IF v_config.break_start IS NOT NULL AND v_config.break_end IS NOT NULL THEN
    v_break_start := timezone(v_tz,
      (p_date::TEXT || ' ' || v_config.break_start::TEXT)::TIMESTAMP);
    v_break_end := timezone(v_tz,
      (p_date::TEXT || ' ' || v_config.break_end::TEXT)::TIMESTAMP);
  ELSE
    v_break_start := NULL;
    v_break_end   := NULL;
  END IF;

  -- Gera slots ignorando os que caem dentro do intervalo
  WHILE v_slot_start + (v_duration || ' minutes')::INTERVAL <= v_day_end LOOP
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;

    -- Verifica se o slot está dentro do intervalo de pausa
    v_in_break := FALSE;
    IF v_break_start IS NOT NULL AND v_break_end IS NOT NULL THEN
      -- Slot cai no intervalo se começa antes do fim do break E termina depois do início
      v_in_break := v_slot_start < v_break_end AND v_slot_end > v_break_start;
    END IF;

    IF NOT v_in_break THEN
      -- Conta agendamentos conflitantes
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
    END IF;

    v_slot_start := v_slot_end;
  END LOOP;

  RETURN jsonb_build_object('slots', v_slots);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, UUID, UUID)
  TO anon, authenticated, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('080_agenda_break_time_v1')
ON CONFLICT (version) DO NOTHING;

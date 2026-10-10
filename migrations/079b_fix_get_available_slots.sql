-- =============================================================================
-- Migration 079b: Corrige get_available_slots
--
-- Bug: a RPC usava (date || ' ' || time)::TIMESTAMPTZ AT TIME ZONE tz
-- que converte para timestamp without time zone, quebrando a comparação
-- WHILE slot_start + interval <= slot_end (ambos precisam ser TIMESTAMPTZ).
--
-- Correção: usa timezone(tz, (date || ' ' || time)::TIMESTAMP) que retorna
-- TIMESTAMPTZ corretamente interpretado no fuso horário do estabelecimento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  v_weekday    INTEGER := EXTRACT(DOW FROM p_date)::INTEGER;
  v_config     public.client_schedule_config%ROWTYPE;
  v_duration   INTEGER := 60;
  v_slots      JSONB   := '[]'::JSONB;
  v_slot_start TIMESTAMPTZ;
  v_slot_end   TIMESTAMPTZ;
  v_day_end    TIMESTAMPTZ;
  v_booked     INTEGER;
  v_tz         TEXT    := 'America/Sao_Paulo';
BEGIN
  -- Busca config do dia
  SELECT * INTO v_config
  FROM public.client_schedule_config
  WHERE client_id = p_client_id
    AND weekday   = v_weekday
    AND active    = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::JSONB;
  END IF;

  -- Duração: usa a do serviço se fornecido, senão a do config do dia
  IF p_service_id IS NOT NULL THEN
    SELECT COALESCE(duration_min, v_config.slot_duration_min)
      INTO v_duration
    FROM public.client_schedule_services
    WHERE id = p_service_id
      AND client_id = p_client_id
      AND active = true;
  END IF;

  IF v_duration IS NULL OR v_duration <= 0 THEN
    v_duration := v_config.slot_duration_min;
  END IF;

  -- Converte data + hora para TIMESTAMPTZ no fuso do estabelecimento
  -- timezone(tz, ts_sem_tz) → interpreta ts_sem_tz como se fosse naquele tz e retorna TIMESTAMPTZ
  v_slot_start := timezone(v_tz,
    (p_date::TEXT || ' ' || v_config.start_time::TEXT)::TIMESTAMP
  );

  v_day_end := timezone(v_tz,
    (p_date::TEXT || ' ' || v_config.end_time::TEXT)::TIMESTAMP
  );

  -- Gera slots
  WHILE v_slot_start + (v_duration || ' minutes')::INTERVAL <= v_day_end LOOP
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;

    -- Conta agendamentos conflitantes no slot
    -- Filtra por profissional apenas se informado
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

  RETURN jsonb_build_object('slots', v_slots);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, UUID, UUID)
  TO anon, authenticated, service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('079b_fix_get_available_slots_v1')
ON CONFLICT (version) DO NOTHING;

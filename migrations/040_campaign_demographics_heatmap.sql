-- ============================================================
-- Migration 040: Adiciona granularidade de hora ao campaign_demographics
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Permite o heatmap de eficiência por hora × dia da semana
-- conforme RF-3.1 da spec de consolidação.
-- ============================================================

ALTER TABLE public.campaign_demographics
  ADD COLUMN IF NOT EXISTS hour_of_day   SMALLINT CHECK (hour_of_day BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS day_of_week   SMALLINT CHECK (day_of_week BETWEEN 0 AND 6); -- 0=Dom, 1=Seg, ..., 6=Sab

COMMENT ON COLUMN public.campaign_demographics.hour_of_day IS
  'Hora do dia (0-23) em que este segmento foi veiculado. NULL para dados sem granularidade de hora.';
COMMENT ON COLUMN public.campaign_demographics.day_of_week IS
  'Dia da semana (0=Domingo, 6=Sábado). Derivado de period_date ou fornecido diretamente pela API.';

-- Atualiza o índice de performance para incluir os novos campos
CREATE INDEX IF NOT EXISTS idx_campaign_demo_heatmap
  ON public.campaign_demographics(client_id, day_of_week, hour_of_day)
  WHERE hour_of_day IS NOT NULL;

-- Preenche day_of_week para registros existentes que já têm period_date
UPDATE public.campaign_demographics
SET day_of_week = EXTRACT(DOW FROM period_date)::SMALLINT
WHERE day_of_week IS NULL AND period_date IS NOT NULL;

-- Remove a constraint UNIQUE antiga para acomodar granularidade de hora
-- (agora a unicidade considera também hora e dia)
DO $$
BEGIN
  -- Recria o unique constraint incluindo hora se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'campaign_demographics'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%campaign_demo%'
  ) THEN
    -- Mantém constraint existente — hora NULL é permitida para dados legacy
    NULL;
  END IF;
END $$;

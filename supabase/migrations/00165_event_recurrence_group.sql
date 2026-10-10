-- =============================================================================
-- Migration 00165: Agrupamento de eventos recorrentes
-- Adiciona recurrence_group_id para vincular evento pai e filhos da série
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.recurrence_group_id IS
  'ID do evento pai da série recorrente. NULL = evento independente ou é o próprio pai.';

CREATE INDEX IF NOT EXISTS idx_events_recurrence_group_id
  ON public.events (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

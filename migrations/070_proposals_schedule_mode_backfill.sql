-- ============================================================
-- Migration 070: proposals — backfill campo mode no JSONB schedule
--
-- O novo campo `mode` foi adicionado ao ScheduleConfig no front-end.
-- Registros antigos (gravados antes desta migration) têm o campo
-- schedule sem a chave `mode`. Esta migration preenche retroativamente
-- `mode = 'mensal'` em todos os registros que ainda não têm o campo,
-- garantindo que a lógica de renderização do viewer funcione
-- corretamente para propostas existentes.
--
-- Idempotente: o WHERE evita sobrescrever registros já migrados.
-- ============================================================

UPDATE public.proposals
SET schedule = schedule || jsonb_build_object('mode', 'mensal')
WHERE schedule IS NOT NULL
  AND schedule != '{}'::jsonb
  AND NOT (schedule ? 'mode');

-- Também garante que registros com schedule = '{}' recebam defaults mínimos
UPDATE public.proposals
SET schedule = jsonb_build_object(
  'mode',         'mensal',
  'firstValue',   0,
  'firstDate',    to_char(now(), 'YYYY-MM-DD'),
  'dueDay',       10,
  'recurrence',   'mensal',
  'installments', 12,
  'paymentMethod','pix'
)
WHERE schedule IS NOT NULL
  AND (schedule = '{}'::jsonb OR schedule = 'null'::jsonb);

-- Versão
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version)
VALUES ('proposals_schedule_mode_backfill_v1')
ON CONFLICT (version) DO NOTHING;

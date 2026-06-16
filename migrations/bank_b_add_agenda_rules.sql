-- Migration: bank_b_add_agenda_rules.sql
-- Atualiza a tabela ai_events no Banco B de cada cliente.
-- Execute via provision-client-db ou diretamente no Supabase de cada cliente.
-- Idempotente.

-- 1. Adiciona coluna 'rules' se não existir
ALTER TABLE public.ai_events
  ADD COLUMN IF NOT EXISTS rules TEXT;

COMMENT ON COLUMN public.ai_events.rules IS
  'Instruções para o Agente Virtual: define o que o agente pode ou não informar ao responder perguntas sobre este evento (ex: não revelar cachê, não divulgar setlist, confirmar presença somente após determinado horário).';

-- 2. Adiciona coluna 'client_id' se não existir (schema legado não tinha)
ALTER TABLE public.ai_events
  ADD COLUMN IF NOT EXISTS client_id TEXT;

-- 2b. Adiciona coluna 'updated_at' se não existir (schema legado não tinha)
ALTER TABLE public.ai_events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Converte coluna 'time' de TIME para TEXT se ainda for TIME
--    Necessário para armazenar "21:30" sem forçar formato "21:30:00"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ai_events'
      AND column_name  = 'time'
      AND data_type    = 'time without time zone'
  ) THEN
    ALTER TABLE public.ai_events
      ALTER COLUMN time TYPE TEXT USING to_char(time, 'HH24:MI');
  END IF;
END $$;

-- 4. Migra valores legados do enum 'type' para o novo padrão
UPDATE public.ai_events SET type = 'musica_ao_vivo' WHERE type = 'schedule';
UPDATE public.ai_events SET type = 'dia_especial'   WHERE type = 'event';

-- 5. Remove a CHECK constraint antiga do 'type' e recria com os novos valores
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Encontra o nome da constraint CHECK no type
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.ai_events'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_events DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- Adiciona a nova CHECK constraint
ALTER TABLE public.ai_events
  DROP CONSTRAINT IF EXISTS ai_events_type_check;

ALTER TABLE public.ai_events
  ADD CONSTRAINT ai_events_type_check
  CHECK (type IN ('musica_ao_vivo', 'dia_especial'));

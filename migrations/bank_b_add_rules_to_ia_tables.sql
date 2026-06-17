-- Migration: bank_b_add_rules_to_ia_tables.sql
-- Adiciona coluna 'rules' às tabelas ai_promotions, ai_suggestions e ai_notices
-- no Banco B de cada cliente.
-- Execute via "Atualizar Schema" no C8 Control ou diretamente no Supabase do cliente.
-- Idempotente.

ALTER TABLE public.ai_promotions
  ADD COLUMN IF NOT EXISTS rules TEXT;

COMMENT ON COLUMN public.ai_promotions.rules IS
  'Instruções para o Agente Virtual: define o que o agente pode ou não informar sobre esta promoção.';

ALTER TABLE public.ai_suggestions
  ADD COLUMN IF NOT EXISTS rules TEXT;

COMMENT ON COLUMN public.ai_suggestions.rules IS
  'Instruções para o Agente Virtual: define o que o agente pode ou não informar sobre esta sugestão.';

ALTER TABLE public.ai_notices
  ADD COLUMN IF NOT EXISTS rules TEXT;

COMMENT ON COLUMN public.ai_notices.rules IS
  'Instruções para o Agente Virtual: define o que o agente pode ou não informar ao comunicar este aviso.';

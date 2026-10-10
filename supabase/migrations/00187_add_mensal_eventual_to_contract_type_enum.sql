-- Migration 00187: Adiciona 'mensal' e 'eventual' ao enum contract_type_enum
-- Necessário porque o formulário de contratos usa esses valores mas o enum
-- original só tinha: servico, trimestral, semestral, anual

ALTER TYPE public.contract_type_enum ADD VALUE IF NOT EXISTS 'mensal';
ALTER TYPE public.contract_type_enum ADD VALUE IF NOT EXISTS 'eventual';

NOTIFY pgrst, 'reload schema';

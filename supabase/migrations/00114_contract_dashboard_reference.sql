-- Migration 00114: Adiciona campo is_dashboard_reference na tabela contracts
-- Permite marcar um contrato como referência de data para o dashboard público do cliente
-- Regra: apenas 1 contrato por cliente pode ter is_dashboard_reference = true

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS is_dashboard_reference BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial para garantir unicidade: no máximo 1 contrato por cliente com is_dashboard_reference = true
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_dashboard_reference_unique
  ON public.contracts (client_id)
  WHERE is_dashboard_reference = true;

-- Comentário
COMMENT ON COLUMN public.contracts.is_dashboard_reference IS
  'Indica que a data deste contrato é a referência para separar histórico anterior de vigência no dashboard público do cliente. Apenas 1 contrato por cliente pode ter este campo como true.';

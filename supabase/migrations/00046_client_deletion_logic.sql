-- =============================================================================
-- MAESTR.IA - Regra de Negócio: Exclusão de Cliente e Contratos
-- Descrição: 
-- 1. Ao excluir um cliente, todos os seus contratos são apagados (CASCADE).
-- 2. Pagamentos PENDENTES do cliente/contrato são apagados.
-- 3. Pagamentos REALIZADOS (pago) são mantidos no histórico financeiro (ORPHANED).
-- =============================================================================

BEGIN;

-- 1. Ajustar a tabela de pagamentos para permitir registros órfãos (histórico financeiro)
ALTER TABLE public.payments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN contract_id DROP NOT NULL;

-- 2. Garantir que a exclusão de cliente dispare a exclusão de contratos em cascata
ALTER TABLE public.contracts 
  DROP CONSTRAINT IF EXISTS contracts_client_id_fkey,
  ADD CONSTRAINT contracts_client_id_fkey 
    FOREIGN KEY (client_id) 
    REFERENCES public.clients(id) 
    ON DELETE CASCADE;

-- 3. Função para gerenciar a limpeza de pagamentos ao excluir um CONTRATO
CREATE OR REPLACE FUNCTION public.handle_contract_deletion_cleanup()
RETURNS TRIGGER AS $$
BEGIN
    -- Apaga lançamentos pendentes vinculados ao contrato
    DELETE FROM public.payments 
    WHERE contract_id = OLD.id 
    AND status != 'pago';

    -- Mantém pagamentos realizados, mas remove a referência ao contrato deletado
    UPDATE public.payments 
    SET contract_id = NULL 
    WHERE contract_id = OLD.id 
    AND status = 'pago';

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 4. Função para gerenciar a limpeza de pagamentos ao excluir um CLIENTE
CREATE OR REPLACE FUNCTION public.handle_client_deletion_cleanup()
RETURNS TRIGGER AS $$
BEGIN
    -- Apaga lançamentos pendentes vinculados diretamente ao cliente
    DELETE FROM public.payments 
    WHERE client_id = OLD.id 
    AND status != 'pago';

    -- Mantém pagamentos realizados, mas remove a referência ao cliente deletado
    UPDATE public.payments 
    SET client_id = NULL
    WHERE client_id = OLD.id 
    AND status = 'pago';

    -- Nota: Os contratos serão removidos via ON DELETE CASCADE definido no passo 2.
    -- O trigger tr_contract_deletion_cleanup cuidará dos pagamentos dos contratos.

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 5. Aplicar os Triggers
DROP TRIGGER IF EXISTS tr_contract_deletion_cleanup ON public.contracts;
CREATE TRIGGER tr_contract_deletion_cleanup
BEFORE DELETE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.handle_contract_deletion_cleanup();

DROP TRIGGER IF EXISTS tr_client_deletion_cleanup ON public.clients;
CREATE TRIGGER tr_client_deletion_cleanup
BEFORE DELETE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.handle_client_deletion_cleanup();

COMMIT;

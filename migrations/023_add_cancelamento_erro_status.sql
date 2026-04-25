-- =============================================================================
-- Migration 023: Adiciona status 'cancelamento_erro' à tabela invoices
-- Usado quando o webhook de cancelamento retorna erro.
-- O campo erro_mensagem armazena o detalhe do erro para exibição na UI.
-- =============================================================================

-- O campo status é VARCHAR(30), sem constraint de enum, então nenhuma
-- alteração de tipo é necessária — apenas documentamos o novo valor aqui.

-- Migra registros existentes que estão em cancelamento_pendente com cancel_error
-- no metadata para o novo status cancelamento_erro
UPDATE invoices
SET
  status        = 'cancelamento_erro',
  erro_mensagem = COALESCE(
    erro_mensagem,
    metadata->>'cancel_error'
  )
WHERE
  status = 'cancelamento_pendente'
  AND metadata->>'cancel_error' IS NOT NULL
  AND metadata->>'cancel_error' <> '';

-- =============================================================================
-- Migration 021: Novos status de invoice
--
-- aguardando: nota enviada à Notaas e colocada em fila (queued) — aguardando
--             processamento pela prefeitura
-- emitida:    substitui 'autorizada' — nota emitida e autorizada pela prefeitura
-- =============================================================================

-- Atualiza registros existentes com status 'autorizada' para 'emitida'
UPDATE invoices SET status = 'emitida' WHERE status = 'autorizada';

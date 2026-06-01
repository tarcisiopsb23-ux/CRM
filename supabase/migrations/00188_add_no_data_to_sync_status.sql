-- Migration 00188: Adiciona 'no_data' aos valores permitidos de sync_status
-- Necessário para distinguir "executou mas sem dados no período" de "sucesso com dados"

ALTER TABLE public.client_integrations
  DROP CONSTRAINT IF EXISTS client_integrations_sync_status_check;

ALTER TABLE public.client_integrations
  ADD CONSTRAINT client_integrations_sync_status_check
    CHECK (sync_status IN ('pending', 'syncing', 'success', 'error', 'no_data'));

NOTIFY pgrst, 'reload schema';

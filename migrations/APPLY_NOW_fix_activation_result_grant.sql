-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE (Banco A — Agência)
--
-- Correção: update_c8_activation_result estava restrita a
-- service_role apenas, impedindo o frontend de marcar a
-- ativação como 'ativo' ou 'falhou' após o retorno do webhook.
--
-- A função usa SECURITY DEFINER e faz apenas UPDATE em
-- crm_client_plans — seguro liberar para authenticated.
--
-- Idempotente.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.update_c8_activation_result(UUID, BOOLEAN, TEXT)
  TO authenticated;

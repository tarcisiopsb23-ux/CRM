-- Migration 00121: Função auto_block_overdue_crm_clients
-- Adaptada para C8 Control: usa clients + tenant_config_cache (sem crm_client_plans)

CREATE OR REPLACE FUNCTION auto_block_overdue_crm_clients()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Marcar tenants com contract_end vencido como inativo
  UPDATE clients
  SET client_status = 'inativo'
  WHERE client_status::TEXT = 'ativo'
    AND contract_end IS NOT NULL
    AND contract_end < CURRENT_DATE;

  -- Refletir bloqueio no tenant_config_cache
  UPDATE tenant_config_cache tcc
  SET status    = 'bloqueado',
      synced_at = now()
  FROM clients c
  WHERE tcc.tenant_id = c.tenant_id
    AND c.client_status::TEXT = 'inativo'
    AND tcc.status = 'ativo';
END;
$$;

-- Migration 00121: Função auto_block_overdue_crm_clients
-- Bloqueia automaticamente clientes CRM com mensalidade pendente há mais de 30 dias
-- e revoga as sessões ativas dos clientes bloqueados.

CREATE OR REPLACE FUNCTION auto_block_overdue_crm_clients()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Bloquear planos com pagamento pendente há mais de 30 dias
  UPDATE crm_client_plans
  SET
    subscription_status = 'bloqueado',
    updated_at = now()
  WHERE
    subscription_status = 'ativo'
    AND EXISTS (
      SELECT 1
      FROM payments
      WHERE description LIKE 'Mensalidade C8 Control%'
        AND status = 'pendente'
        AND due_date <= (now() - INTERVAL '30 days')::date
        AND client_id = crm_client_plans.client_id
    );

  -- 2. Revogar sessões ativas dos clientes agora bloqueados
  UPDATE crm_sessions
  SET revoked = true
  FROM crm_client_plans
  WHERE crm_sessions.client_id = crm_client_plans.client_id
    AND crm_client_plans.subscription_status = 'bloqueado'
    AND crm_sessions.revoked = false;
END;
$$;

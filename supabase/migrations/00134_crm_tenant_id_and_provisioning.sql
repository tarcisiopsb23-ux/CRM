-- =============================================================================
-- Migration 00134: Mapeamento tenant_id C8 Control + provisionamento
-- O tenant_id do C8 Control é IGUAL ao client_id do Maestr.ia.
-- Não há campo separado — o client_id já é o identificador único do tenant.
-- Adiciona apenas campos de provisionamento de acesso.
-- =============================================================================

-- 1. Campos de provisionamento (status de envio de credenciais)
ALTER TABLE crm_client_plans
  ADD COLUMN IF NOT EXISTS provisioned_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'sent', 'confirmed', 'failed'));

-- 2. RPC que o C8 Control chama para validar um tenant
--    O tenant_id passado é o client_id do Maestr.ia (são o mesmo UUID)
CREATE OR REPLACE FUNCTION public.get_tenant_config(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'tenant_id',      p.client_id,
    'status',         p.subscription_status,
    'max_users',      p.max_users,
    'plan_name',      p.plan_name,
    'blocked_reason', p.blocked_reason,
    'contract_end',   p.contract_end,
    'client_name',    c.name,
    'synced_at',      now()
  )
  INTO v_result
  FROM crm_client_plans p
  JOIN clients c ON c.id = p.client_id
  WHERE p.client_id = p_tenant_id
  LIMIT 1;

  -- Se não encontrado, retorna config padrão permissiva
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'tenant_id',      p_tenant_id,
      'status',         'ativo',
      'max_users',      3,
      'plan_name',      'Starter',
      'blocked_reason', null,
      'contract_end',   null,
      'client_name',    null,
      'synced_at',      now()
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_config(UUID) TO service_role;

-- 3. RPC para listar todos os tenants (usado pela Edge Function crm-tenant-api)
CREATE OR REPLACE FUNCTION public.list_tenant_configs(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'tenant_id',      p.client_id,
      'status',         p.subscription_status,
      'max_users',      p.max_users,
      'plan_name',      p.plan_name,
      'blocked_reason', p.blocked_reason,
      'contract_end',   p.contract_end,
      'client_name',    c.name,
      'monthly_value',  p.plan_value
    ))
    FROM crm_client_plans p
    JOIN clients c ON c.id = p.client_id
    WHERE p.organization_id = p_org_id
    ORDER BY c.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_configs(UUID) TO service_role;

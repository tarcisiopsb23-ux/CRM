-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE (Banco A — Agência)
--
-- Correção: trigger_c8_activation agora inclui admin_email e
-- primary_user_email no payload enviado ao n8n.
--
-- Antes: o workflow recebia client_email (clients.email),
--        ignorando o e-mail definido no módulo C8 Control.
-- Depois: o workflow recebe admin_email = primary_user_email
--         do crm_client_plans, com fallback para clients.email.
--
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_c8_activation(
  p_client_id UUID,
  p_org_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client   public.clients%ROWTYPE;
  v_plan     public.crm_client_plans%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  SELECT * INTO v_plan FROM public.crm_client_plans WHERE client_id = p_client_id LIMIT 1;
  SELECT * INTO v_contract FROM public.contracts
    WHERE client_id = p_client_id
      AND organization_id = p_org_id
      AND status NOT IN ('cancelado', 'encerrado', 'rascunho')
      AND (
        service_contracted ILIKE '%assessoria%'
        OR service_contracted ILIKE '%consultoria%'
        OR service_contracted ILIKE '%agente_ia%'
        OR service_contracted ILIKE '%agente ia%'
        OR service_contracted ILIKE '%c8 control%'
        OR service_contracted ILIKE '%c8control%'
      )
    ORDER BY start_date DESC
    LIMIT 1;

  -- Marca o plano como em_andamento (upsert)
  IF v_plan.client_id IS NOT NULL THEN
    UPDATE public.crm_client_plans SET
      c8_activation_status    = 'em_andamento',
      c8_activation_error     = NULL,
      c8_included             = (v_contract.value = 0 OR v_plan.c8_included = true),
      c8_included_contract_id = COALESCE(v_contract.id, v_plan.c8_included_contract_id),
      provisioning_status     = 'sent',
      updated_at              = now()
    WHERE client_id = p_client_id;
  ELSE
    INSERT INTO public.crm_client_plans (
      organization_id, client_id, plan_name, plan_value, max_users,
      due_day, subscription_status, billing_cycle,
      contract_start, contract_end,
      c8_activation_status, c8_included, c8_included_contract_id,
      provisioning_status
    ) VALUES (
      p_org_id, p_client_id, 'Incluído', 0, 3, 1, 'ativo', 'mensal',
      v_contract.start_date, v_contract.end_date,
      'em_andamento', true, v_contract.id, 'sent'
    );
  END IF;

  -- Retorna payload para o webhook n8n.
  -- admin_email / primary_user_email: usa o e-mail definido no C8 Control
  -- (crm_client_plans.primary_user_email), com fallback para clients.email.
  RETURN jsonb_build_object(
    'success',              true,
    'client_id',            v_client.id,
    'client_name',          v_client.name,
    'client_email',         v_client.email,
    'admin_email',          COALESCE(v_plan.primary_user_email, v_client.email),
    'primary_user_email',   COALESCE(v_plan.primary_user_email, v_client.email),
    'dashboard_slug',       v_client.dashboard_slug,
    'supabase_url',         v_client.client_supabase_url,
    'anon_key',             v_client.client_supabase_anon_key,
    'service_key',          v_client.client_supabase_service_key,
    'contract_start',       v_contract.start_date,
    'contract_end',         v_contract.end_date,
    'max_users',            COALESCE(v_plan.max_users, 3),
    'plan_name',            'Incluído',
    'org_id',               p_org_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_c8_activation(UUID, UUID) TO authenticated;

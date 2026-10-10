-- ============================================================
-- Migration 048: Acesso gratuito ao C8 Control
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Permite liberar acesso ao C8 Control / Dashboard Público
-- sem cobrança mensal, em dois cenários:
--
--   1. ACESSO GRATUITO MANUAL: qualquer cliente pode receber
--      acesso com plan_value = 0 e c8_free_access = true.
--      Não gera lançamentos financeiros e não bloqueia por inadimplência.
--
--   2. EXTENSÃO DE PRAZO: clientes que tiveram contratos habilitadores
--      (assessoria/consultoria/agente_ia) podem ter o prazo estendido
--      gratuitamente via free_access_until.
-- ============================================================

-- ── 1. Campos de acesso gratuito em crm_client_plans ────────────────────────

ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS c8_free_access        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_access_until     DATE,
  ADD COLUMN IF NOT EXISTS free_access_reason    TEXT;

COMMENT ON COLUMN public.crm_client_plans.c8_free_access IS
  'true = acesso ao C8 Control liberado sem cobrança mensal. Não gera lançamentos e não bloqueia por inadimplência.';
COMMENT ON COLUMN public.crm_client_plans.free_access_until IS
  'Data limite do acesso gratuito. NULL = acesso gratuito indefinido.';
COMMENT ON COLUMN public.crm_client_plans.free_access_reason IS
  'Motivo do acesso gratuito (ex: "parceria", "cliente estratégico", "extensão pós-contrato").';

-- Índice para queries de clientes com acesso gratuito
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_free_access
  ON public.crm_client_plans (c8_free_access)
  WHERE c8_free_access = true;

-- ── 2. Atualiza get_tenant_config para respeitar acesso gratuito ─────────────
-- Clientes com c8_free_access = true nunca são bloqueados por inadimplência.

CREATE OR REPLACE FUNCTION public.get_tenant_config(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_plan   crm_client_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan
  FROM crm_client_plans p
  WHERE p.client_id = p_tenant_id
  LIMIT 1;

  IF NOT FOUND THEN
    -- Retorna config padrão permissiva para tenants ainda não cadastrados
    RETURN jsonb_build_object(
      'tenant_id',      p_tenant_id,
      'status',         'ativo',
      'max_users',      3,
      'plan_name',      'Starter',
      'blocked_reason', null,
      'contract_end',   null,
      'client_name',    null,
      'free_access',    false,
      'synced_at',      now()
    );
  END IF;

  -- Status efetivo: se tem acesso gratuito ativo, nunca retorna bloqueado
  DECLARE
    v_effective_status TEXT := v_plan.subscription_status;
    v_effective_end    DATE := v_plan.contract_end;
    v_client_name      TEXT;
  BEGIN
    -- Acesso gratuito: usa free_access_until como prazo se disponível
    IF v_plan.c8_free_access THEN
      v_effective_status := 'ativo';
      IF v_plan.free_access_until IS NOT NULL THEN
        v_effective_end := v_plan.free_access_until;
      END IF;
    END IF;

    -- Acesso incluído: também nunca bloqueia
    IF v_plan.c8_included AND v_plan.subscription_status = 'bloqueado' THEN
      v_effective_status := 'ativo';
    END IF;

    SELECT c.name INTO v_client_name
    FROM clients c WHERE c.id = p_tenant_id;

    RETURN jsonb_build_object(
      'tenant_id',      v_plan.client_id,
      'status',         v_effective_status,
      'max_users',      v_plan.max_users,
      'plan_name',      v_plan.plan_name,
      'blocked_reason', CASE WHEN v_effective_status = 'bloqueado' THEN v_plan.blocked_reason ELSE null END,
      'contract_end',   v_effective_end,
      'client_name',    v_client_name,
      'free_access',    v_plan.c8_free_access,
      'free_access_until', v_plan.free_access_until,
      'synced_at',      now()
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_config(UUID) TO service_role;

-- ── 3. RPC: libera acesso gratuito para um cliente ───────────────────────────
-- Chamada pela UI interna da agência. Pode criar o registro em crm_client_plans
-- se ainda não existir (cliente sem plano C8 Control formal).

CREATE OR REPLACE FUNCTION public.grant_c8_free_access(
  p_org_id          UUID,
  p_client_id       UUID,
  p_reason          TEXT    DEFAULT 'Acesso gratuito',
  p_until           DATE    DEFAULT NULL,
  p_max_users       INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  -- Verifica se o cliente pertence à organização
  IF NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND organization_id = p_org_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado nesta organização');
  END IF;

  SELECT id INTO v_plan_id FROM public.crm_client_plans WHERE client_id = p_client_id;

  IF v_plan_id IS NOT NULL THEN
    -- Atualiza plano existente
    UPDATE public.crm_client_plans SET
      c8_free_access        = true,
      free_access_until     = p_until,
      free_access_reason    = p_reason,
      plan_value            = 0,
      subscription_status   = 'ativo',
      updated_at            = now()
    WHERE client_id = p_client_id;
  ELSE
    -- Cria novo registro com acesso gratuito
    INSERT INTO public.crm_client_plans (
      organization_id, client_id, plan_name, plan_value, max_users,
      due_day, subscription_status, billing_cycle,
      contract_start, contract_end,
      c8_free_access, free_access_until, free_access_reason,
      c8_included, c8_activation_status
    ) VALUES (
      p_org_id, p_client_id, 'Gratuito', 0, p_max_users,
      1, 'ativo', 'mensal',
      CURRENT_DATE, p_until,
      true, p_until, p_reason,
      false, 'pendente'
    );

    -- Habilita c8_control_enabled no cliente
    UPDATE public.clients SET c8_control_enabled = true WHERE id = p_client_id;
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'client_id',          p_client_id,
    'c8_free_access',     true,
    'free_access_until',  p_until,
    'free_access_reason', p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_c8_free_access(UUID, UUID, TEXT, DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_c8_free_access(UUID, UUID, TEXT, DATE, INTEGER) FROM anon;
GRANT  EXECUTE ON FUNCTION public.grant_c8_free_access(UUID, UUID, TEXT, DATE, INTEGER) TO authenticated;

-- ── 4. RPC: revoga acesso gratuito ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_c8_free_access(
  p_client_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_client_plans SET
    c8_free_access     = false,
    free_access_until  = NULL,
    free_access_reason = NULL,
    updated_at         = now()
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_c8_free_access(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_c8_free_access(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.revoke_c8_free_access(UUID) TO authenticated;

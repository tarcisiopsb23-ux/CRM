-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE (Banco A — Agência)
-- Consolida migrations 047, 048 e reset_c8_activation
-- Idempotente: pode rodar múltiplas vezes sem erro
-- ============================================================

-- ── 1. Campos de ativação em crm_client_plans (migration 047) ────────────────

ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS c8_activation_status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (c8_activation_status IN ('pendente', 'em_andamento', 'ativo', 'falhou')),
  ADD COLUMN IF NOT EXISTS c8_activated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS c8_activation_error  TEXT,
  ADD COLUMN IF NOT EXISTS c8_included          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS c8_included_contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL;

-- ── 2. Campos de acesso gratuito em crm_client_plans (migration 048) ─────────

ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS c8_free_access     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_access_until  DATE,
  ADD COLUMN IF NOT EXISTS free_access_reason TEXT;

-- ── 3. Backfill: clientes já provisionados → marcados como ativo ──────────────

UPDATE public.crm_client_plans
SET c8_activation_status = 'ativo',
    c8_activated_at = COALESCE(provisioned_at, now())
WHERE provisioning_status = 'confirmed'
  AND c8_activation_status = 'pendente';

-- ── 4. Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crm_client_plans_activation_status
  ON public.crm_client_plans (c8_activation_status);
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_included
  ON public.crm_client_plans (c8_included)
  WHERE c8_included = true;
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_free_access
  ON public.crm_client_plans (c8_free_access)
  WHERE c8_free_access = true;

-- ── 5. RPC: get_c8_pending_activations (deduplicada por client_id) ──────────

CREATE OR REPLACE FUNCTION public.get_c8_pending_activations(p_org_id UUID)
RETURNS TABLE (
  client_id             UUID,
  client_name           TEXT,
  client_email          TEXT,
  dashboard_slug        TEXT,
  supabase_url          TEXT,
  anon_key              TEXT,
  has_service_key       BOOLEAN,
  contract_id           UUID,
  contract_service      TEXT,
  contract_start        DATE,
  contract_end          DATE,
  c8_activation_status  TEXT,
  c8_activation_error   TEXT,
  c8_included           BOOLEAN,
  plan_value            NUMERIC,
  max_users             INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- CTE raw: todas as combinações client × fonte (pode ter múltiplas linhas por cliente)
  WITH raw AS (
    -- Fonte 1: contrato habilitador ativo
    SELECT
      c.id                  AS client_id,
      ct.id                 AS contract_id,
      ct.service_contracted AS service_contracted,
      ct.start_date         AS start_date,
      ct.end_date           AS end_date,
      1                     AS priority   -- contrato tem prioridade mais alta
    FROM public.clients c
    JOIN public.contracts ct
      ON ct.client_id       = c.id
      AND ct.organization_id = p_org_id
      AND ct.status NOT IN ('cancelado', 'encerrado', 'rascunho')
      AND (
        ct.service_contracted ILIKE '%assessoria%'
        OR ct.service_contracted ILIKE '%consultoria%'
        OR ct.service_contracted ILIKE '%agente_ia%'
        OR ct.service_contracted ILIKE '%agente ia%'
        OR ct.service_contracted ILIKE '%c8 control%'
        OR ct.service_contracted ILIKE '%c8control%'
      )
    WHERE c.organization_id = p_org_id
      AND COALESCE(c.is_active, true) = true

    UNION ALL

    -- Fonte 2: flag manual c8_control_enabled
    SELECT
      c.id   AS client_id,
      NULL::UUID,
      NULL::TEXT,
      NULL::DATE,
      NULL::DATE,
      2      AS priority
    FROM public.clients c
    WHERE c.organization_id = p_org_id
      AND c.c8_control_enabled = true
      AND COALESCE(c.is_active, true) = true

    UNION ALL

    -- Fonte 3: banco B configurado
    SELECT
      c.id   AS client_id,
      NULL::UUID,
      NULL::TEXT,
      NULL::DATE,
      NULL::DATE,
      3      AS priority
    FROM public.clients c
    WHERE c.organization_id = p_org_id
      AND c.client_supabase_url IS NOT NULL
      AND COALESCE(c.is_active, true) = true
  ),
  -- CTE deduplicada: 1 linha por client_id, priorizando contrato (priority=1)
  -- e dentro da mesma prioridade, o contrato mais recente
  eligible AS (
    SELECT DISTINCT ON (client_id)
      client_id,
      contract_id,
      service_contracted,
      start_date,
      end_date
    FROM raw
    ORDER BY client_id, priority ASC, start_date DESC NULLS LAST
  )
  SELECT
    c.id,
    c.name::TEXT,
    c.email::TEXT,
    c.dashboard_slug::TEXT,
    c.client_supabase_url::TEXT,
    c.client_supabase_anon_key::TEXT,
    c.client_supabase_service_key_set,
    e.contract_id,
    e.service_contracted::TEXT,
    e.start_date,
    e.end_date,
    COALESCE(p.c8_activation_status, 'pendente')::TEXT,
    p.c8_activation_error::TEXT,
    COALESCE(p.c8_included, false),
    COALESCE(p.plan_value, 0),
    COALESCE(p.max_users, 1)
  FROM eligible e
  JOIN public.clients c ON c.id = e.client_id
  LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
  WHERE COALESCE(p.c8_activation_status, 'pendente') != 'ativo'
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_c8_pending_activations(UUID) TO authenticated;

-- ── 6. RPC: trigger_c8_activation ────────────────────────────────────────────

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

-- ── 7. RPC: update_c8_activation_result (chamada pelo n8n) ───────────────────

CREATE OR REPLACE FUNCTION public.update_c8_activation_result(
  p_client_id UUID,
  p_success   BOOLEAN,
  p_error     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_client_plans SET
    c8_activation_status = CASE WHEN p_success THEN 'ativo' ELSE 'falhou' END,
    c8_activated_at      = CASE WHEN p_success THEN now() ELSE c8_activated_at END,
    c8_activation_error  = CASE WHEN p_success THEN NULL ELSE p_error END,
    provisioning_status  = CASE WHEN p_success THEN 'confirmed' ELSE 'failed' END,
    provisioned_at       = CASE WHEN p_success THEN now() ELSE provisioned_at END,
    updated_at           = now()
  WHERE client_id = p_client_id;

  IF p_success THEN
    UPDATE public.clients SET c8_control_enabled = true WHERE id = p_client_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_c8_activation_result(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_c8_activation_result(UUID, BOOLEAN, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.update_c8_activation_result(UUID, BOOLEAN, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.update_c8_activation_result(UUID, BOOLEAN, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.update_c8_activation_result(UUID, BOOLEAN, TEXT) TO authenticated;

-- ── 8. RPC: reset_c8_activation (cancela ativação presa) ─────────────────────

CREATE OR REPLACE FUNCTION public.reset_c8_activation(
  p_client_id UUID,
  p_org_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  SELECT c8_activation_status
  INTO   v_current_status
  FROM   public.crm_client_plans
  WHERE  client_id = p_client_id
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Nenhum registro — status já é pendente.');
  END IF;

  IF v_current_status NOT IN ('em_andamento', 'falhou') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   format('Status atual é "%s". Só é possível resetar de "em_andamento" ou "falhou".', v_current_status)
    );
  END IF;

  UPDATE public.crm_client_plans SET
    c8_activation_status = 'pendente',
    c8_activation_error  = NULL,
    provisioning_status  = 'pending',
    updated_at           = now()
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object('success', true, 'previous_status', v_current_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_c8_activation(UUID, UUID) TO authenticated;

-- ── 9. RPC: grant_c8_free_access (migration 048) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_c8_free_access(
  p_org_id    UUID,
  p_client_id UUID,
  p_reason    TEXT    DEFAULT 'Acesso gratuito',
  p_until     DATE    DEFAULT NULL,
  p_max_users INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id AND organization_id = p_org_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado nesta organização');
  END IF;

  SELECT id INTO v_plan_id FROM public.crm_client_plans WHERE client_id = p_client_id;

  IF v_plan_id IS NOT NULL THEN
    UPDATE public.crm_client_plans SET
      c8_free_access      = true,
      free_access_until   = p_until,
      free_access_reason  = p_reason,
      plan_value          = 0,
      subscription_status = 'ativo',
      updated_at          = now()
    WHERE client_id = p_client_id;
  ELSE
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
    UPDATE public.clients SET c8_control_enabled = true WHERE id = p_client_id;
  END IF;

  RETURN jsonb_build_object(
    'success',           true,
    'client_id',         p_client_id,
    'c8_free_access',    true,
    'free_access_until', p_until,
    'free_access_reason',p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_c8_free_access(UUID, UUID, TEXT, DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_c8_free_access(UUID, UUID, TEXT, DATE, INTEGER) FROM anon;
GRANT  EXECUTE ON FUNCTION public.grant_c8_free_access(UUID, UUID, TEXT, DATE, INTEGER) TO authenticated;

-- ── 10. RPC: revoke_c8_free_access (migration 048) ───────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_c8_free_access(p_client_id UUID)
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

-- ── 11. RPC: get_client_supabase_credentials_bulk (service_role) ──────────────

CREATE OR REPLACE FUNCTION public.get_client_supabase_credentials_bulk()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'client_id',   c.id,
      'client_name', c.name,
      'client_email',c.email,
      'supabase_url',c.client_supabase_url,
      'anon_key',    c.client_supabase_anon_key,
      'service_key', c.client_supabase_service_key
    ))
    FROM public.clients c
    WHERE c.client_supabase_url IS NOT NULL
      AND c.client_supabase_service_key IS NOT NULL
      AND COALESCE(c.is_active, true) = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_supabase_credentials_bulk() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_supabase_credentials_bulk() FROM anon;
REVOKE ALL ON FUNCTION public.get_client_supabase_credentials_bulk() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_client_supabase_credentials_bulk() TO service_role;

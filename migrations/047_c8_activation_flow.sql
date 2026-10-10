-- ============================================================
-- Migration 047: Fluxo de ativação automática do C8 Control
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Regras de negócio:
--   • Clientes com contrato de assessoria, consultoria ou Agente IA
--     têm acesso ao C8 Control incluído (sem cobrança separada).
--   • O contrato C8 Control incluído herda datas do contrato pai e
--     tem plan_value = 0 (sem lançamento financeiro, sem bloqueio).
--   • A ativação é feita via n8n (provisiona Banco B + cria usuário).
--   • status de ativação: 'pendente' → 'em_andamento' → 'ativo' | 'falhou'
-- ============================================================

-- ── 1. Campos de ativação em crm_client_plans ────────────────────────────────

ALTER TABLE public.crm_client_plans
  ADD COLUMN IF NOT EXISTS c8_activation_status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (c8_activation_status IN ('pendente', 'em_andamento', 'ativo', 'falhou')),
  ADD COLUMN IF NOT EXISTS c8_activated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS c8_activation_error  TEXT,
  ADD COLUMN IF NOT EXISTS c8_included          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS c8_included_contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_client_plans.c8_activation_status IS
  'Status da ativação do C8 Control via n8n: pendente → em_andamento → ativo | falhou';
COMMENT ON COLUMN public.crm_client_plans.c8_activated_at IS
  'Timestamp da ativação bem-sucedida pelo n8n.';
COMMENT ON COLUMN public.crm_client_plans.c8_activation_error IS
  'Mensagem de erro da última tentativa de ativação.';
COMMENT ON COLUMN public.crm_client_plans.c8_included IS
  'true = acesso ao C8 Control incluído em outro contrato (assessoria/consultoria/Agente IA). Sem cobrança separada e sem bloqueio por pagamento.';
COMMENT ON COLUMN public.crm_client_plans.c8_included_contract_id IS
  'Contrato pai que habilitou o acesso ao C8 Control (assessoria, consultoria ou Agente IA).';

-- Backfill: clientes já ativos com provisioning_status = confirmed
-- são marcados como ativados
UPDATE public.crm_client_plans
SET c8_activation_status = 'ativo',
    c8_activated_at = COALESCE(provisioned_at, now())
WHERE provisioning_status = 'confirmed'
  AND c8_activation_status = 'pendente';

-- Índices
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_activation_status
  ON public.crm_client_plans (c8_activation_status);
CREATE INDEX IF NOT EXISTS idx_crm_client_plans_included
  ON public.crm_client_plans (c8_included)
  WHERE c8_included = true;

-- ── 2. RPC: busca clientes habilitados com ativação pendente ─────────────────
-- Retorna clientes que têm acesso ao C8 Control (por contrato ou flag manual)
-- mas ainda não foram ativados via n8n (c8_activation_status != 'ativo').
-- Usado pela aba "Ativação Pendente" e pelo card do dashboard.

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
  SELECT
    c.id                                AS client_id,
    c.name                              AS client_name,
    c.email                             AS client_email,
    c.dashboard_slug,
    c.client_supabase_url               AS supabase_url,
    c.client_supabase_anon_key          AS anon_key,
    c.client_supabase_service_key_set   AS has_service_key,
    ct.id                               AS contract_id,
    ct.service_contracted               AS contract_service,
    ct.start_date                       AS contract_start,
    ct.end_date                         AS contract_end,
    COALESCE(p.c8_activation_status, 'pendente') AS c8_activation_status,
    p.c8_activation_error,
    COALESCE(p.c8_included, false)      AS c8_included,
    COALESCE(p.plan_value, 0)           AS plan_value,
    COALESCE(p.max_users, 1)            AS max_users
  FROM public.clients c
  -- Junta com o contrato que habilitou o acesso
  JOIN public.contracts ct
    ON ct.client_id = c.id
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
  LEFT JOIN public.crm_client_plans p
    ON p.client_id = c.id
  WHERE c.organization_id = p_org_id
    AND COALESCE(c.is_active, true) = true
    -- Ainda não ativado ou falhou
    AND COALESCE(p.c8_activation_status, 'pendente') != 'ativo'
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_c8_pending_activations(UUID) TO authenticated;

-- ── 3. RPC: dispara ativação (marca em_andamento + retorna payload p/ n8n) ──
-- O frontend chama esta RPC → atualiza o status para 'em_andamento' →
-- retorna o payload que deve ser enviado ao webhook n8n.
-- O n8n provisiona o Banco B, cria o usuário e chama update_c8_activation_result.

CREATE OR REPLACE FUNCTION public.trigger_c8_activation(
  p_client_id  UUID,
  p_org_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client    public.clients%ROWTYPE;
  v_plan      public.crm_client_plans%ROWTYPE;
  v_contract  public.contracts%ROWTYPE;
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

  -- Atualiza ou insere crm_client_plans marcando em_andamento
  IF v_plan.client_id IS NOT NULL THEN
    UPDATE public.crm_client_plans SET
      c8_activation_status  = 'em_andamento',
      c8_activation_error   = NULL,
      c8_included           = (v_contract.value = 0 OR v_plan.c8_included = true),
      c8_included_contract_id = COALESCE(v_contract.id, v_plan.c8_included_contract_id),
      provisioning_status   = 'sent',
      updated_at            = now()
    WHERE client_id = p_client_id;
  ELSE
    INSERT INTO public.crm_client_plans (
      organization_id, client_id, plan_name, plan_value, max_users,
      due_day, subscription_status, billing_cycle,
      contract_start, contract_end,
      c8_activation_status, c8_included, c8_included_contract_id,
      provisioning_status
    ) VALUES (
      p_org_id, p_client_id,
      'Incluído', 0, 3, 1, 'ativo', 'mensal',
      v_contract.start_date, v_contract.end_date,
      'em_andamento', true, v_contract.id, 'sent'
    );
  END IF;

  -- Retorna payload para o webhook n8n
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

-- ── 4. RPC: n8n atualiza resultado da ativação ───────────────────────────────
-- Chamada pelo workflow n8n após provisionar (com sucesso ou erro).
-- Usa service_role — nunca exposta ao frontend diretamente.

CREATE OR REPLACE FUNCTION public.update_c8_activation_result(
  p_client_id  UUID,
  p_success    BOOLEAN,
  p_error      TEXT DEFAULT NULL
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

  -- Se bem-sucedido, garante que c8_control_enabled está true no cliente
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

-- ── 5. RPC: lista clientes com Banco B configurado (para atualização em massa via n8n) ──
-- Usada pelo workflow c8-update-all-schemas para buscar todos os clientes elegíveis.
-- Retorna credenciais reais — acesso restrito a service_role.

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

-- ── Corrige get_c8_pending_activations: deduplicada por client_id ────────────
-- Problema original: UNION de 3 fontes + DISTINCT ON no SELECT final não
-- eliminava duplicatas quando um cliente tinha múltiplos contratos habilitadores
-- ou satisfazia mais de uma fonte simultaneamente.
-- Solução: CTE em dois estágios (raw + eligible) com DISTINCT ON (client_id)
-- dentro da CTE, priorizando contrato (priority=1) > flag (2) > banco B (3).

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
  WITH raw AS (
    -- Fonte 1: contrato habilitador ativo (priority=1)
    SELECT
      c.id                  AS client_id,
      ct.id                 AS contract_id,
      ct.service_contracted,
      ct.start_date,
      ct.end_date,
      1                     AS priority
    FROM public.clients c
    JOIN public.contracts ct
      ON  ct.client_id        = c.id
      AND ct.organization_id  = p_org_id
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

    -- Fonte 2: flag manual c8_control_enabled (priority=2)
    SELECT
      c.id, NULL::UUID, NULL::TEXT, NULL::DATE, NULL::DATE, 2
    FROM public.clients c
    WHERE c.organization_id   = p_org_id
      AND c.c8_control_enabled = true
      AND COALESCE(c.is_active, true) = true

    UNION ALL

    -- Fonte 3: banco B configurado (priority=3)
    SELECT
      c.id, NULL::UUID, NULL::TEXT, NULL::DATE, NULL::DATE, 3
    FROM public.clients c
    WHERE c.organization_id     = p_org_id
      AND c.client_supabase_url IS NOT NULL
      AND COALESCE(c.is_active, true) = true
  ),
  -- 1 linha por client_id: menor priority wins, contrato mais recente desempata
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
  JOIN  public.clients            c ON c.id          = e.client_id
  LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
  WHERE COALESCE(p.c8_activation_status, 'pendente') != 'ativo'
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_c8_pending_activations(UUID) TO authenticated;


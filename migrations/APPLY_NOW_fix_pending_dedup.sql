-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE (Banco A — Agência)
--
-- Correção: get_c8_pending_activations retornava clientes
-- duplicados quando satisfaziam múltiplas fontes de habilitação
-- (ex: tem contrato assessoria + c8_control_enabled = true +
-- banco B configurado) ou tinham múltiplos contratos habilitadores.
--
-- Causa: UNION sem deduplicação efetiva por client_id — o
-- DISTINCT ON (c.id) no SELECT final não eliminava duplicatas
-- porque ec.contract_id diferente criava linhas distintas
-- antes do DISTINCT ON atuar.
--
-- Correção: CTE em dois estágios:
--   raw      — UNION ALL de todas as fontes com coluna priority
--   eligible — DISTINCT ON (client_id) ORDER BY priority, start_date
--              garante 1 linha por cliente, priorizando contrato
--              habilitador (priority=1) sobre flag manual (2) ou
--              banco B configurado (3). Múltiplos contratos do
--              mesmo cliente ficam com o mais recente.
--
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- ============================================================

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
  -- raw: todas as combinações cliente × fonte (pode ter múltiplas linhas por cliente)
  WITH raw AS (
    -- Fonte 1: contrato habilitador ativo (priority=1 — mais alta)
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
    WHERE c.organization_id  = p_org_id
      AND c.c8_control_enabled = true
      AND COALESCE(c.is_active, true) = true

    UNION ALL

    -- Fonte 3: banco B configurado (priority=3)
    SELECT
      c.id, NULL::UUID, NULL::TEXT, NULL::DATE, NULL::DATE, 3
    FROM public.clients c
    WHERE c.organization_id    = p_org_id
      AND c.client_supabase_url IS NOT NULL
      AND COALESCE(c.is_active, true) = true
  ),
  -- eligible: exatamente 1 linha por client_id
  -- ordem: menor priority primeiro (contrato > flag > banco),
  --        dentro do mesmo priority o contrato mais recente
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
  JOIN  public.clients           c ON c.id          = e.client_id
  LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
  WHERE COALESCE(p.c8_activation_status, 'pendente') != 'ativo'
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_c8_pending_activations(UUID) TO authenticated;

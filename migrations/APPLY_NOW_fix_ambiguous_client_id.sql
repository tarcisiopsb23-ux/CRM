-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE (Banco A — Agência)
--
-- Correção: get_c8_pending_activations falhava com erro 42702
-- "column reference 'client_id' is ambiguous" porque o nome
-- da coluna de retorno colide com a coluna p.client_id no JOIN.
--
-- Correção: renomear a coluna de retorno para out_client_id
-- internamente via alias explícito no SELECT final, mantendo
-- o nome público da coluna (client_id) inalterado para o
-- frontend continuar funcionando sem mudanças.
--
-- Idempotente: pode ser aplicada múltiplas vezes sem erro.
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
  WITH raw AS (
    -- Fonte 1: contrato habilitador ativo (priority=1 — mais alta)
    SELECT
      c.id                  AS raw_client_id,
      ct.id                 AS raw_contract_id,
      ct.service_contracted AS raw_service,
      ct.start_date         AS raw_start,
      ct.end_date           AS raw_end,
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
    WHERE c.organization_id    = p_org_id
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
  eligible AS (
    SELECT DISTINCT ON (raw_client_id)
      raw_client_id,
      raw_contract_id,
      raw_service,
      raw_start,
      raw_end
    FROM raw
    ORDER BY raw_client_id, priority ASC, raw_start DESC NULLS LAST
  )
  SELECT
    c.id                                        AS client_id,
    c.name::TEXT                                AS client_name,
    c.email::TEXT                               AS client_email,
    c.dashboard_slug::TEXT                      AS dashboard_slug,
    c.client_supabase_url::TEXT                 AS supabase_url,
    c.client_supabase_anon_key::TEXT            AS anon_key,
    c.client_supabase_service_key_set           AS has_service_key,
    e.raw_contract_id                           AS contract_id,
    e.raw_service::TEXT                         AS contract_service,
    e.raw_start                                 AS contract_start,
    e.raw_end                                   AS contract_end,
    COALESCE(p.c8_activation_status, 'pendente')::TEXT AS c8_activation_status,
    p.c8_activation_error::TEXT                 AS c8_activation_error,
    COALESCE(p.c8_included, false)              AS c8_included,
    COALESCE(p.plan_value, 0)                   AS plan_value,
    COALESCE(p.max_users, 1)                    AS max_users
  FROM eligible e
  JOIN  public.clients           c ON c.id = e.raw_client_id
  LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
  WHERE COALESCE(p.c8_activation_status, 'pendente') != 'ativo'
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_c8_pending_activations(UUID) TO authenticated;

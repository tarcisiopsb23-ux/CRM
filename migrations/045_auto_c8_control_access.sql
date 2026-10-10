-- ============================================================
-- Migration 045: Acesso automático ao C8 Control
-- Execute no Supabase da AGÊNCIA (Banco A)
--
-- Regra de negócio:
--   Todo cliente com contrato ATIVO de "assessoria", "consultoria"
--   ou "agente_ia" tem acesso ao C8 Control automaticamente, sem
--   precisar do flag manual c8_control_enabled = true.
--
--   O contrato de C8 Control separado continua existindo para
--   clientes que contratam APENAS o C8 Control (sem assessoria/IA).
-- ============================================================

-- Atualiza get_crm_client_by_slug para calcular acesso automaticamente
CREATE OR REPLACE FUNCTION public.get_crm_client_by_slug(p_slug TEXT)
RETURNS TABLE (
  client_id           UUID,
  organization_id     UUID,
  name                TEXT,
  logo_url            TEXT,
  c8_control_enabled  BOOLEAN,
  subscription_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id                                          AS client_id,
    c.organization_id,
    c.name,
    c.metadata->>'logo_url'                       AS logo_url,
    -- Acesso permitido se:
    -- (a) c8_control_enabled = true (flag manual), OU
    -- (b) tem contrato ativo de assessoria, consultoria ou agente_ia, OU
    -- (c) tem client_supabase_url preenchido (já tem Banco B = já usa dashboard)
    COALESCE(c.c8_control_enabled, false)
    OR EXISTS (
      SELECT 1 FROM public.contracts ct
      WHERE ct.client_id = c.id
        AND ct.status NOT IN ('cancelado', 'encerrado')
        AND (
          ct.service_contracted ILIKE '%assessoria%'
          OR ct.service_contracted ILIKE '%consultoria%'
          OR ct.service_contracted ILIKE '%agente_ia%'
          OR ct.service_contracted ILIKE '%agente ia%'
        )
    )
    OR (c.client_supabase_url IS NOT NULL AND c.client_supabase_anon_key IS NOT NULL)
    AS c8_control_enabled,
    COALESCE(p.subscription_status, 'cancelado')  AS subscription_status
  FROM public.clients c
  LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
  WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_client_by_slug(TEXT) TO anon, authenticated;

-- View auxiliar: lista todos os clientes com acesso ao C8 Control (para relatórios)
CREATE OR REPLACE VIEW public.clients_with_c8_access AS
SELECT
  c.id,
  c.name,
  c.company,
  c.dashboard_slug,
  COALESCE(c.c8_control_enabled, false)
  OR EXISTS (
    SELECT 1 FROM public.contracts ct
    WHERE ct.client_id = c.id
      AND ct.status NOT IN ('cancelado', 'encerrado')
      AND (
        ct.service_contracted ILIKE '%assessoria%'
        OR ct.service_contracted ILIKE '%consultoria%'
        OR ct.service_contracted ILIKE '%agente_ia%'
        OR ct.service_contracted ILIKE '%agente ia%'
      )
  )
  OR (c.client_supabase_url IS NOT NULL AND c.client_supabase_anon_key IS NOT NULL)
  AS has_c8_access,
  c.client_supabase_url IS NOT NULL AS has_bank_b,
  COALESCE(c.show_ia_content, false) AS has_ia_agent
FROM public.clients c
WHERE COALESCE(c.is_active, true) = true;

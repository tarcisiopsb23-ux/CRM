-- RPC para buscar cliente CRM pelo dashboard_slug
-- Adaptada para C8 Control: usa apenas a tabela clients (sem crm_client_plans)

-- Drop da versão antiga (assinatura diferente)
DROP FUNCTION IF EXISTS public.get_crm_client_by_slug(TEXT);

CREATE OR REPLACE FUNCTION public.get_crm_client_by_slug(p_slug TEXT)
RETURNS TABLE (
  client_id          UUID,
  name               TEXT,
  favicon_url        TEXT,
  c8_control_enabled BOOLEAN,
  client_status      TEXT,
  plan_name          TEXT,
  max_users          INTEGER,
  contract_end       DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.favicon_url,
    c.c8_control_enabled,
    c.client_status::TEXT,
    c.plan_name,
    c.max_users,
    c.contract_end
  FROM clients c
  WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_client_by_slug TO anon, authenticated;

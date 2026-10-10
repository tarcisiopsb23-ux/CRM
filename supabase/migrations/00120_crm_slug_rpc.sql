-- RPC para buscar cliente CRM pelo dashboard_slug
CREATE OR REPLACE FUNCTION public.get_crm_client_by_slug(p_slug TEXT)
RETURNS TABLE (
    client_id UUID,
    organization_id UUID,
    name TEXT,
    logo_url TEXT,
    c8_control_enabled BOOLEAN,
    subscription_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id,
        c.organization_id,
        c.name,
        c.metadata->>'logo_url',
        c.c8_control_enabled,
        COALESCE(p.subscription_status, 'cancelado')
    FROM clients c
    LEFT JOIN crm_client_plans p ON p.client_id = c.id
    WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_client_by_slug TO anon, authenticated;

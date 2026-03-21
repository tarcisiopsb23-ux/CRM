-- Atualiza a RPC get_client_by_slug para incluir as flags de dashboard do metadata
DROP FUNCTION IF EXISTS public.get_client_by_slug(TEXT);

CREATE OR REPLACE FUNCTION public.get_client_by_slug(p_slug TEXT)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    company VARCHAR,
    dashboard_slug TEXT,
    has_temp_password BOOLEAN,
    organization_id UUID,
    favicon_url TEXT,
    dashboard_performance BOOLEAN,
    dashboard_atendimento BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.company,
        c.dashboard_slug,
        COALESCE((c.metadata->>'is_temp_password')::BOOLEAN, false) AS has_temp_password,
        c.organization_id,
        COALESCE((o.settings->>'favicon_url')::TEXT, NULL) AS favicon_url,
        COALESCE((c.metadata->>'dashboard_performance')::BOOLEAN, true)  AS dashboard_performance,
        COALESCE((c.metadata->>'dashboard_atendimento')::BOOLEAN, false) AS dashboard_atendimento
    FROM public.clients c
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
    LIMIT 1;
END;
$$;

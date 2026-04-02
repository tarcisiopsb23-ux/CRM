-- RPC para buscar KPIs de um cliente pelo client_id (para dashboard público)
CREATE OR REPLACE FUNCTION public.get_client_kpis_public(p_client_id UUID)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    client_id UUID,
    name VARCHAR,
    category VARCHAR,
    unit VARCHAR,
    is_predefined BOOLEAN,
    target_value DECIMAL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.id, k.organization_id, k.client_id, k.name, k.category,
        k.unit, k.is_predefined, k.target_value, k.created_at, k.updated_at
    FROM public.client_kpis k
    WHERE k.client_id = p_client_id
    ORDER BY k.name ASC;
END;
$$;

-- RPC para buscar histórico de KPIs de um cliente pelo client_id (para dashboard público)
CREATE OR REPLACE FUNCTION public.get_client_kpi_history_public(p_client_id UUID)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    client_id UUID,
    kpi_id UUID,
    month_year DATE,
    value DECIMAL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.id, h.organization_id, h.client_id, h.kpi_id,
        h.month_year, h.value, h.created_at, h.updated_at
    FROM public.client_kpi_history h
    WHERE h.client_id = p_client_id
    ORDER BY h.month_year DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_kpis_public(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_kpi_history_public(UUID) TO anon, authenticated;

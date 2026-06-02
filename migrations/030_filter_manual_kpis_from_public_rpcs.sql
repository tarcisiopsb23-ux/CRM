-- Atualiza get_client_kpis_public para excluir os KPIs internos de métricas de conversão
-- (__lead_manual e __sale_manual são usados apenas para alimentar os funis/cards de campanha)
CREATE OR REPLACE FUNCTION public.get_client_kpis_public(p_client_id UUID)
RETURNS TABLE (
    id UUID, organization_id UUID, client_id UUID,
    name VARCHAR, category VARCHAR, unit VARCHAR,
    is_predefined BOOLEAN, target_value DECIMAL,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT k.id, k.organization_id, k.client_id, k.name, k.category,
           k.unit, k.is_predefined, k.target_value, k.created_at, k.updated_at
    FROM public.client_kpis k
    WHERE k.client_id = p_client_id
      AND k.name NOT IN ('__lead_manual', '__sale_manual')
    ORDER BY k.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_kpis_public(UUID) TO anon, authenticated;

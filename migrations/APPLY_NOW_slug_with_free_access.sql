-- ============================================================
-- APLICAR NO SQL EDITOR DO SUPABASE (Banco A — Agência)
--
-- Atualiza get_client_by_slug para incluir c8_free_access e
-- c8_included no modules_config retornado ao Public Dashboard.
--
-- Isso permite que o dashboard mostre o banner de "acesso gratuito"
-- sem precisar de query adicional ao Banco A.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_client_by_slug(p_slug TEXT)
RETURNS TABLE (
    id                    UUID,
    name                  VARCHAR,
    company               VARCHAR,
    dashboard_slug        TEXT,
    has_temp_password     BOOLEAN,
    organization_id       UUID,
    favicon_url           TEXT,
    dashboard_performance BOOLEAN,
    dashboard_atendimento BOOLEAN,
    show_ia_content       BOOLEAN,
    client_supabase_url   TEXT,
    client_supabase_anon_key TEXT,
    conversion_metrics    JSONB,
    dashboard_kpis        JSONB,
    geral_dashboard_cards JSONB,
    modules_config        JSONB
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
        COALESCE((c.metadata->>'is_temp_password')::BOOLEAN, false)       AS has_temp_password,
        c.organization_id,
        COALESCE((o.settings->>'favicon_url')::TEXT, NULL)                AS favicon_url,
        COALESCE((c.metadata->>'dashboard_performance')::BOOLEAN, true)   AS dashboard_performance,
        COALESCE((c.metadata->>'dashboard_atendimento')::BOOLEAN, false)  AS dashboard_atendimento,
        COALESCE(c.show_ia_content, false)                                AS show_ia_content,
        c.client_supabase_url,
        c.client_supabase_anon_key,
        COALESCE(c.metadata->'conversion_metrics', '{}'::JSONB)           AS conversion_metrics,
        COALESCE(c.metadata->'dashboard_kpis', '[]'::JSONB)               AS dashboard_kpis,
        COALESCE(c.metadata->'geral_dashboard_cards', '[]'::JSONB)        AS geral_dashboard_cards,
        -- modules_config inclui c8_free_access e c8_included para o banner
        -- de acesso gratuito no dashboard de pagamentos
        COALESCE(p.modules_config, '{}'::JSONB)
          || jsonb_build_object(
               'c8_free_access', COALESCE(p.c8_free_access, false),
               'c8_included',    COALESCE(p.c8_included, false),
               'free_access_until',  p.free_access_until,
               'free_access_reason', p.free_access_reason
             )                                                             AS modules_config
    FROM public.clients c
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    LEFT JOIN public.crm_client_plans p ON p.client_id = c.id
    WHERE LOWER(TRIM(c.dashboard_slug)) = LOWER(TRIM(p_slug))
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_by_slug(TEXT) TO anon, authenticated;

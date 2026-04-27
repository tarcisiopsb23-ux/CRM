-- Migration 00175: Permite leitura pública de campaign_data via dashboard_slug
-- Necessário para o dashboard externo do cliente mostrar métricas de campanhas

DROP POLICY IF EXISTS "Allow public read access via slug" ON public.campaign_data;
CREATE POLICY "Allow public read access via slug" ON public.campaign_data
    FOR SELECT
    USING (
        client_id = (
            SELECT id FROM public.clients 
            WHERE dashboard_slug = current_setting('request.headers.x-dashboard-slug', true)
        )
    );

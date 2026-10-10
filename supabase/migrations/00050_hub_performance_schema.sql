-- Fase 1: Infraestrutura de Dados (Hub de Performance)
-- Criação das novas tabelas e políticas de segurança.

-- Adiciona um campo para o slug do dashboard externo na tabela de clientes
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS dashboard_slug TEXT UNIQUE;

-- 1. Tabela de Integrações de Clientes
CREATE TABLE IF NOT EXISTS public.client_integrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    platform TEXT NOT NULL, -- 'meta' ou 'google'
    access_token TEXT, -- Será criptografado
    account_id TEXT,
    refresh_token TEXT, -- Será criptografado
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Tabela de KPIs Manuais de Clientes
CREATE TABLE IF NOT EXISTS public.client_kpis (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    metric_name TEXT NOT NULL,
    value NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Tabela de Dados Brutos de Campanhas
CREATE TABLE IF NOT EXISTS public.campaign_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    platform TEXT NOT NULL,
    campaign_name TEXT,
    spend NUMERIC DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    leads INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Tabela de Métricas Diárias Consolidadas
CREATE TABLE IF NOT EXISTS public.daily_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_spend NUMERIC DEFAULT 0,
    total_leads INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    cpl NUMERIC DEFAULT 0, -- Custo por Lead
    cpa NUMERIC DEFAULT 0, -- Custo por Aquisição/Venda
    roas NUMERIC DEFAULT 0, -- Retorno sobre Investimento em Ads
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Índices para otimização de consultas
CREATE INDEX IF NOT EXISTS idx_client_integrations_client_id ON public.client_integrations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_kpis_client_id_date ON public.client_kpis(client_id, date);
CREATE INDEX IF NOT EXISTS idx_campaign_data_client_id_date ON public.campaign_data(client_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_client_id_date ON public.daily_metrics(client_id, date);

-- Habilitar RLS
ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (RLS)
-- Acesso baseado na organização do usuário

-- client_integrations
DROP POLICY IF EXISTS "Allow full access to organization members" ON public.client_integrations;
CREATE POLICY "Allow full access to organization members" ON public.client_integrations
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- client_kpis
DROP POLICY IF EXISTS "Allow full access to organization members" ON public.client_kpis;
CREATE POLICY "Allow full access to organization members" ON public.client_kpis
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- campaign_data
DROP POLICY IF EXISTS "Allow full access to organization members" ON public.campaign_data;
CREATE POLICY "Allow full access to organization members" ON public.campaign_data
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- daily_metrics
DROP POLICY IF EXISTS "Allow full access to organization members" ON public.daily_metrics;
CREATE POLICY "Allow full access to organization members" ON public.daily_metrics
    FOR ALL
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Política para acesso público via slug (Dashboard Externo)
DROP POLICY IF EXISTS "Allow public read access via slug" ON public.daily_metrics;
CREATE POLICY "Allow public read access via slug" ON public.daily_metrics
    FOR SELECT
    USING (client_id = (SELECT id FROM public.clients WHERE dashboard_slug = current_setting('request.headers.x-dashboard-slug', true)));

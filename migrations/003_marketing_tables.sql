-- Migração para tabelas de Marketing (Ads)
-- Esta migração cria a estrutura completa para centralizar dados de Google Ads, Meta Ads, TikTok Ads, etc.
-- Substitui ou complementa a estrutura anterior de 'campaigns' se houver conflito, mas aqui focamos na estrutura solicitada.

-- Habilita extensão para UUID se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela ad_accounts
-- Armazena as contas de anúncios conectadas ao sistema
CREATE TABLE IF NOT EXISTS ad_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, -- 'agency_id' no pedido, mapeado para organization_id
    platform TEXT NOT NULL CHECK (platform IN ('meta_ads', 'google_ads', 'tiktok_ads', 'linkedin_ads', 'other')),
    account_name TEXT NOT NULL,
    account_external_id TEXT NOT NULL, -- ID da conta na plataforma externa (ex: 'act_123456')
    currency TEXT DEFAULT 'BRL',
    timezone TEXT,
    status TEXT DEFAULT 'active', -- active, inactive, disconnected
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Garante unicidade da conta externa dentro da mesma plataforma e organização
    UNIQUE(organization_id, platform, account_external_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ad_accounts_org ON ad_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_platform ON ad_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_external_id ON ad_accounts(account_external_id);


-- 2. Tabela campaigns
-- Armazena as campanhas importadas das plataformas
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ad_account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, -- Desnormalizado para facilitar queries por org
    platform TEXT NOT NULL, -- Desnormalizado para evitar joins constantes
    campaign_external_id TEXT NOT NULL, -- ID da campanha na plataforma externa
    name TEXT NOT NULL,
    status TEXT NOT NULL, -- active, paused, archived, removed
    objective TEXT, -- SALES, LEADS, AWARENESS, etc.
    budget_type TEXT, -- daily, lifetime
    budget_amount NUMERIC(15, 2),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Garante unicidade da campanha externa dentro da mesma conta
    UNIQUE(ad_account_id, campaign_external_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_campaigns_account ON campaigns(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);
CREATE INDEX IF NOT EXISTS idx_campaigns_external_id ON campaigns(campaign_external_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);


-- 3. Tabela campaign_metrics
-- Armazena as métricas diárias (Time Series) de cada campanha
CREATE TABLE IF NOT EXISTS campaign_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, -- Desnormalizado
    date DATE NOT NULL,
    
    -- Métricas principais
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    spend NUMERIC(15, 2) DEFAULT 0,
    reach BIGINT DEFAULT 0,
    
    -- Conversões
    leads BIGINT DEFAULT 0,
    conversions BIGINT DEFAULT 0, -- Conversões totais (leads + purchases + etc)
    revenue NUMERIC(15, 2) DEFAULT 0, -- Valor de conversão (ROAS numerator)
    
    -- Métricas calculadas (Virtual Columns / Generated Columns)
    -- Opcional: Manter calculado no banco ou na aplicação. 
    -- Aqui optamos por colunas geradas para facilitar queries analíticas diretas no banco.
    ctr NUMERIC(5, 2) GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN (clicks::numeric / impressions) * 100 ELSE 0 END) STORED,
    cpc NUMERIC(10, 2) GENERATED ALWAYS AS (CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END) STORED,
    cpm NUMERIC(10, 2) GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN (spend / impressions) * 1000 ELSE 0 END) STORED,
    roas NUMERIC(10, 2) GENERATED ALWAYS AS (CASE WHEN spend > 0 THEN revenue / spend ELSE 0 END) STORED,
    cpa NUMERIC(10, 2) GENERATED ALWAYS AS (CASE WHEN conversions > 0 THEN spend / conversions ELSE 0 END) STORED,

    created_at TIMESTAMPTZ DEFAULT now(),

    -- Garante apenas um registro por dia para cada campanha
    UNIQUE(campaign_id, date)
);

-- Índices para performance em dashboards e análises temporais
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign ON campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_org_date ON campaign_metrics(organization_id, date); -- Critical for dashboards
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date ON campaign_metrics(date);


-- 4. Trigger para atualizar 'updated_at' automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ad_accounts_updated_at
    BEFORE UPDATE ON ad_accounts
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();


-- 5. Políticas de Segurança (RLS)
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: Usuários vêem dados da sua organização
CREATE POLICY "Users can view ad_accounts from their org" ON ad_accounts
    FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE organization_id = ad_accounts.organization_id));

CREATE POLICY "Users can view campaigns from their org" ON campaigns
    FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE organization_id = campaigns.organization_id));

CREATE POLICY "Users can view metrics from their org" ON campaign_metrics
    FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE organization_id = campaign_metrics.organization_id));

-- Política de Escrita: Apenas admins/owners ou Service Role (Automações n8n)
CREATE POLICY "Admins can manage ad_accounts" ON ad_accounts
    FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE organization_id = ad_accounts.organization_id AND role IN ('owner', 'admin')));

CREATE POLICY "Admins can manage campaigns" ON campaigns
    FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE organization_id = campaigns.organization_id AND role IN ('owner', 'admin')));

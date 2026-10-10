-- Migration: 00052_portfolios_and_rankings.sql
-- Description: Add portfolio support to teams and clients, and fields for agency-level marketing integrations.

-- 1. Add team_type enum and type/is_portfolio to teams table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_type') THEN
    CREATE TYPE team_type AS ENUM ('comercial', 'operacional');
  END IF;
END $$;

ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS type team_type DEFAULT 'operacional',
ADD COLUMN IF NOT EXISTS is_portfolio BOOLEAN DEFAULT false;

-- Update existing teams: if a team is marked as commercial, it can be a portfolio.
UPDATE public.teams SET type = 'comercial', is_portfolio = true WHERE name ILIKE '%comercial%' OR name ILIKE '%vendas%';

-- 2. Link clients to a portfolio (which is a team of type 'comercial')
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS portfolio_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_portfolio_team_id ON public.clients(portfolio_team_id);

-- 3. Add agency-level marketing integration fields to organizations
-- This is for the agency's own Google/Meta Ads integration (Marketing Performance)
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS marketing_settings JSONB DEFAULT '{
  "meta_ads": {"enabled": false, "account_id": null},
  "google_ads": {"enabled": false, "account_id": null}
}';

-- 4. Add more metrics to daily_metrics if needed for rankings
-- (Already has total_spend, total_leads, total_sales, total_revenue)
ALTER TABLE public.daily_metrics
ADD COLUMN IF NOT EXISTS total_impressions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue NUMERIC DEFAULT 0;

-- 5. Views for Rankings

-- View for Seller Ranking (Leads converted to clients/won)
CREATE OR REPLACE VIEW public.seller_ranking AS
SELECT 
    p.id as profile_id,
    p.full_name,
    p.organization_id,
    COUNT(c.id) as total_contracts,
    SUM(COALESCE(cont.value, 0)) as total_revenue
FROM public.profiles p
LEFT JOIN public.leads l ON l.assigned_to = p.id AND l.stage_id = 'efetivados'
LEFT JOIN public.clients c ON c.lead_id = l.id
LEFT JOIN public.contracts cont ON cont.client_id = c.id AND cont.status = 'ativo'
GROUP BY p.id, p.full_name, p.organization_id;

-- View for Portfolio Ranking
CREATE OR REPLACE VIEW public.portfolio_ranking AS
SELECT 
    t.id as team_id,
    t.name as portfolio_name,
    t.organization_id,
    SUM(COALESCE(dm.total_revenue, 0)) as total_revenue,
    SUM(COALESCE(dm.total_spend, 0)) as total_marketing_spend,
    SUM(COALESCE(dm.total_leads, 0)) as total_marketing_leads,
    CASE 
        WHEN SUM(COALESCE(dm.total_spend, 0)) > 0 
        THEN SUM(COALESCE(dm.total_revenue, 0)) / SUM(COALESCE(dm.total_spend, 0))
        ELSE 0 
    END as roas_consolidated
FROM public.teams t
JOIN public.clients c ON c.portfolio_team_id = t.id
LEFT JOIN public.daily_metrics dm ON dm.client_id = c.id
WHERE t.is_portfolio = true
GROUP BY t.id, t.name, t.organization_id;

-- Ensure RLS allows reading these views (views inherit RLS from underlying tables usually, 
-- but we should be careful with complex joins)
GRANT SELECT ON public.seller_ranking TO authenticated;
GRANT SELECT ON public.portfolio_ranking TO authenticated;


-- 4. View de Performance Agregada (Totais por Campanha)
CREATE OR REPLACE VIEW campaign_performance AS
SELECT 
  c.id,
  c.organization_id,
  c.platform,
  c.external_id,
  c.name,
  c.status,
  c.budget,
  COALESCE(SUM(m.impressions), 0) as total_impressions,
  COALESCE(SUM(m.clicks), 0) as total_clicks,
  COALESCE(SUM(m.spend), 0) as total_spend,
  COALESCE(SUM(m.leads), 0) as total_leads,
  COALESCE(SUM(m.revenue), 0) as total_revenue,
  MAX(m.date) as last_data_sync
FROM campaigns c
LEFT JOIN campaign_daily_metrics m ON c.id = m.campaign_id
GROUP BY c.id, c.organization_id, c.platform, c.external_id, c.name, c.status, c.budget;

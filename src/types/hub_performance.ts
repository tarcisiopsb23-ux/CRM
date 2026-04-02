export interface ClientIntegration {
  id: string;
  client_id: string;
  organization_id: string;
  platform: 'meta' | 'google';
  access_token?: string;
  account_id?: string;
  refresh_token?: string;
  token_expires_at?: string;
  settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ClientKPI {
  id: string;
  client_id: string;
  organization_id: string;
  date: string;
  metric_name: string;
  value: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignData {
  id: string;
  client_id: string;
  organization_id: string;
  date: string;
  platform: string;
  campaign_name?: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  leads?: number;
  sales?: number;
  created_at: string;
}

export interface DailyMetrics {
  id: string;
  client_id: string;
  organization_id: string;
  date: string;
  total_spend?: number;
  total_leads?: number;
  total_sales?: number;
  total_revenue?: number;
  total_impressions?: number;
  total_clicks?: number;
  cpl?: number;
  cpa?: number;
  roas?: number;
  created_at: string;
}

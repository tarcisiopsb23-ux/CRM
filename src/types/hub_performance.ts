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
  last_sync_at?: string | null;
  sync_status?: 'pending' | 'syncing' | 'success' | 'error' | null;
  sync_error?: string | null;
  last_sync_records?: number | null;
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
  campaign_id?: string | null;
  campaign_name?: string;
  objective?: string | null;
  objective_metric_label?: string | null;
  objective_metric_value?: number | null;
  spend?: number;
  clicks?: number;
  impressions?: number;
  reach?: number;
  leads?: number;
  sales?: number;
  revenue?: number;
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

/**
 * useCampaignData
 * Busca e agrega campaign_data da agência com filtro de período.
 * Usado pelo módulo CampaignReports.
 * Filtra pelo client_id da agência configurado nas Settings → n8n → adsClientId.
 */
export { useAgencyCampaignData as useCampaignData } from "@/hooks/useAgencyCampaignData";

// Tipos re-exportados para compatibilidade com CampaignReports
export type { PeriodRange } from "@/hooks/useAgencyCampaignData";

export interface CampaignSummary {
  id: string;
  name: string;
  platform: string;
  status: string;
  objective: string | null;
  budget_amount: number | null;
  budget_type: string | null;
  start_date: string | null;
  end_date: string | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  conversions: number;
  cpc: number;
  cpm: number;
  ctr: number;
  cpl: number;
  roas: number;
  roi: number;
  budgetPct: number;
}

export interface TrendPoint {
  date: string;
  spend: number;
  revenue: number;
  leads: number;
  impressions: number;
  clicks: number;
}

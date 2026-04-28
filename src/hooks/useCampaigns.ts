/**
 * useCampaigns
 * Retorna campanhas da própria agência (filtradas por adsClientId das Settings).
 * Usado pelo Dashboard e módulo Campanhas.
 */
export { useAgencyCampaignData as useCampaigns } from "@/hooks/useAgencyCampaignData";
export type { } from "@/hooks/useAgencyCampaignData";

// Re-exporta o tipo Campaign para compatibilidade
export interface Campaign {
  id: string;
  name: string;
  platform: string;
  account: string;
  status: string;
  spend: number;
  budget?: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  meetings: number;
  contracts: number;
  revenue: number;
}

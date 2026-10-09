import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MetaAdsMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  leads: number;
  cpl: number;
  purchases: number;
  roas: number;
  byCampaign: {
    campaign_id: string;
    campaign_name: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    purchases: number;
    roas: number;
  }[];
  byDay: {
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
  }[];
}

/**
 * Fetches Meta Ads Insights via Supabase Edge Function (server-side, uses stored OAuth token).
 */
export function useMetaAdsMetrics(
  clientId?: string,
  dateRange?: { from: string; to: string }
) {
  return useQuery<MetaAdsMetrics | null>({
    queryKey: ["meta_ads_metrics", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return null;
      const { data, error } = await supabase.functions.invoke("meta-ads-metrics", {
        body: { clientId, dateRange },
      });
      if (error) throw error;
      return data as MetaAdsMetrics;
    },
    enabled: !!clientId && !!dateRange,
    staleTime: 5 * 60 * 1000,
  });
}

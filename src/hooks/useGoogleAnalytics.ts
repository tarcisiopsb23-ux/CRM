import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface GA4Metrics {
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  bySource: { source: string; sessions: number; conversions: number }[];
  byCampaign: { campaign: string; sessions: number; conversions: number }[];
  byDay: { date: string; sessions: number; conversions: number }[];
}

export interface GoogleAdsMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  cpa: number;
  roas: number;
  byCampaign: {
    campaign: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    roas: number;
  }[];
  byDay: { date: string; spend: number; clicks: number; conversions: number }[];
}

/**
 * Fetches GA4 data via Supabase Edge Function (server-side, uses stored OAuth token).
 */
export function useGA4Metrics(
  clientId?: string,
  dateRange?: { from: string; to: string }
) {
  return useQuery<GA4Metrics | null>({
    queryKey: ["ga4_metrics", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return null;
      const { data, error } = await supabase.functions.invoke("ga4-metrics", {
        body: { clientId, dateRange },
      });
      if (error) throw error;
      return data as GA4Metrics;
    },
    enabled: !!clientId && !!dateRange,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

/**
 * Fetches Google Ads data via Supabase Edge Function.
 */
export function useGoogleAdsMetrics(
  clientId?: string,
  dateRange?: { from: string; to: string }
) {
  return useQuery<GoogleAdsMetrics | null>({
    queryKey: ["gads_metrics", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return null;
      const { data, error } = await supabase.functions.invoke("gads-metrics", {
        body: { clientId, dateRange },
      });
      if (error) throw error;
      return data as GoogleAdsMetrics;
    },
    enabled: !!clientId && !!dateRange,
    staleTime: 5 * 60 * 1000,
  });
}

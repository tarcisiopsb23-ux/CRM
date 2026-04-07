import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface FunnelStats {
  // Ad data (from APIs + ad_click_sessions)
  impressions: number;   // Google impressions + Meta impressions
  clicks: number;        // Google clicks + Meta clicks + ad_click_sessions
  // CRM pipeline (from crm_lead_stage_history)
  novo: number;          // leads that entered "novo" in the period
  contato: number;       // leads that entered "contato" (qualified)
  proposta: number;
  negociacao: number;
  fechado: number;       // closed deals
  perdido: number;
}

/**
 * Fetches funnel stats combining:
 * - Ad impressions/clicks from daily_metrics (manually entered or API-fed)
 * - Ad clicks from ad_click_sessions (link tracking)
 * - CRM stage history counts per date range
 */
export function useFunnelStats(
  clientId?: string,
  dateRange?: { from: string; to: string },
  adTotals?: { impressions: number; clicks: number },
  adClickSessions?: number,
  googleAdsData?: { impressions: number; clicks: number } | null,
  metaAdsData?: { impressions: number; clicks: number } | null
) {
  return useQuery<FunnelStats>({
    queryKey: ["funnel_stats", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return emptyStats();

      // Fetch CRM stage history counts
      const { data, error } = await supabase.rpc("get_funnel_stats", {
        p_from: dateRange.from + "T00:00:00Z",
        p_to:   dateRange.to   + "T23:59:59Z",
      });

      if (error) throw error;

      const stageMap: Record<string, number> = {};
      for (const row of (data ?? [])) {
        stageMap[row.stage] = Number(row.total);
      }

      // Aggregate impressions: Google Ads + Meta Ads + daily_metrics fallback
      const googleImpressions = googleAdsData?.impressions ?? 0;
      const metaImpressions   = metaAdsData?.impressions   ?? 0;
      const fallbackImpressions = adTotals?.impressions ?? 0;
      const impressions = (googleImpressions + metaImpressions) > 0
        ? googleImpressions + metaImpressions
        : fallbackImpressions;

      // Aggregate clicks: Google Ads + Meta Ads + ad_click_sessions + daily_metrics fallback
      const googleClicks = googleAdsData?.clicks ?? 0;
      const metaClicks   = metaAdsData?.clicks   ?? 0;
      const linkClicks   = adClickSessions ?? 0;
      const fallbackClicks = adTotals?.clicks ?? 0;
      const clicks = (googleClicks + metaClicks + linkClicks) > 0
        ? googleClicks + metaClicks + linkClicks
        : fallbackClicks;

      return {
        impressions,
        clicks,
        novo:       stageMap["novo"]       ?? 0,
        contato:    stageMap["contato"]    ?? 0,
        proposta:   stageMap["proposta"]   ?? 0,
        negociacao: stageMap["negociacao"] ?? 0,
        fechado:    stageMap["fechado"]    ?? 0,
        perdido:    stageMap["perdido"]    ?? 0,
      };
    },
    enabled: !!clientId && !!dateRange,
  });
}

function emptyStats(): FunnelStats {
  return { impressions: 0, clicks: 0, novo: 0, contato: 0, proposta: 0, negociacao: 0, fechado: 0, perdido: 0 };
}

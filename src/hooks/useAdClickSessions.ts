import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdClickSession {
  id: string;
  client_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  whatsapp_number: string | null;
  clicked_at: string;
  lead_id: string | null;
  matched_at: string | null;
}

export interface AdClickStats {
  totalClicks: number;
  uniqueCampaigns: number;
  byCampaign: { campaign: string; clicks: number; source: string }[];
  bySource: { source: string; clicks: number }[];
  byDay: { date: string; clicks: number }[];
  conversionRate: number; // % com lead_id associado
}

export function useAdClickSessions(
  clientId?: string,
  dateRange?: { from: string; to: string }
) {
  return useQuery<AdClickStats>({
    queryKey: ["ad_click_sessions", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return {
        totalClicks: 0, uniqueCampaigns: 0,
        byCampaign: [], bySource: [], byDay: [], conversionRate: 0,
      };

      const { data, error } = await supabase
        .from("ad_click_sessions")
        .select("*")
        .eq("client_id", clientId)
        .gte("clicked_at", dateRange.from)
        .lte("clicked_at", dateRange.to + "T23:59:59Z")
        .order("clicked_at", { ascending: true });

      if (error) throw error;
      const rows: AdClickSession[] = data || [];

      const totalClicks = rows.length;
      const matched = rows.filter(r => r.lead_id).length;
      const conversionRate = totalClicks > 0 ? (matched / totalClicks) * 100 : 0;

      // by campaign
      const campaignMap = new Map<string, { clicks: number; source: string }>();
      for (const r of rows) {
        const key = r.utm_campaign || "(sem campanha)";
        const existing = campaignMap.get(key);
        if (existing) existing.clicks++;
        else campaignMap.set(key, { clicks: 1, source: r.utm_source || "direto" });
      }
      const byCampaign = Array.from(campaignMap.entries())
        .map(([campaign, v]) => ({ campaign, ...v }))
        .sort((a, b) => b.clicks - a.clicks);

      // by source
      const sourceMap = new Map<string, number>();
      for (const r of rows) {
        const key = r.utm_source || "direto";
        sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
      }
      const bySource = Array.from(sourceMap.entries())
        .map(([source, clicks]) => ({ source, clicks }))
        .sort((a, b) => b.clicks - a.clicks);

      // by day
      const dayMap = new Map<string, number>();
      for (const r of rows) {
        const day = r.clicked_at.slice(0, 10);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      }
      const byDay = Array.from(dayMap.entries())
        .map(([date, clicks]) => ({ date, clicks }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const uniqueCampaigns = campaignMap.size;

      return { totalClicks, uniqueCampaigns, byCampaign, bySource, byDay, conversionRate };
    },
    enabled: !!clientId && !!dateRange,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

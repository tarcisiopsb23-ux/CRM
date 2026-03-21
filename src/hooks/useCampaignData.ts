import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  status: string;
  objective: string | null;
  budget_amount: number | null;
  budget_type: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface DailyMetricRow {
  campaign_id: string;
  date: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  conversions: number;
}

export interface CampaignSummary extends CampaignRow {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  conversions: number;
  // derived
  cpc: number;
  cpm: number;
  ctr: number;
  cpl: number;
  roas: number;
  roi: number;
  budgetPct: number; // spend / budget_amount * 100
}

export interface TrendPoint {
  date: string;       // YYYY-MM-DD
  spend: number;
  revenue: number;
  leads: number;
  impressions: number;
  clicks: number;
}

export interface PeriodRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCampaignData(range?: PeriodRange) {
  const organizationId = useOrganization();

  // 1. Fetch campaigns metadata
  const campaignsQuery = useQuery({
    queryKey: ["campaigns_meta", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as CampaignRow[];
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, platform, status, objective, budget_amount, budget_type, start_date, end_date")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch daily metrics filtered by period
  const metricsQuery = useQuery({
    queryKey: ["campaign_metrics", organizationId, range?.from, range?.to],
    queryFn: async () => {
      if (!organizationId) return [] as DailyMetricRow[];
      let q = supabase
        .from("campaign_metrics")
        .select("campaign_id, date, spend, revenue, impressions, clicks, reach, leads, conversions")
        .eq("organization_id", organizationId)
        .order("date", { ascending: true });
      if (range?.from) q = q.gte("date", range.from);
      if (range?.to)   q = q.lte("date", range.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(r => ({
        campaign_id: r.campaign_id,
        date:        r.date,
        spend:       Number(r.spend       ?? 0),
        revenue:     Number(r.revenue     ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks:      Number(r.clicks      ?? 0),
        reach:       Number(r.reach       ?? 0),
        leads:       Number(r.leads       ?? 0),
        conversions: Number(r.conversions ?? 0),
      })) as DailyMetricRow[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // 3. Aggregate metrics per campaign
  const campaigns = useMemo<CampaignSummary[]>(() => {
    const meta = campaignsQuery.data ?? [];
    const metrics = metricsQuery.data ?? [];

    return meta.map(c => {
      const rows = metrics.filter(m => m.campaign_id === c.id);
      const spend       = rows.reduce((s, r) => s + r.spend, 0);
      const revenue     = rows.reduce((s, r) => s + r.revenue, 0);
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      const clicks      = rows.reduce((s, r) => s + r.clicks, 0);
      const reach       = rows.reduce((s, r) => s + r.reach, 0);
      const leads       = rows.reduce((s, r) => s + r.leads, 0);
      const conversions = rows.reduce((s, r) => s + r.conversions, 0);

      const platformLabel =
        c.platform === "google_ads" ? "Google Ads" :
        c.platform === "meta_ads"   ? "Meta Ads"   :
        c.platform === "tiktok_ads" ? "TikTok Ads" :
        c.platform;

      const statusLabel =
        c.status === "active"  ? "Ativa"    :
        c.status === "paused"  ? "Pausada"  :
        c.status === "archived"? "Arquivada":
        "Encerrada";

      return {
        ...c,
        platform: platformLabel,
        status: statusLabel,
        spend, revenue, impressions, clicks, reach, leads, conversions,
        cpc:       clicks      > 0 ? spend / clicks : 0,
        cpm:       impressions > 0 ? (spend / impressions) * 1000 : 0,
        ctr:       impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpl:       leads       > 0 ? spend / leads : 0,
        roas:      spend       > 0 ? revenue / spend : 0,
        roi:       spend       > 0 ? ((revenue - spend) / spend) * 100 : 0,
        budgetPct: c.budget_amount && c.budget_amount > 0 ? (spend / c.budget_amount) * 100 : 0,
      };
    });
  }, [campaignsQuery.data, metricsQuery.data]);

  // 4. Totals across all campaigns
  const totals = useMemo(() => campaigns.reduce((acc, c) => ({
    spend:       acc.spend       + c.spend,
    revenue:     acc.revenue     + c.revenue,
    impressions: acc.impressions + c.impressions,
    clicks:      acc.clicks      + c.clicks,
    reach:       acc.reach       + c.reach,
    leads:       acc.leads       + c.leads,
    conversions: acc.conversions + c.conversions,
  }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, conversions: 0 }), [campaigns]);

  // 5. Daily trend (aggregated across all campaigns)
  const trend = useMemo<TrendPoint[]>(() => {
    const metrics = metricsQuery.data ?? [];
    const byDate: Record<string, TrendPoint> = {};
    for (const m of metrics) {
      if (!byDate[m.date]) byDate[m.date] = { date: m.date, spend: 0, revenue: 0, leads: 0, impressions: 0, clicks: 0 };
      byDate[m.date].spend       += m.spend;
      byDate[m.date].revenue     += m.revenue;
      byDate[m.date].leads       += m.leads;
      byDate[m.date].impressions += m.impressions;
      byDate[m.date].clicks      += m.clicks;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [metricsQuery.data]);

  // 6. Spend by platform
  const byPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of campaigns) {
      map[c.platform] = (map[c.platform] ?? 0) + c.spend;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter(p => p.value > 0);
  }, [campaigns]);

  // 7. Top campaigns by ROAS
  const topByRoas = useMemo(() =>
    [...campaigns].filter(c => c.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 5),
  [campaigns]);

  // 8. Top campaigns by revenue
  const topByRevenue = useMemo(() =>
    [...campaigns].filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  [campaigns]);

  // 9. Top campaigns by conversions (leads)
  const topByConversions = useMemo(() =>
    [...campaigns].filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5),
  [campaigns]);

  return {
    campaigns,
    totals,
    trend,
    byPlatform,
    topByRoas,
    topByRevenue,
    topByConversions,
    isLoading: campaignsQuery.isLoading || metricsQuery.isLoading,
  };
}

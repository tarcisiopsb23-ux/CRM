/**
 * useCampaignData
 * Busca e agrega campaign_data da organização com filtro de período.
 * Usado pelo módulo CampaignReports.
 * Fonte: tabela campaign_data, filtrada por organization_id + date range.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // derived
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

export interface PeriodRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCampaignData(range?: PeriodRange) {
  const organizationId = useOrganization();

  const rawQuery = useQuery({
    queryKey: ["campaign_data_raw", organizationId, range?.from, range?.to],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("campaign_data")
        .select("campaign_id, campaign_name, platform, date, spend, impressions, reach, clicks, leads, sales, revenue, objective, objective_metric_label, objective_metric_value")
        .eq("organization_id", organizationId)
        .order("date", { ascending: true });
      if (range?.from) q = q.gte("date", range.from);
      if (range?.to)   q = q.lte("date", range.to);
      const { data, error } = await q;
      if (error) {
        console.warn("[useCampaignData] Erro:", error.message);
        return [];
      }
      return data ?? [];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });

  const rows = rawQuery.data ?? [];

  // Agrega por campanha (campaign_id + platform)
  const campaigns = useMemo<CampaignSummary[]>(() => {
    const map = new Map<string, CampaignSummary>();
    for (const r of rows as any[]) {
      const key = `${r.platform}||${r.campaign_id ?? r.campaign_name ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.spend       += Number(r.spend       ?? 0);
        existing.revenue     += Number(r.revenue     ?? 0);
        existing.impressions += Number(r.impressions ?? 0);
        existing.clicks      += Number(r.clicks      ?? 0);
        existing.reach       += Number(r.reach       ?? 0);
        existing.leads       += Number(r.leads       ?? 0);
        existing.conversions += Number(r.sales       ?? 0);
      } else {
        const platform =
          r.platform === "google" ? "Google Ads" :
          r.platform === "meta"   ? "Meta Ads"   :
          (r.platform ?? "");
        map.set(key, {
          id:           r.campaign_id ?? r.campaign_name ?? key,
          name:         r.campaign_name ?? "Sem nome",
          platform,
          status:       "Ativa",
          objective:    r.objective ?? null,
          budget_amount: null,
          budget_type:  null,
          start_date:   null,
          end_date:     null,
          spend:        Number(r.spend       ?? 0),
          revenue:      Number(r.revenue     ?? 0),
          impressions:  Number(r.impressions ?? 0),
          clicks:       Number(r.clicks      ?? 0),
          reach:        Number(r.reach       ?? 0),
          leads:        Number(r.leads       ?? 0),
          conversions:  Number(r.sales       ?? 0),
          cpc: 0, cpm: 0, ctr: 0, cpl: 0, roas: 0, roi: 0, budgetPct: 0,
        });
      }
    }
    return Array.from(map.values()).map(c => ({
      ...c,
      cpc:      c.clicks      > 0 ? c.spend / c.clicks : 0,
      cpm:      c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      ctr:      c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpl:      c.leads       > 0 ? c.spend / c.leads : 0,
      roas:     c.spend       > 0 ? c.revenue / c.spend : 0,
      roi:      c.spend       > 0 ? ((c.revenue - c.spend) / c.spend) * 100 : 0,
      budgetPct: 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [rows]);

  // Totais consolidados
  const totals = useMemo(() => campaigns.reduce((acc, c) => ({
    spend:       acc.spend       + c.spend,
    revenue:     acc.revenue     + c.revenue,
    impressions: acc.impressions + c.impressions,
    clicks:      acc.clicks      + c.clicks,
    reach:       acc.reach       + c.reach,
    leads:       acc.leads       + c.leads,
    conversions: acc.conversions + c.conversions,
  }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, conversions: 0 }), [campaigns]);

  // Tendência diária
  const trend = useMemo<TrendPoint[]>(() => {
    const byDate: Record<string, TrendPoint> = {};
    for (const r of rows as any[]) {
      const d = r.date;
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d, spend: 0, revenue: 0, leads: 0, impressions: 0, clicks: 0 };
      byDate[d].spend       += Number(r.spend       ?? 0);
      byDate[d].revenue     += Number(r.revenue     ?? 0);
      byDate[d].leads       += Number(r.leads       ?? 0);
      byDate[d].impressions += Number(r.impressions ?? 0);
      byDate[d].clicks      += Number(r.clicks      ?? 0);
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  // Por plataforma
  const byPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of campaigns) {
      map[c.platform] = (map[c.platform] ?? 0) + c.spend;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .filter(p => p.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [campaigns]);

  const topByRoas      = useMemo(() => [...campaigns].filter(c => c.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 5), [campaigns]);
  const topByRevenue   = useMemo(() => [...campaigns].filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5), [campaigns]);
  const topByConversions = useMemo(() => [...campaigns].filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5), [campaigns]);

  return {
    campaigns,
    totals,
    trend,
    byPlatform,
    topByRoas,
    topByRevenue,
    topByConversions,
    isLoading: rawQuery.isLoading,
  };
}

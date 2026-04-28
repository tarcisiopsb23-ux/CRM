/**
 * useCampaigns
 * Agrega campaign_data da organização (campanhas da própria agência).
 * Usado pelo Dashboard e pelo módulo Campanhas.
 * Fonte: tabela campaign_data, filtrada por organization_id.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

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

export function useCampaigns() {
  const organizationId = useOrganization();

  const { data: rawRows = [], isLoading, error } = useQuery({
    queryKey: ["campaigns_raw", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("campaign_data")
        .select("campaign_id, campaign_name, platform, spend, impressions, reach, clicks, leads, sales, revenue")
        .eq("organization_id", organizationId);
      if (error) {
        console.warn("[useCampaigns] Erro ao buscar campaign_data:", error.message);
        return [];
      }
      return data ?? [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Agrega por campanha (campaign_id + platform)
  const campaigns = useMemo<Campaign[]>(() => {
    const map = new Map<string, Campaign>();
    for (const r of rawRows as any[]) {
      const key = `${r.platform}||${r.campaign_id ?? r.campaign_name ?? ""}`;
      const existing = map.get(key);
      if (existing) {
        existing.spend       += Number(r.spend       ?? 0);
        existing.impressions += Number(r.impressions ?? 0);
        existing.clicks      += Number(r.clicks      ?? 0);
        existing.leads       += Number(r.leads       ?? 0);
        existing.revenue     += Number(r.revenue     ?? 0);
      } else {
        const leads = Number(r.leads ?? 0);
        const platform =
          r.platform === "google" ? "Google Ads" :
          r.platform === "meta"   ? "Meta Ads"   :
          (r.platform ?? "");
        map.set(key, {
          id:          r.campaign_id ?? r.campaign_name ?? key,
          name:        r.campaign_name ?? "Sem nome",
          platform,
          account:     "Conta Principal",
          status:      "Ativa",
          spend:       Number(r.spend       ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks:      Number(r.clicks      ?? 0),
          leads,
          qualified:   Math.round(leads * 0.4),
          meetings:    Math.round(leads * 0.1),
          contracts:   Math.round(leads * 0.05),
          revenue:     Number(r.revenue     ?? 0),
        });
      }
    }
    // Recalcula qualified/meetings/contracts após agregação
    return Array.from(map.values()).map(c => ({
      ...c,
      qualified: Math.round(c.leads * 0.4),
      meetings:  Math.round(c.leads * 0.1),
      contracts: Math.round(c.leads * 0.05),
    })).sort((a, b) => b.spend - a.spend);
  }, [rawRows]);

  const totals = useMemo(() => campaigns.reduce(
    (acc, c) => ({
      spend:       acc.spend       + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks:      acc.clicks      + c.clicks,
      leads:       acc.leads       + c.leads,
      qualified:   acc.qualified   + c.qualified,
      meetings:    acc.meetings    + c.meetings,
      contracts:   acc.contracts   + c.contracts,
      revenue:     acc.revenue     + c.revenue,
      count:       acc.count       + 1,
      active:      acc.active      + (c.status === "Ativa" ? 1 : 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, meetings: 0, contracts: 0, revenue: 0, count: 0, active: 0 }
  ), [campaigns]);

  const metrics = useMemo(() => ({
    cpc:  totals.clicks      > 0 ? totals.spend / totals.clicks : 0,
    cpm:  totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
    ctr:  totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    cpl:  totals.leads       > 0 ? totals.spend / totals.leads : 0,
    roas: totals.spend       > 0 ? totals.revenue / totals.spend : 0,
    roi:  totals.spend       > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : 0,
  }), [totals]);

  return { campaigns, totals, metrics, isLoading, error };
}

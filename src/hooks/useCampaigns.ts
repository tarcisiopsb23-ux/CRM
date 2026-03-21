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

const MOCK_CAMPAIGNS: Campaign[] = [];

export function useCampaigns() {
  const organizationId = useOrganization();

  const { data: campaigns = [], isLoading, error } = useQuery({
    queryKey: ["campaigns", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as Campaign[];

      type CampaignPerformanceRow = {
        id: string;
        name: string | null;
        platform: string | null;
        external_id: string | null;
        status: string | null;
        total_spend: number | string | null;
        total_impressions: number | string | null;
        total_clicks: number | string | null;
        total_leads: number | string | null;
        total_revenue: number | string | null;
      };

      const { data, error } = await supabase
        .from("campaign_performance" as never)
        .select("*")
        .eq("organization_id", organizationId);

      if (error) {
        console.warn("View campaign_performance não encontrada:", error.message);
        return [] as Campaign[];
      }

      if (!data || data.length === 0) return [] as Campaign[];

      const rows = (data ?? []) as unknown as CampaignPerformanceRow[];
      return rows.map((c) => {
        const leads = Number(c.total_leads || 0);
        const platform =
          c.platform === "google_ads" ? "Google Ads" :
          c.platform === "meta_ads"   ? "Facebook Ads" :
          (c.platform ?? "");
        const status =
          c.status === "active"  ? "Ativa" :
          c.status === "paused"  ? "Pausada" :
          "Encerrada";
        return {
          id: String(c.id),
          name: c.name ?? "Campanha",
          platform,
          account: c.external_id || "Conta Principal",
          status,
          spend:       Number(c.total_spend       || 0),
          impressions: Number(c.total_impressions  || 0),
          clicks:      Number(c.total_clicks       || 0),
          leads,
          qualified:   Math.round(leads * 0.4),
          meetings:    Math.round(leads * 0.1),
          contracts:   Math.round(leads * 0.05),
          revenue:     Number(c.total_revenue      || 0),
        };
      });
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        leads: acc.leads + c.leads,
        qualified: acc.qualified + c.qualified,
        meetings: acc.meetings + c.meetings,
        contracts: acc.contracts + c.contracts,
        revenue: acc.revenue + c.revenue,
        count: acc.count + 1,
        active: acc.active + (c.status === "Ativa" ? 1 : 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, meetings: 0, contracts: 0, revenue: 0, count: 0, active: 0 }
    );
  }, [campaigns]);

  const metrics = useMemo(() => {
    return {
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpl: totals.leads > 0 ? totals.spend / totals.leads : 0,
      roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
      roi: totals.spend > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : 0,
    };
  }, [totals]);

  return { campaigns, totals, metrics, isLoading, error };
}

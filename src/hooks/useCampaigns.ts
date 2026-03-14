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

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "c1", name: "Campanha Verão 2026", platform: "Google Ads", account: "Conta Principal", status: "Ativa", spend: 12500, budget: 15000, impressions: 450000, clicks: 8200, leads: 320, qualified: 180, meetings: 45, contracts: 18, revenue: 95000 },
  { id: "c2", name: "Remarketing Clientes", platform: "Facebook Ads", account: "Conta Principal", status: "Ativa", spend: 6800, budget: 8000, impressions: 280000, clicks: 5100, leads: 210, qualified: 120, meetings: 28, contracts: 12, revenue: 62000 },
  { id: "c3", name: "Captação B2B", platform: "Google Ads", account: "Conta Secundária", status: "Ativa", spend: 18200, budget: 20000, impressions: 620000, clicks: 11400, leads: 480, qualified: 260, meetings: 62, contracts: 25, revenue: 142000 },
  { id: "c4", name: "Awareness Brand", platform: "Facebook Ads", account: "Conta Secundária", status: "Pausada", spend: 4500, budget: 5000, impressions: 890000, clicks: 3200, leads: 95, qualified: 40, meetings: 8, contracts: 3, revenue: 15000 },
  { id: "c5", name: "Promo Black Friday", platform: "Google Ads", account: "Conta Principal", status: "Encerrada", spend: 22000, budget: 22000, impressions: 780000, clicks: 15600, leads: 620, qualified: 350, meetings: 88, contracts: 40, revenue: 210000 },
  { id: "c6", name: "Lead Gen Educação", platform: "Facebook Ads", account: "Conta Principal", status: "Ativa", spend: 9300, budget: 10000, impressions: 340000, clicks: 6800, leads: 290, qualified: 160, meetings: 38, contracts: 15, revenue: 78000 },
];

export function useCampaigns() {
  const organizationId = useOrganization();

  const { data: campaigns = MOCK_CAMPAIGNS, isLoading, error } = useQuery({
    queryKey: ["campaigns", organizationId],
    queryFn: async () => {
      if (!organizationId) return MOCK_CAMPAIGNS;
      
      try {
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
        // Tenta buscar da view campaign_performance
        // Como a view pode não existir ainda no banco em produção, usamos any para evitar erro de TS na compilação
        // e um try/catch para fallback pro mock
        const { data, error } = await supabase
          .from("campaign_performance" as any)
          .select("*")
          .eq("organization_id", organizationId);
          
        if (error) {
            console.warn("View campaign_performance não encontrada, usando dados mockados:", error.message);
            return MOCK_CAMPAIGNS;
        }

        if (!data || data.length === 0) return MOCK_CAMPAIGNS; // Retorna mock se vazio para demo

        const rows = (data ?? []) as unknown as CampaignPerformanceRow[];
        return rows.map((c) => {
          const leads = Number(c.total_leads || 0);
          const platform =
            c.platform === "google_ads"
              ? "Google Ads"
              : c.platform === "meta_ads"
                ? "Facebook Ads"
                : (c.platform ?? "");
          const status =
            c.status === "active"
              ? "Ativa"
              : c.status === "paused"
                ? "Pausada"
                : "Encerrada";
          return {
            id: String(c.id),
            name: c.name ?? "Campanha",
            platform,
            account: c.external_id || "Conta Principal",
            status,
            spend: Number(c.total_spend || 0),
            impressions: Number(c.total_impressions || 0),
            clicks: Number(c.total_clicks || 0),
            leads,
            qualified: Math.round(leads * 0.4),
            meetings: Math.round(leads * 0.1),
            contracts: Math.round(leads * 0.05),
            revenue: Number(c.total_revenue || 0),
          };
        });
      } catch (err) {
        return MOCK_CAMPAIGNS;
      }
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutos de cache
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

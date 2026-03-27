import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CampaignData {
  id: string;
  client_id: string;
  date: string;
  platform: string;
  name: string;
  spend: number;
  leads: number | null;
  sales: number | null;
  revenue: number;
}

export interface DailyMetrics {
  id: string;
  client_id: string;
  date: string;
  total_spend: number;
  total_leads: number;
  total_sales: number;
  revenue: number;
  impressions: number;
  clicks: number;
}

// Hook para buscar dados de campanhas e métricas diárias
// Sem organization_id — single-tenant, filtra apenas por client_id
export function useClientReports(
  clientId?: string,
  dateRange?: { from: string; to: string }
) {
  const campaignDataQuery = useQuery<CampaignData[]>({
    queryKey: ["campaign_data", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return [];
      const { data, error } = await supabase
        .from("campaign_data")
        .select("*")
        .eq("client_id", clientId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId && !!dateRange,
  });

  const dailyMetricsQuery = useQuery<DailyMetrics[]>({
    queryKey: ["daily_metrics", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return [];
      const { data, error } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("client_id", clientId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to)
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId && !!dateRange,
  });

  return { campaignDataQuery, dailyMetricsQuery };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ClientIntegration, ClientKPI, CampaignData, DailyMetrics } from "@/types/hub_performance";

// Hook para gerenciar integrações de clientes
export function useClientIntegrations(organizationId?: string, clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientIntegration[]>({ 
    queryKey: ["client_integrations", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_integrations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId,
  });

  const upsert = useMutation({
    mutationFn: async (integration: Partial<ClientIntegration>) => {
      if (!organizationId || !clientId) throw new Error("Faltando ID da organização ou cliente");
      const { data, error } = await supabase.from("client_integrations").upsert({ ...integration, organization_id: organizationId, client_id: clientId }).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations", organizationId, clientId] });
    },
  });

  return { ...query, upsert, remove };
}

// Hook para gerenciar KPIs manuais de clientes
export function useClientKPIs(organizationId?: string, clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientKPI[]>({ 
    queryKey: ["client_kpis", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_kpis")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId,
  });

  const create = useMutation({
    mutationFn: async (kpi: Omit<ClientKPI, 'id' | 'created_at' | 'updated_at' | 'organization_id'>) => {
      if (!organizationId || !clientId) throw new Error("Faltando ID da organização ou cliente");
      const { data, error } = await supabase.from("client_kpis").insert({ ...kpi, organization_id: organizationId, client_id: clientId }).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_kpis", organizationId, clientId] });
    },
  });

  return { ...query, create };
}

// Hook para buscar dados de relatórios (campaign_data e daily_metrics)
export function useClientReports(organizationId?: string, clientId?: string, dateRange?: { from: string, to: string }) {

  const campaignDataQuery = useQuery<CampaignData[]>({ 
    queryKey: ["campaign_data", organizationId, clientId, dateRange],
    queryFn: async () => {
      if (!organizationId || !clientId || !dateRange) return [];
      const { data, error } = await supabase
        .from("campaign_data")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId && !!dateRange,
  });

  const dailyMetricsQuery = useQuery<DailyMetrics[]>({ 
    queryKey: ["daily_metrics", organizationId, clientId, dateRange],
    queryFn: async () => {
      if (!organizationId || !clientId || !dateRange) return [];
      const { data, error } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to)
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId && !!dateRange,
  });

  return { campaignDataQuery, dailyMetricsQuery };
}

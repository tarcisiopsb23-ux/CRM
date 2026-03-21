import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ClientKPI {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  category: string;
  unit: 'currency' | 'percentage' | 'number';
  is_predefined: boolean;
  target_value: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClientKPIHistory {
  id: string;
  organization_id: string;
  client_id: string;
  kpi_id: string;
  month_year: string;
  value: number;
  created_at: string;
  updated_at: string;
}

export function useClientKPIs(organizationId?: string, clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientKPI[]>({
    queryKey: ["client_kpis_v2", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_kpis")
        .select("*")
        .eq("client_id", clientId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId,
  });

  const create = useMutation({
    mutationFn: async (kpi: Partial<ClientKPI>) => {
      if (!organizationId || !clientId) {
        throw new Error("ID da organização ou do cliente não fornecido.");
      }
      const { data, error } = await supabase
        .from("client_kpis")
        .insert({ ...kpi, organization_id: organizationId, client_id: clientId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_kpis_v2", organizationId, clientId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_kpis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_kpis_v2", organizationId, clientId] });
      qc.invalidateQueries({ queryKey: ["client_kpi_history", organizationId, clientId] });
    },
  });

  return { ...query, create, remove };
}

export function useClientKPIHistory(organizationId?: string, clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientKPIHistory[]>({
    queryKey: ["client_kpi_history", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("client_kpi_history")
        .select("*")
        .eq("client_id", clientId)
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!clientId,
  });

  const upsert = useMutation({
    mutationFn: async (history: Partial<ClientKPIHistory>) => {
      const { data, error } = await supabase
        .from("client_kpi_history")
        .upsert({ ...history, organization_id: organizationId, client_id: clientId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_kpi_history", organizationId, clientId] });
    },
  });

  return { ...query, upsert };
}

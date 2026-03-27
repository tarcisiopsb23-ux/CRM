import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ClientKPI {
  id: string;
  client_id: string;
  name: string;
  category: string;
  unit: "currency" | "percentage" | "number";
  is_predefined: boolean;
  target_value: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClientKPIHistory {
  id: string;
  client_id: string;
  kpi_id: string;
  month_year: string;
  value: number;
  created_at: string;
  updated_at: string;
}

// Single-tenant: sem organization_id
export function useClientKPIs(clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientKPI[]>({
    queryKey: ["client_kpis", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("client_kpis")
        .select("*")
        .eq("client_id", clientId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  const create = useMutation({
    mutationFn: async (kpi: Partial<ClientKPI>) => {
      if (!clientId) throw new Error("client_id não fornecido.");
      const { data, error } = await supabase
        .from("client_kpis")
        .insert({ ...kpi, client_id: clientId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_kpis", clientId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_kpis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_kpis", clientId] });
      qc.invalidateQueries({ queryKey: ["client_kpi_history", clientId] });
    },
  });

  return { ...query, create, remove };
}

export function useClientKPIHistory(clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<ClientKPIHistory[]>({
    queryKey: ["client_kpi_history", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("client_kpi_history")
        .select("*")
        .eq("client_id", clientId)
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  const upsert = useMutation({
    mutationFn: async (history: Partial<ClientKPIHistory>) => {
      const { data, error } = await supabase
        .from("client_kpi_history")
        .upsert({ ...history, client_id: clientId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_kpi_history", clientId] }),
  });

  return { ...query, upsert };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface C8Plan {
  id: string;
  organization_id: string;
  name: string;
  max_users: number;
  monthly_value: number;
  billing_cycle: "mensal" | "trimestral" | "semestral" | "anual";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const BILLING_CYCLE_LABELS: Record<string, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export function useC8Plans(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery<C8Plan[]>({
    queryKey: ["c8_plans", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("c8_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as C8Plan[];
    },
    enabled: !!organizationId,
  });

  const upsert = useMutation({
    mutationFn: async (plan: Partial<C8Plan> & { name: string; max_users: number; monthly_value: number }) => {
      if (!organizationId) throw new Error("Sem organização");
      const payload = { ...plan, organization_id: organizationId };
      const { data, error } = await supabase
        .from("c8_plans")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return data as C8Plan;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["c8_plans", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("c8_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["c8_plans", organizationId] }),
  });

  return { ...query, upsert, remove };
}

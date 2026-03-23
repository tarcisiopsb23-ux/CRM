import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";

export type GoalIndicator = "inadimplencia" | "efetivacoes" | "faturamento" | "numero_contatos" | "outro";
export type GoalPeriod = "diario" | "semanal" | "mensal" | "trimestral" | "anual";
export type GoalSource = 'manual' | 'team_sales' | 'board_revenue';

export interface Goal {
  id: string;
  organization_id: string;
  team_id: string | null;
  assigned_to: string | null;
  responsible_type?: "individual" | "team" | "all" | "profile";
  responsible_id?: string | null;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string | null;
  period: GoalPeriod;
  period_start: string;
  period_end: string;
  indicator: GoalIndicator | null;
  source: GoalSource;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useGoals(organizationId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["goals", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("organization_id", organizationId)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Goal[];
    },
    enabled: !!organizationId,
  });
  const create = useMutation({
    mutationFn: async (
      input: Pick<Goal, "title" | "period" | "period_start" | "period_end" | "target_value"> &
        Partial<Omit<Goal, "title" | "period" | "period_start" | "period_end" | "target_value">>
    ) => {
      if (!organizationId) throw new Error("Sem organização");
      const { metadata, ...rest } = input;
      const payload = { ...rest, organization_id: organizationId, ...(metadata !== undefined && { metadata: toJson(metadata) }) };
      const { data, error } = await supabase
        .from("goals")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Goal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", organizationId] }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Goal> & { id: string }) => {
      const { metadata, ...rest } = input;
      const payload = { ...rest, ...(metadata !== undefined && { metadata: toJson(metadata) }) };
      const { data, error } = await supabase.from("goals").update(payload).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Goal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", organizationId] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", organizationId] }),
  });
  return { ...query, create, update, remove };
}

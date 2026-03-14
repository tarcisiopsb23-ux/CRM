import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface GoalProgressRow {
  id: string;
  goal_id: string;
  value: number;
  notes: string | null;
  recorded_at: string | null;
}

export function useGoalProgress(goalId: string | null | undefined) {
  return useQuery({
    queryKey: ["goal_progress", goalId],
    queryFn: async () => {
      if (!goalId) return [];
      const { data, error } = await supabase
        .from("goal_progress")
        .select("*")
        .eq("goal_id", goalId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoalProgressRow[];
    },
    enabled: !!goalId,
  });
}

export function useAddGoalProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal_id, value, notes }: { goal_id: string; value: number; notes?: string | null }) => {
      const { error: insErr } = await supabase
        .from("goal_progress")
        .insert({
          goal_id,
          value,
          notes: notes ?? null,
          recorded_at: new Date().toISOString(),
        });
      if (insErr) throw insErr;
      const { data: g, error: getErr } = await supabase.from("goals").select("current_value").eq("id", goal_id).single();
      if (getErr) throw getErr;
      const current = Number((g?.current_value as number | null) ?? 0);
      const { error: updErr } = await supabase.from("goals").update({ current_value: current + value, updated_at: new Date().toISOString() }).eq("id", goal_id);
      if (updErr) throw updErr;
      return true;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["goal_progress", vars.goal_id] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

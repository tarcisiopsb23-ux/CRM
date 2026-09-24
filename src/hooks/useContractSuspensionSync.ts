import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useContractSuspensionSync(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

  return useMutation({
    mutationFn: async (input?: { overdueDays?: number }) => {
      if (!organizationId) throw new Error("Sem organização");
      const overdueDays = input?.overdueDays ?? 30;
      const { data, error } = await supabaseUntyped.rpc("sync_contract_suspensions", {
        p_org_id: organizationId,
        p_overdue_days: overdueDays,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts", "metrics", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", "metrics", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
  });
}

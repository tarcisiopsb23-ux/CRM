import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SubscriptionStatus } from "@/lib/crmModules";

export interface CrmClientPlan {
  id: string;
  organization_id: string;
  client_id: string;
  plan_value: number;
  plan_name: string;
  modules: string[];
  max_users: number;
  due_day: number;
  subscription_status: SubscriptionStatus;
  blocked_reason: string | null;
  contract_start: string | null;
  contract_end: string | null;
  suspended_at: string | null;
  primary_user_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCrmClientPlan(clientId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["crm_client_plans", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("crm_client_plans")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as CrmClientPlan | null;
    },
    enabled: !!clientId,
  });

  const upsertPlan = useMutation({
    mutationFn: async (input: {
      organization_id: string;
      client_id: string;
      plan_value: number;
      modules: string[];
      max_users: number;
      due_day: number;
      subscription_status?: SubscriptionStatus;
    }) => {
      const { data, error } = await supabase
        .from("crm_client_plans")
        .upsert(input, { onConflict: "client_id" })
        .select()
        .single();
      if (error) throw error;
      return data as CrmClientPlan;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_client_plans", clientId] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      planId,
      status,
    }: {
      planId: string;
      status: SubscriptionStatus;
    }) => {
      const { data, error } = await supabase
        .from("crm_client_plans")
        .update({ subscription_status: status })
        .eq("id", planId)
        .select()
        .single();
      if (error) throw error;

      // Revogar sessões ativas quando bloqueado
      if (status === "bloqueado" && clientId) {
        await supabase
          .from("crm_sessions")
          .update({ revoked: true })
          .eq("client_id", clientId);
      }

      return data as CrmClientPlan;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_client_plans", clientId] }),
  });

  return { ...query, upsertPlan, updateStatus };
}

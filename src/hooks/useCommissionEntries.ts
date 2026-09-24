import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CommissionEntry, CommissionEntrySale } from "@/types/commission";

export function useCommissionEntries(profileId: string | undefined) {
  return useQuery({
    queryKey: ["commission_entries", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("commission_entries")
        .select("*")
        .eq("profile_id", profileId)
        .order("month_reference", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommissionEntry[];
    },
    enabled: !!profileId,
  });
}

export function useCommissionEntrySales(commissionEntryId: string | undefined) {
  return useQuery({
    queryKey: ["commission_entry_sales", commissionEntryId],
    queryFn: async () => {
      if (!commissionEntryId) return [];
      const { data, error } = await supabase
        .from("commission_entry_sales")
        .select("*")
        .eq("commission_entry_id", commissionEntryId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommissionEntrySale[];
    },
    enabled: !!commissionEntryId,
  });
}

interface CreateManualBonusPayload {
  organization_id: string;
  profile_id: string;
  month_reference: string;
  bonus_value: number;
  notes?: string | null;
}

export function useCreateManualBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateManualBonusPayload) => {
      const { data, error } = await supabase
        .from("commission_entries")
        .insert({
          ...payload,
          entry_type: "manual" as const,
          commission_value: 0,
          status: "pending" as const,
          total_sales_value: 0,
          contracts_count: 0,
          commission_rate: 0,
          bonus_rate: 0,
          is_board_member: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CommissionEntry;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["commission_entries", variables.profile_id] });
    },
  });
}

interface UpdateCommissionStatusPayload {
  id: string;
  status: CommissionEntry["status"];
}

export function useUpdateCommissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: UpdateCommissionStatusPayload) => {
      const { data, error } = await supabase
        .from("commission_entries")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as CommissionEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission_entries"] });
    },
  });
}

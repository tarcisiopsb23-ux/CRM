import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayrollStatus = "pending" | "paid";

export interface PayrollEntry {
  id: string;
  organization_id: string;
  profile_id: string;
  reference_date: string;
  payment_date: string | null;
  base_salary: number;
  commission: number;
  bonus: number;
  overtime: number;
  discounts: number;
  total_value: number;
  status: PayrollStatus;
  profiles?: { full_name: string };
}

export type PayrollUpsertInput = {
  organization_id: string;
  profile_id: string;
  reference_date: string;
  payment_date: string | null;
  base_salary: number;
  commission: number;
  bonus: number;
  overtime: number;
  discounts: number;
  // total_value is computed on the database as a generated column
  status: PayrollStatus;
};

export function usePayrolls(organizationId: string | undefined) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useQuery({
    queryKey: ["payrolls", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabaseUntyped
        .from("payrolls")
        .select("*, profiles(full_name)")
        .eq("organization_id", organizationId)
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PayrollEntry[];
    },
    enabled: !!organizationId,
  });
}

export function usePayrollsByProfile(organizationId: string | undefined, profileId: string | undefined) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useQuery({
    queryKey: ["payrolls", organizationId, "profile", profileId],
    queryFn: async () => {
      if (!organizationId || !profileId) return [];
      const { data, error } = await supabaseUntyped
        .from("payrolls")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("profile_id", profileId)
        .order("reference_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        reference_date: String(r.reference_date),
        payment_date: (r.payment_date as string | null) ?? null,
        base_salary: typeof r.base_salary === "number" ? r.base_salary : Number(r.base_salary ?? 0),
        commission: typeof r.commission === "number" ? r.commission : Number(r.commission ?? 0),
        bonus: typeof r.bonus === "number" ? r.bonus : Number(r.bonus ?? 0),
        overtime: typeof r.overtime === "number" ? r.overtime : Number(r.overtime ?? 0),
        discounts: typeof r.discounts === "number" ? r.discounts : Number(r.discounts ?? 0),
        total_value: typeof r.total_value === "number" ? r.total_value : Number(r.total_value ?? 0),
        status: (r.status as PayrollStatus | null) ?? "pending",
      }));
    },
    enabled: !!organizationId && !!profileId,
  });
}

export function useCreatePayroll(organizationId: string | undefined) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PayrollUpsertInput) => {
      const { data, error } = await supabaseUntyped.from("payrolls").insert(payload).select("id").single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payrolls", organizationId] }),
  });
}

export function useUpdatePayroll(organizationId: string | undefined) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: PayrollUpsertInput }) => {
      const { error } = await supabaseUntyped.from("payrolls").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payrolls", organizationId] }),
  });
}

export function useDeletePayroll(organizationId: string | undefined) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseUntyped.from("payrolls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payrolls", organizationId] }),
  });
}

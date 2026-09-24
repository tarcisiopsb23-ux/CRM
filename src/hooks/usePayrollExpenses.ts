import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Database } from "@/types/supabase";

type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export interface PayrollExpense {
  id: string;
  organization_id: string;
  reference_date: string;
  base_salary: number;
  commission: number;
  bonus: number;
  overtime: number;
  discounts: number;
  total_value: number;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export function usePayrollExpenses(organizationId: string | undefined, options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: ["payroll_expenses", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("payroll_expenses")
        .select("*")
        .eq("organization_id", organizationId)
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollExpense[];
    },
    enabled: !!organizationId && enabled,
  });

  const registerPayment = useMutation({
    mutationFn: async (expenseId: string) => {
      const { data, error } = await supabase
        .from("payroll_expenses")
        .update({ status: "pago", paid_at: new Date().toISOString() })
        .eq("id", expenseId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_expenses", organizationId] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PaymentStatus }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "pago") updates.paid_at = new Date().toISOString();
      else updates.paid_at = null;
      const { data, error } = await supabase
        .from("payroll_expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_expenses", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_expenses", organizationId] }),
  });

  const updatePayrollExpense = useMutation({
    mutationFn: async ({
      id,
      base_salary,
      commission,
      bonus,
      overtime,
      discounts,
      status,
      paid_at,
    }: {
      id: string;
      base_salary?: number;
      commission?: number;
      bonus?: number;
      overtime?: number;
      discounts?: number;
      status?: PaymentStatus;
      paid_at?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (base_salary !== undefined) updates.base_salary = base_salary;
      if (commission !== undefined) updates.commission = commission;
      if (bonus !== undefined) updates.bonus = bonus;
      if (overtime !== undefined) updates.overtime = overtime;
      if (discounts !== undefined) updates.discounts = discounts;
      if (status !== undefined) {
        updates.status = status;
        if (status !== "pago") updates.paid_at = null;
      }
      if (paid_at !== undefined) updates.paid_at = paid_at;
      
      const { data, error } = await supabase
        .from("payroll_expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_expenses", organizationId] }),
  });

  return { ...query, registerPayment, updateStatus, updatePayrollExpense, remove };
}

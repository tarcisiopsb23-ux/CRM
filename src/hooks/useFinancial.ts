import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Payment, SupplierExpense } from "@/types/crm";

export function usePayments(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["payments", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*, clients(name, company)")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as (Payment & { clients?: { name: string; company: string } | null })[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: {
      client_id: string;
      contract_id?: string;
      description: string;
      value: number;
      due_date: string;
    }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { data, error } = await supabase
        .from("payments")
        .insert({
          organization_id: organizationId,
          client_id: input.client_id,
          contract_id: input.contract_id || null,
          description: input.description,
          value: input.value,
          due_date: input.due_date,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", organizationId] }),
  });

  const registerPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase
        .from("payments")
        .update({ status: "pago", paid_at: new Date().toISOString() })
        .eq("id", paymentId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", organizationId] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "pago") updates.paid_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("payments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", organizationId] }),
  });

  return { ...query, create, registerPayment, updateStatus };
}

export function useSupplierExpenses(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["supplier_expenses", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("supplier_expenses")
        .select("*, suppliers(name)")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as (SupplierExpense & { suppliers?: { name: string } | null })[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: {
      supplier_id: string;
      description: string;
      value: number;
      due_date: string;
    }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { data, error } = await supabase
        .from("supplier_expenses")
        .insert({
          organization_id: organizationId,
          supplier_id: input.supplier_id,
          description: input.description,
          value: input.value,
          due_date: input.due_date,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier_expenses", organizationId] }),
  });

  const registerPayment = useMutation({
    mutationFn: async (expenseId: string) => {
      const { data, error } = await supabase
        .from("supplier_expenses")
        .update({ status: "pago", paid_at: new Date().toISOString() })
        .eq("id", expenseId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier_expenses", organizationId] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "pago") updates.paid_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("supplier_expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier_expenses", organizationId] }),
  });

  return { ...query, create, registerPayment, updateStatus };
}

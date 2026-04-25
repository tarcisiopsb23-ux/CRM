import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import { dispatchWebhook } from "@/lib/webhookDispatcher";
import type { Payment, SupplierExpense } from "@/types/crm";
import type { Database } from "@/types/supabase";

type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export function usePayments(organizationId: string | undefined, options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;

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
      return (data ?? []) as (Payment & { clients?: { name: string; company?: string | null } | null })[];
    },
    enabled: !!organizationId && enabled,
  });

  const create = useMutation({
    mutationFn: async (input: {
      client_id: string;
      contract_id?: string;
      description: string;
      value: number;
      due_date: string;
      status?: PaymentStatus;
      paid_at?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      if (!organizationId) throw new Error("Sem organização");
      let status: PaymentStatus | undefined = input.status;
      let paid_at: string | null | undefined = input.paid_at;

      if (input.contract_id) {
        const { data: existing, error: queryErr } = await supabase
          .from("payments")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("contract_id", input.contract_id)
          .limit(1);
        if (queryErr) throw queryErr;
        if ((existing ?? []).length === 0) {
          status = "pago";
          paid_at = new Date().toISOString();
        }
      }

      const payload: Database["public"]["Tables"]["payments"]["Insert"] = {
        organization_id: organizationId,
        client_id: input.client_id,
        contract_id: input.contract_id ?? null,
        description: input.description,
        value: input.value,
        due_date: input.due_date,
        status,
        paid_at,
        metadata: input.metadata ? toJson(input.metadata) : undefined,
      };

      const { data, error } = await supabase
        .from("payments")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      // Cria invoice pendente automaticamente para o lançamento
      // O usuário poderá emitir a NFS-e a partir da aba Pendentes
      try {
        const { data: clientData } = await supabase
          .from("clients")
          .select("id, name, company, document, email")
          .eq("id", input.client_id)
          .single();

        if (clientData) {
          const d = new Date(input.due_date);
          const competencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          await supabase.from("invoices").insert({
            organization_id: organizationId,
            client_id:        input.client_id,
            contract_id:      input.contract_id ?? null,
            payment_id:       data.id,
            type:             "nfse",
            status:           "pendente",
            valor_servico:    input.value,
            competencia,
            due_date:         input.due_date, // data de vencimento do débito
            tomador_nome:     clientData.company || clientData.name,
            tomador_cnpj_cpf: clientData.document,
            tomador_email:    clientData.email,
            tomador_endereco: {},
          });
        }
      } catch (invoiceErr) {
        // best-effort — não reverte o lançamento
        console.warn("[useFinancial] Falha ao criar invoice pendente:", invoiceErr);
      }

      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
      qc.invalidateQueries({ queryKey: ["invoices", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "payment.created", data);
    },
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
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "payment.paid", data);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PaymentStatus }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "pago") updates.paid_at = new Date().toISOString();
      else updates.paid_at = null;
      const { data, error } = await supabase
        .from("payments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "payment.status_changed", data);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", organizationId] }),
  });

  const updatePayment = useMutation({
    mutationFn: async ({
      id,
      description,
      value,
      due_date,
      status,
      paid_at,
      metadata,
    }: {
      id: string;
      description?: string;
      value?: number;
      due_date?: string;
      status?: PaymentStatus;
      paid_at?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      const updates: Record<string, unknown> = {};
      if (description !== undefined) updates.description = description;
      if (value !== undefined) updates.value = value;
      if (due_date !== undefined) updates.due_date = due_date;
      if (status !== undefined) {
        updates.status = status;
        if (status !== "pago") updates.paid_at = null;
      }
      if (paid_at !== undefined) updates.paid_at = paid_at;
      if (metadata !== undefined) updates.metadata = toJson(metadata);
      const { data, error } = await supabase.from("payments").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
  });

  return { ...query, create, registerPayment, updateStatus, updatePayment, remove };
}

export function useSupplierExpenses(organizationId: string | undefined, options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;

  const query = useQuery({
    queryKey: ["supplier_expenses", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("supplier_expenses")
        .select("*, suppliers(name, service_category)")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as (SupplierExpense & { suppliers?: { name: string; service_category?: string | null } | null })[];
    },
    enabled: !!organizationId && enabled,
  });

  const create = useMutation({
    mutationFn: async (input: {
      supplier_id: string;
      description: string;
      value: number;
      due_date: string;
      status?: PaymentStatus;
      paid_at?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      if (!organizationId) throw new Error("Sem organização");
      const payload: Database["public"]["Tables"]["supplier_expenses"]["Insert"] = {
        organization_id: organizationId,
        supplier_id: input.supplier_id,
        description: input.description,
        value: input.value,
        due_date: input.due_date,
        status: input.status,
        paid_at: input.paid_at,
        metadata: input.metadata ? toJson(input.metadata) : undefined,
      };

      const { data, error } = await supabase
        .from("supplier_expenses")
        .insert(payload)
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
    mutationFn: async ({ id, status }: { id: string; status: PaymentStatus }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "pago") updates.paid_at = new Date().toISOString();
      else updates.paid_at = null;
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supplier_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier_expenses", organizationId] }),
  });

  const updateExpense = useMutation({
    mutationFn: async ({
      id,
      description,
      value,
      due_date,
      status,
      paid_at,
      metadata,
    }: {
      id: string;
      description?: string;
      value?: number;
      due_date?: string;
      status?: PaymentStatus;
      paid_at?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      const updates: Record<string, unknown> = {};
      if (description !== undefined) updates.description = description;
      if (value !== undefined) updates.value = value;
      if (due_date !== undefined) updates.due_date = due_date;
      if (status !== undefined) {
        updates.status = status;
        if (status !== "pago") updates.paid_at = null;
      }
      if (paid_at !== undefined) updates.paid_at = paid_at;
      if (metadata !== undefined) updates.metadata = toJson(metadata);
      const { data, error } = await supabase.from("supplier_expenses").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier_expenses", organizationId] }),
  });

  return { ...query, create, registerPayment, updateStatus, updateExpense, remove };
}

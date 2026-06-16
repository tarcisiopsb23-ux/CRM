import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import { dispatchWebhook } from "@/lib/webhookDispatcher";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { addMonths, format } from "date-fns";

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type ContractTypeEnum = Database["public"]["Enums"]["contract_type_enum"];

export type ContractRow = {
  id: string;
  organization_id: string;
  client_id: string;
  responsible_id: string | null;
  title: string;
  description: string | null;
  value: number;
  status: ContractStatus | null;
  start_date: string;
  end_date: string | null;
  billing_cycle: string | null;
  service_contracted: string | null;
  contract_type: ContractTypeEnum | null;
  periodicity: Database["public"]["Enums"]["payment_periodicity"] | null;
  contract_date: string | null;
  duration_months: number | null;
  first_payment_value: number | null;
  first_payment_due_date: string | null;
  first_payment_method: string | null;
  first_payment_installments: number | null;
  first_payment_fees: number | null;
  first_payment_split: boolean | null;
  first_payment_second_due_date: string | null;
  recurring_due_date: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  ended_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  is_dashboard_reference: boolean | null;
  is_signed: boolean | null;
  signed_at: string | null;
  generated_at: string | null;
  template_id: string | null;
  min_duration_months: number | null;
};

const toIsoDate = (d: Date) => format(d, "yyyy-MM-dd");

const asContractStatus = (s: string | null | undefined): ContractStatus | null => {
  const v = (s ?? null) as ContractStatus | null;
  return v;
};

export function useContractsByClient(organizationId: string | undefined, clientId: string | undefined) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useQuery({
    queryKey: ["contracts", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabaseUntyped
        .from("contracts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        organization_id: String(r.organization_id),
        client_id: String(r.client_id),
        responsible_id: (r.responsible_id as string | null) ?? null,
        title: String(r.title ?? ""),
        description: (r.description as string | null) ?? null,
        value: Number(r.value ?? 0),
        status: asContractStatus((r.status as string | null) ?? null),
        start_date: String(r.start_date),
        end_date: (r.end_date as string | null) ?? null,
        billing_cycle: (r.billing_cycle as string | null) ?? null,
        service_contracted: (r.service_contracted as string | null) ?? null,
        contract_type: (r.contract_type as ContractTypeEnum | null) ?? null,
        periodicity: (r.periodicity as ContractRow["periodicity"]) ?? null,
        contract_date: (r.contract_date as string | null) ?? null,
        duration_months: typeof r.duration_months === "number" ? r.duration_months : (r.duration_months ? Number(r.duration_months) : null),
        first_payment_value: typeof r.first_payment_value === "number" ? r.first_payment_value : (r.first_payment_value ? Number(r.first_payment_value) : null),
        first_payment_due_date: (r.first_payment_due_date as string | null) ?? null,
        first_payment_method: (r.first_payment_method as string | null) ?? null,
        first_payment_installments: typeof r.first_payment_installments === "number" ? r.first_payment_installments : (r.first_payment_installments ? Number(r.first_payment_installments) : null),
        first_payment_fees: typeof r.first_payment_fees === "number" ? r.first_payment_fees : (r.first_payment_fees ? Number(r.first_payment_fees) : null),
        first_payment_split: (r.first_payment_split as boolean | null) ?? null,
        first_payment_second_due_date: (r.first_payment_second_due_date as string | null) ?? null,
        recurring_due_date: (r.recurring_due_date as string | null) ?? null,
        ended_at: (r.ended_at as string | null) ?? null,
        ended_reason: (r.ended_reason as string | null) ?? null,
        ended_by: (r.ended_by as string | null) ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        created_at: (r.created_at as string | null) ?? null,
        updated_at: (r.updated_at as string | null) ?? null,
        is_dashboard_reference: (r.is_dashboard_reference as boolean | null) ?? false,
        is_signed: (r.is_signed as boolean | null) ?? false,
        signed_at: (r.signed_at as string | null) ?? null,
        generated_at: (r.generated_at as string | null) ?? null,
        template_id: (r.template_id as string | null) ?? null,
      })) as ContractRow[];
    },
    enabled: !!organizationId && !!clientId,
  });
}

export function useCreateContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      title: string;
      service_contracted?: string | null;
      contract_date: string;
      duration_months: number;
      first_payment_value: number;
      first_payment_method: string;
      first_payment_due_date: string;
      first_payment_installments?: number;
      first_payment_fees?: number;
      recurring_value: number;
      recurring_due_date: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!organizationId) throw new Error("Sem organização");

      // Lê o contract_type do metadata para determinar periodicity e comportamento
      const contractType = (input.metadata?.contract_type as string) ?? "mensal";
      const isEventual = contractType === "eventual";

      const start = new Date(input.contract_date);
      const end = addMonths(start, Math.max(0, Number(input.duration_months ?? 0)));

      const installmentsRaw = Number(input.first_payment_installments ?? 1);
      const installments = Math.min(12, Math.max(1, Number.isFinite(installmentsRaw) ? installmentsRaw : 1));
      const fees = installments > 1 ? Math.max(0, Number(input.first_payment_fees ?? 0)) : 0;

      const contractPayload: Record<string, unknown> = {
        organization_id: organizationId,
        client_id: input.client_id,
        title: input.title,
        status: "ativo" as ContractStatus,
        start_date: input.contract_date,
        contract_date: input.contract_date,
        end_date: toIsoDate(end),
        service_contracted: input.service_contracted ?? null,
        contract_type: contractType,
        periodicity: isEventual ? "pagamento_unico" : "mensal",
        value: input.recurring_value,
        duration_months: input.duration_months,
        first_payment_value: input.first_payment_value,
        first_payment_method: input.first_payment_method,
        first_payment_due_date: input.first_payment_due_date,
        first_payment_installments: installments,
        first_payment_fees: fees,
        first_payment_split: false,
        first_payment_second_due_date: null,
        recurring_due_date: input.recurring_due_date,
        ...(input.metadata ? { metadata: toJson(input.metadata) } : {}),
      };

      const { data: contract, error: contractError } = await supabaseUntyped
        .from("contracts")
        .insert(contractPayload)
        .select("*")
        .single();
      if (contractError) throw contractError;

      const contractId = String((contract as Record<string, unknown>).id);
      const clientId = input.client_id;

      const payments: Database["public"]["Tables"]["payments"]["Insert"][] = [];
      const baseMeta = toJson({ source: "contract_create", contract_id: contractId }) ?? null;
      const firstBase = Number(input.first_payment_value ?? 0);
      const installmentValue = installments > 1 ? (firstBase + fees) / installments : firstBase;
      const baseDue = new Date(input.first_payment_due_date || input.contract_date);
      for (let i = 0; i < installments; i++) {
        payments.push({
          organization_id: organizationId,
          contract_id: contractId,
          client_id: clientId,
          description: installments > 1 ? `Contrato • ${input.title} • ${i + 1}/${installments}` : `Contrato • ${input.title} • Inicial`,
          value: installmentValue,
          due_date: toIsoDate(addMonths(baseDue, i)),
          status: "pendente" as PaymentStatus,
          payment_method: input.first_payment_method,
          metadata: baseMeta,
        });
      }

      const duration = Math.max(0, Number(input.duration_months ?? 0));
      const recurringCount = Math.max(0, duration - 1);
      const recurringBaseDue = new Date(input.recurring_due_date || input.contract_date);
      for (let i = 0; i < recurringCount; i++) {
        payments.push({
          organization_id: organizationId,
          contract_id: contractId,
          client_id: clientId,
          description: `Contrato • ${input.title}`,
          value: Number(input.recurring_value),
          due_date: toIsoDate(addMonths(recurringBaseDue, i)),
          status: "pendente" as PaymentStatus,
          metadata: baseMeta,
        });
      }

      const { error: payErr } = await supabase.from("payments").insert(payments);
      if (payErr) throw payErr;

      return contract as unknown as ContractRow;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, c.client_id] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "contract.created", c);
    },
  });
}

export function useUpdateContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useMutation({
    mutationFn: async (input: Partial<ContractRow> & { id: string; client_id: string }) => {
      const { id, client_id, ...rest } = input;

      // ── 1. Atualiza o contrato ────────────────────────────────────────────
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) payload[k] = v;
      }
      if (payload.metadata !== undefined) payload.metadata = toJson(payload.metadata as Record<string, unknown>);
      const { data, error } = await supabaseUntyped.from("contracts").update(payload).eq("id", id).select("*").single();
      if (error) throw error;
      const updated = data as unknown as ContractRow;

      // ── 2. Sincroniza pagamentos futuros pendentes ────────────────────────
      // Determina o tipo do contrato a partir do campo ou do metadata
      const contractType = (updated.contract_type as string)
        ?? ((updated.metadata as Record<string, unknown> | null)?.contract_type as string)
        ?? "mensal";
      const isEventual = contractType === "eventual";

      const today = toIsoDate(new Date());

      // Cancela todos os pagamentos futuros pendentes vinculados a este contrato
      const { error: cancelErr } = await supabase
        .from("payments")
        .update({ status: "cancelado" as PaymentStatus })
        .eq("contract_id", id)
        .gt("due_date", today)
        .neq("status", "pago");
      if (cancelErr) throw cancelErr;

      // Recria os pagamentos futuros com base nos novos dados do contrato
      if (!isEventual && organizationId) {
        const recurringValue = Number(updated.value ?? 0);
        const recurringDue = updated.recurring_due_date ?? updated.contract_date ?? today;
        const duration = Math.max(0, Number(updated.duration_months ?? 0));
        const title = updated.title ?? "Contrato";
        const baseMeta = toJson({ source: "contract_update", contract_id: id }) ?? null;

        // Gera parcelas mensais a partir de hoje (não recria parcelas já vencidas)
        const newPayments: Database["public"]["Tables"]["payments"]["Insert"][] = [];
        const baseDate = new Date(recurringDue);

        for (let i = 0; i < duration; i++) {
          const dueDate = toIsoDate(addMonths(baseDate, i));
          // Só cria parcelas futuras (após hoje)
          if (dueDate <= today) continue;
          newPayments.push({
            organization_id: organizationId!,
            contract_id: id,
            client_id,
            description: `Contrato • ${title}`,
            value: recurringValue,
            due_date: dueDate,
            status: "pendente" as PaymentStatus,
            metadata: baseMeta,
          });
        }

        if (newPayments.length > 0) {
          const { error: insertErr } = await supabase.from("payments").insert(newPayments);
          if (insertErr) throw insertErr;
        }
      }
      // Se eventual: apenas cancela os futuros (já feito acima), sem recriar

      return updated;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
      qc.invalidateQueries({ queryKey: ["contracts_with_c8", organizationId, vars.client_id] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
  });
}

export function useSuspendContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  return useMutation({
    mutationFn: async (input: { id: string; client_id: string; reason: string }) => {
      if (!input.reason?.trim()) {
        throw new Error("O motivo da suspensão é obrigatório.");
      }

      const { data: current, error: curErr } = await supabaseUntyped
        .from("contracts")
        .select("metadata")
        .eq("id", input.id)
        .single();
      if (curErr) throw curErr;

      const currentMeta = ((current as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
      const nextMeta = {
        ...currentMeta,
        suspended_at: new Date().toISOString(),
        suspended_reason: input.reason.trim(),
      };

      const { error } = await supabaseUntyped
        .from("contracts")
        .update({ status: "suspenso" as ContractStatus, metadata: toJson(nextMeta) })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
      qc.invalidateQueries({ queryKey: ["contracts", "metrics", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", "metrics", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "contract.suspended", { id: vars.id, client_id: vars.client_id });
    },
  });
}

export function useReactivateContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  return useMutation({
    mutationFn: async (input: { id: string; client_id: string }) => {
      const { data: current, error: curErr } = await supabaseUntyped
        .from("contracts")
        .select("metadata")
        .eq("id", input.id)
        .single();
      if (curErr) throw curErr;

      const currentMeta = ((current as { metadata?: unknown }).metadata ?? {}) as Record<string, unknown>;
      const nextMeta = { ...currentMeta, reactivated_at: new Date().toISOString() };

      const { error } = await supabaseUntyped
        .from("contracts")
        .update({ status: "ativo" as ContractStatus, metadata: toJson(nextMeta) })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
      qc.invalidateQueries({ queryKey: ["contracts", "metrics", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", "metrics", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "contract.reactivated", { id: vars.id, client_id: vars.client_id });
    },
  });
}

export function useEndContract(organizationId: string | undefined, profileId: string | null | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useMutation({
    mutationFn: async (input: { id: string; client_id: string; reason: string }) => {
      const today = toIsoDate(new Date());
      const endedAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        status: "encerrado" as ContractStatus,
        end_date: today,
        ended_at: endedAt,
        ended_reason: input.reason,
        ...(profileId ? { ended_by: profileId } : {}),
      };
      const { error } = await supabaseUntyped.from("contracts").update(payload).eq("id", input.id);
      if (error) throw error;

      const { error: updPayErr } = await supabase
        .from("payments")
        .update({ status: "cancelado" as PaymentStatus })
        .eq("contract_id", input.id)
        .gt("due_date", today)
        .neq("status", "pago");
      if (updPayErr) throw updPayErr;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
      if (organizationId) dispatchWebhook(organizationId, "contract.ended", { id: vars.id, client_id: vars.client_id });
    },
  });
}

export function useDeleteContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useMutation({
    mutationFn: async (input: { id: string; client_id: string }) => {
      const { error: delPayErr } = await supabase.from("payments").delete().eq("contract_id", input.id);
      if (delPayErr) throw delPayErr;
      const { error: delContractErr } = await supabaseUntyped.from("contracts").delete().eq("id", input.id);
      if (delContractErr) throw delContractErr;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
  });
}

/** Define qual contrato é a referência de data para o dashboard público.
 *  Garante que apenas 1 contrato por cliente tenha is_dashboard_reference = true.
 *  Se outro contrato já estiver marcado, desmarca antes de marcar o novo.
 */
export function useGenerateContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useMutation({
    mutationFn: async ({ id, client_id, template_id }: { id: string; client_id: string; template_id?: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { error } = await supabaseUntyped
        .from("contracts")
        .update({ generated_at: new Date().toISOString(), template_id: template_id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
    },
  });
}

export function useSignContract(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useMutation({
    mutationFn: async ({ id, client_id }: { id: string; client_id: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { error } = await supabaseUntyped
        .from("contracts")
        .update({ is_signed: true, signed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_c, vars) => {
      qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.client_id] });
    },
  });
}

/** Define qual contrato é a referência de data para o dashboard público.
 *  Garante que apenas 1 contrato por cliente tenha is_dashboard_reference = true.
 *  Se outro contrato já estiver marcado, desmarca antes de marcar o novo.
 */
export function useSetDashboardReference(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;
  return useMutation({
    mutationFn: async ({ contractId, clientId, value }: { contractId: string; clientId: string; value: boolean }) => {
      // Se ativando, desmarca qualquer outro contrato do mesmo cliente primeiro
      if (value) {
        await supabaseUntyped
          .from("contracts")
          .update({ is_dashboard_reference: false })
          .eq("client_id", clientId)
          .neq("id", contractId);
      }
      const { error } = await supabaseUntyped
        .from("contracts")
        .update({ is_dashboard_reference: value })
        .eq("id", contractId);
      if (error) throw error;
    },
    onSuccess: (_c, vars) => qc.invalidateQueries({ queryKey: ["contracts", organizationId, vars.clientId] }),
  });
}

/**
 * useContractsWithC8 — combines regular contracts with the C8 Control plan
 * for a given client, so the Clients module contracts tab shows both.
 */
export function useContractsWithC8(
  organizationId: string | undefined,
  clientId: string | undefined
) {
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  return useQuery({
    queryKey: ["contracts_with_c8", organizationId, clientId],
    queryFn: async (): Promise<ContractRow[]> => {
      if (!organizationId || !clientId) return [];

      // 1. Regular contracts
      const { data: contractsData, error: contractsError } = await supabaseUntyped
        .from("contracts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("start_date", { ascending: false });
      if (contractsError) throw contractsError;

      const contracts: ContractRow[] = ((contractsData ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        organization_id: String(r.organization_id),
        client_id: String(r.client_id),
        responsible_id: (r.responsible_id as string | null) ?? null,
        title: String(r.title ?? ""),
        description: (r.description as string | null) ?? null,
        value: Number(r.value ?? 0),
        status: asContractStatus((r.status as string | null) ?? null),
        start_date: String(r.start_date),
        end_date: (r.end_date as string | null) ?? null,
        billing_cycle: (r.billing_cycle as string | null) ?? null,
        service_contracted: (r.service_contracted as string | null) ?? null,
        contract_type: (r.contract_type as ContractTypeEnum | null) ?? null,
        periodicity: (r.periodicity as ContractRow["periodicity"]) ?? null,
        contract_date: (r.contract_date as string | null) ?? null,
        duration_months: r.duration_months ? Number(r.duration_months) : null,
        first_payment_value: r.first_payment_value ? Number(r.first_payment_value) : null,
        first_payment_due_date: (r.first_payment_due_date as string | null) ?? null,
        first_payment_method: (r.first_payment_method as string | null) ?? null,
        first_payment_installments: r.first_payment_installments ? Number(r.first_payment_installments) : null,
        first_payment_fees: r.first_payment_fees ? Number(r.first_payment_fees) : null,
        first_payment_split: (r.first_payment_split as boolean | null) ?? null,
        first_payment_second_due_date: (r.first_payment_second_due_date as string | null) ?? null,
        recurring_due_date: (r.recurring_due_date as string | null) ?? null,
        ended_at: (r.ended_at as string | null) ?? null,
        ended_reason: (r.ended_reason as string | null) ?? null,
        ended_by: (r.ended_by as string | null) ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        created_at: (r.created_at as string | null) ?? null,
        updated_at: (r.updated_at as string | null) ?? null,
        is_dashboard_reference: (r.is_dashboard_reference as boolean | null) ?? false,
        is_signed: (r.is_signed as boolean | null) ?? false,
        signed_at: (r.signed_at as string | null) ?? null,
        generated_at: (r.generated_at as string | null) ?? null,
        template_id: (r.template_id as string | null) ?? null,
      }));

      // 2. C8 Control plan — only if not already covered by a contract
      const hasC8Contract = contracts.some(
        (c) => c.service_contracted === "C8 Control CRM"
      );

      if (!hasC8Contract) {
        const { data: plan } = await supabaseUntyped
          .from("crm_client_plans")
          .select("*")
          .eq("client_id", clientId)
          .maybeSingle();

        if (plan) {
          const p = plan as Record<string, unknown>;
          const statusMap: Record<string, ContractStatus> = {
            ativo: "ativo",
            suspenso: "suspenso",
            bloqueado: "suspenso",
            cancelado: "encerrado",
          };

          const planValue = Number(p.plan_value ?? 0);
          const contractStart = (p.contract_start as string) ?? null;
          const contractEnd = (p.contract_end as string) ?? null;

          // Calculate duration in months from start/end dates
          const durationMonths = contractStart && contractEnd
            ? Math.max(1, Math.round(
                (new Date(contractEnd).getTime() - new Date(contractStart).getTime()) /
                (1000 * 60 * 60 * 24 * 30.44)
              ))
            : null;

          // Total value = monthly value × duration (for the total column)
          const totalValue = durationMonths ? planValue * durationMonths : planValue;

          const c8Contract: ContractRow = {
            id: `c8_${clientId}`,
            organization_id: organizationId,
            client_id: clientId,
            responsible_id: null,
            title: `C8 Control CRM — ${p.plan_name ?? "Starter"}`,
            description: (p.notes as string | null) ?? null,
            value: totalValue,
            status: statusMap[(p.subscription_status as string) ?? "ativo"] ?? "ativo",
            start_date: contractStart ?? toIsoDate(new Date()),
            end_date: contractEnd,
            billing_cycle: "mensal",
            service_contracted: "C8 Control CRM",
            contract_type: "mensal" as ContractTypeEnum,
            periodicity: "mensal",
            contract_date: contractStart,
            duration_months: durationMonths,
            first_payment_value: planValue,
            first_payment_due_date: contractStart,
            first_payment_method: "boleto",
            first_payment_installments: 1,
            first_payment_fees: 0,
            first_payment_split: false,
            first_payment_second_due_date: null,
            recurring_due_date: null,
            ended_at: null,
            ended_reason: null,
            ended_by: null,
            metadata: { source: "c8_control", plan_name: p.plan_name, max_users: p.max_users, monthly_value: planValue },
            created_at: null,
            updated_at: null,
            is_dashboard_reference: false,
          };
          contracts.push(c8Contract);
        }
      }

      return contracts;
    },
    enabled: !!organizationId && !!clientId,
  });
}

/**
 * useContractAmendments
 *
 * Gerencia aditivos contratuais para contratos assinados (is_signed = true).
 *
 * Operações:
 *   - Listar aditivos por contrato
 *   - Criar aditivo (qualquer tipo)
 *   - Aplicar aditivo de renovação: estende prazo + gera novos pagamentos
 *   - Aplicar aditivo de reajuste: atualiza valor recorrente + regenera pendentes
 *   - Marcar aditivo como assinado
 *   - Cancelar aditivo
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addMonths, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { generatePayments, type EvolutiveEntry } from "@/lib/contracts/generatePayments";
import type { ContractRow } from "@/hooks/useContracts";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type AmendmentType = "renovacao" | "reajuste" | "prazo" | "escopo" | "outro";
export type AmendmentStatus = "rascunho" | "pendente_assinatura" | "assinado" | "cancelado";

export interface ContractAmendment {
  id: string;
  contract_id: string;
  organization_id: string;
  client_id: string;
  amendment_type: AmendmentType;
  amendment_number: number;
  reason: string;
  additional_months: number | null;
  new_end_date: string | null;
  new_duration_months: number | null;
  previous_value: number | null;
  new_value: number | null;
  value_effective_date: string | null;
  document_content: string | null;
  pdf_url: string | null;
  status: AmendmentStatus;
  signed_at: string | null;
  previous_snapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAmendmentInput {
  contract_id: string;
  client_id: string;
  amendment_type: AmendmentType;
  reason: string;
  // Renovação / extensão de prazo
  additional_months?: number;
  // Reajuste de valor
  new_value?: number;
  value_effective_date?: string;
  // Snapshot do contrato antes da alteração (para auditoria)
  previous_snapshot?: Record<string, unknown>;
  // Dados extras (ex: novo schedule evolutivo)
  metadata?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Busca o próximo número de aditivo para um contrato */
async function nextAmendmentNumber(contractId: string): Promise<number> {
  const { data } = await supabase
    .from("contract_amendments")
    .select("amendment_number")
    .eq("contract_id", contractId)
    .order("amendment_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { amendment_number: number } | null)?.amendment_number ?? 0) + 1;
}

/** Calcula a data do último lançamento pendente/pago de um contrato */
async function lastPaymentDueDate(contractId: string): Promise<string | null> {
  const { data } = await supabase
    .from("payments")
    .select("due_date")
    .eq("contract_id", contractId)
    .not("status", "eq", "cancelado")
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { due_date: string } | null)?.due_date ?? null;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useContractAmendments(contractId: string | undefined) {
  const organizationId = useOrganization();
  const qc = useQueryClient();
  const queryKey = ["contract_amendments", organizationId, contractId];

  // ── Listar aditivos ────────────────────────────────────────────────────────
  const query = useQuery<ContractAmendment[]>({
    queryKey,
    queryFn: async () => {
      if (!organizationId || !contractId) return [];
      const { data, error } = await supabase
        .from("contract_amendments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("contract_id", contractId)
        .order("amendment_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContractAmendment[];
    },
    enabled: !!organizationId && !!contractId,
    staleTime: 30_000,
  });

  // ── Criar aditivo (rascunho) ───────────────────────────────────────────────
  const createAmendment = useMutation({
    mutationFn: async (input: CreateAmendmentInput) => {
      if (!organizationId) throw new Error("Organização não identificada.");

      const amendmentNumber = await nextAmendmentNumber(input.contract_id);

      // Para renovação: calcula new_end_date buscando o contrato atual
      let newEndDate: string | null = null;
      let newDurationMonths: number | null = null;

      if ((input.amendment_type === "renovacao" || input.amendment_type === "prazo") && input.additional_months) {
        const { data: ct } = await supabase
          .from("contracts")
          .select("end_date, duration_months")
          .eq("id", input.contract_id)
          .single();
        const contract = ct as { end_date: string | null; duration_months: number | null } | null;
        if (contract?.end_date) {
          const newEnd = addMonths(parseISO(contract.end_date), input.additional_months);
          newEndDate = format(newEnd, "yyyy-MM-dd");
        }
        newDurationMonths = (contract?.duration_months ?? 0) + input.additional_months;
      }

      const { data, error } = await supabase
        .from("contract_amendments")
        .insert({
          contract_id:         input.contract_id,
          organization_id:     organizationId,
          client_id:           input.client_id,
          amendment_type:      input.amendment_type,
          amendment_number:    amendmentNumber,
          reason:              input.reason,
          additional_months:   input.additional_months ?? null,
          new_end_date:        newEndDate,
          new_duration_months: newDurationMonths,
          previous_value:      input.previous_snapshot?.value as number ?? null,
          new_value:           input.new_value ?? null,
          value_effective_date: input.value_effective_date ?? null,
          status:              "rascunho",
          previous_snapshot:   input.previous_snapshot ?? {},
          metadata:            input.metadata ?? {},
        })
        .select()
        .single();

      if (error) throw error;
      return data as ContractAmendment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Aplicar aditivo: atualiza contrato + gera/regenera pagamentos ─────────
  const applyAmendment = useMutation({
    mutationFn: async ({
      amendment,
      organizationIdParam,
    }: {
      amendment: ContractAmendment;
      organizationIdParam: string;
    }) => {
      if (!organizationId) throw new Error("Organização não identificada.");

      const contractUpdates: Record<string, unknown> = {};

      // ── Renovação / extensão de prazo ──────────────────────────────────────
      if (
        (amendment.amendment_type === "renovacao" || amendment.amendment_type === "prazo") &&
        amendment.additional_months
      ) {
        if (amendment.new_end_date)        contractUpdates.end_date        = amendment.new_end_date;
        if (amendment.new_duration_months) contractUpdates.duration_months = amendment.new_duration_months;

        if (amendment.new_value) {
          contractUpdates.value = amendment.new_value;
        }

        // Atualiza o contrato
        const { error: ctError } = await supabase
          .from("contracts")
          .update(contractUpdates)
          .eq("id", amendment.contract_id);
        if (ctError) throw ctError;

        // Gera novos pagamentos a partir da data seguinte ao último lançamento
        const lastDue = await lastPaymentDueDate(amendment.contract_id);
        if (lastDue && amendment.additional_months > 0) {
          // Próximo vencimento: um mês após o último
          const firstNewDue = format(addMonths(parseISO(lastDue), 1), "yyyy-MM-dd");

          // Busca o dia de vencimento recorrente do contrato
          const { data: ctData } = await supabase
            .from("contracts")
            .select("recurring_due_date, title, client_id, metadata")
            .eq("id", amendment.contract_id)
            .single();
          const ct = ctData as { recurring_due_date: string | null; title: string; client_id: string; metadata: Record<string, unknown> } | null;
          const recurringDay = ct?.recurring_due_date
            ? parseInt(ct.recurring_due_date.split("-")[2] ?? "20", 10)
            : undefined;

          const newValue = amendment.new_value
            ?? (amendment.previous_value ?? 0);

          // Para evolutivo, pega schedule do metadata do aditivo (se fornecido) ou usa valor fixo
          const evolutiveSchedule = (amendment.metadata?.evolutive_schedule as EvolutiveEntry[] | undefined);

          const drafts = generatePayments({
            contractId:        amendment.contract_id,
            title:             ct?.title ?? "",
            recurringValue:    newValue,
            durationMonths:    amendment.additional_months,
            firstPaymentDueDate: firstNewDue,
            recurringDueDay:   recurringDay,
            evolutiveSchedule,
          });

          for (const draft of drafts) {
            const { data: existing } = await supabase
              .from("payments")
              .select("id, status")
              .eq("contract_id", draft.contract_id)
              .eq("due_date", draft.due_date)
              .maybeSingle();

            if (!existing) {
              await supabase.from("payments").insert({
                ...draft,
                organization_id: organizationIdParam,
                client_id:       ct?.client_id ?? amendment.client_id,
              });
            }
          }
        }
      }

      // ── Reajuste de valor ──────────────────────────────────────────────────
      if (amendment.amendment_type === "reajuste" && amendment.new_value !== null) {
        const { error: ctError } = await supabase
          .from("contracts")
          .update({ value: amendment.new_value })
          .eq("id", amendment.contract_id);
        if (ctError) throw ctError;

        // Atualiza valor dos pagamentos pendentes a partir da data de vigência
        const effectiveDate = amendment.value_effective_date
          ?? format(new Date(), "yyyy-MM-dd");

        await supabase
          .from("payments")
          .update({ value: amendment.new_value })
          .eq("contract_id", amendment.contract_id)
          .eq("status", "pendente")
          .gte("due_date", effectiveDate);
      }

      // ── Marca o aditivo como assinado (aplicado) ───────────────────────────
      const { error: amendError } = await supabase
        .from("contract_amendments")
        .update({ status: "assinado", signed_at: new Date().toISOString() })
        .eq("id", amendment.id)
        .eq("organization_id", organizationId);
      if (amendError) throw amendError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["contracts_legacy"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  // ── Marcar como pendente de assinatura ────────────────────────────────────
  const submitForSignature = useMutation({
    mutationFn: async (amendmentId: string) => {
      const { error } = await supabase
        .from("contract_amendments")
        .update({ status: "pendente_assinatura" })
        .eq("id", amendmentId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Cancelar aditivo ──────────────────────────────────────────────────────
  const cancelAmendment = useMutation({
    mutationFn: async (amendmentId: string) => {
      const { error } = await supabase
        .from("contract_amendments")
        .update({ status: "cancelado" })
        .eq("id", amendmentId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    ...query,
    createAmendment,
    applyAmendment,
    submitForSignature,
    cancelAmendment,
  };
}

/**
 * useContractVariableResults
 *
 * Gerencia o histórico de resultados variáveis de um contrato do tipo 'variavel'.
 * Cada resultado representa um mês de apuração da comissão.
 *
 * Operações:
 *   - Listar resultados por contrato
 *   - Registrar resultado (cria ou atualiza pelo mês de referência)
 *   - Gerar lançamento em payments para o resultado apurado
 *   - Remover resultado (apenas se não tiver payment gerado)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, addMonths, lastDayOfMonth } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type VariableResultType = "contrato_individual" | "faturamento_global";

export interface IndividualContract {
  date: string;       // ISO "YYYY-MM-DD"
  value: number;
  description?: string;
}

export interface ContractVariableResult {
  id: string;
  contract_id: string;
  organization_id: string;
  client_id: string;
  reference_month: string;         // ISO "YYYY-MM-01"
  result_type: VariableResultType;
  individual_contracts: IndividualContract[];
  total_result: number;
  revenue_baseline: number | null;
  incremental_result: number | null;
  commission_pct: number;
  commission_base: number;
  commission_value: number;
  due_date: string;
  payment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveVariableResultInput {
  id?: string;
  contract_id: string;
  client_id: string;
  reference_month: string;         // "YYYY-MM-01"
  result_type: VariableResultType;
  // Para contrato_individual
  individual_contracts?: IndividualContract[];
  // Para faturamento_global
  total_result_global?: number;    // faturamento total do mês
  revenue_baseline?: number;       // média dos últimos 12m (snapshot)
  // Configuração do contrato (snapshot)
  commission_pct: number;
  recurring_due_date?: string;     // data de vencimento do fixo (para faturamento_global)
  notes?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calcula due_date conforme a regra de negócio:
 *   - contrato_individual: 5 dias após hoje (data do registro)
 *   - faturamento_global: data do pagamento fixo do mês seguinte ao reference_month
 */
function calcDueDate(
  resultType: VariableResultType,
  referenceMonth: string,
  recurringDueDate?: string
): string {
  if (resultType === "contrato_individual") {
    return format(addDays(new Date(), 5), "yyyy-MM-dd");
  }
  // faturamento_global: vencimento na data do fixo do mês seguinte
  if (recurringDueDate) {
    // Extrai o dia do vencimento do fixo
    const day = parseInt(recurringDueDate.split("-")[2] ?? "20", 10);
    const refDate = new Date(referenceMonth);
    const nextMonth = addMonths(refDate, 1);
    // Limita ao último dia do mês caso o dia não exista (ex: 31 em fevereiro)
    const lastDay = lastDayOfMonth(nextMonth).getDate();
    const effectiveDay = Math.min(day, lastDay);
    return format(
      new Date(nextMonth.getFullYear(), nextMonth.getMonth(), effectiveDay),
      "yyyy-MM-dd"
    );
  }
  // Fallback: dia 20 do mês seguinte
  const refDate = new Date(referenceMonth);
  const nextMonth = addMonths(refDate, 1);
  return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20), "yyyy-MM-dd");
}

/** Monta o payload completo a partir do input, calculando comissão */
function buildPayload(input: SaveVariableResultInput, organizationId: string) {
  const {
    contract_id, client_id, reference_month, result_type,
    individual_contracts = [], total_result_global = 0,
    revenue_baseline, commission_pct, recurring_due_date, notes,
  } = input;

  let total_result: number;
  let incremental_result: number | null = null;
  let commission_base: number;

  if (result_type === "contrato_individual") {
    total_result = individual_contracts.reduce((sum, c) => sum + c.value, 0);
    commission_base = total_result;
  } else {
    total_result = total_result_global;
    const baseline = revenue_baseline ?? 0;
    incremental_result = Math.max(0, total_result - baseline);
    commission_base = incremental_result;
  }

  const commission_value = Math.round(commission_base * commission_pct / 100 * 100) / 100;
  const due_date = calcDueDate(result_type, reference_month, recurring_due_date);

  return {
    contract_id,
    organization_id: organizationId,
    client_id,
    reference_month,
    result_type,
    individual_contracts: result_type === "contrato_individual" ? individual_contracts : [],
    total_result,
    revenue_baseline: result_type === "faturamento_global" ? (revenue_baseline ?? null) : null,
    incremental_result,
    commission_pct,
    commission_base,
    commission_value,
    due_date,
    notes: notes ?? null,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useContractVariableResults(contractId: string | undefined) {
  const organizationId = useOrganization();
  const qc = useQueryClient();
  const queryKey = ["contract_variable_results", organizationId, contractId];

  // ── Listar ────────────────────────────────────────────────────────────────
  const query = useQuery<ContractVariableResult[]>({
    queryKey,
    queryFn: async () => {
      if (!organizationId || !contractId) return [];
      const { data, error } = await supabase
        .from("contract_variable_results")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("contract_id", contractId)
        .order("reference_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractVariableResult[];
    },
    enabled: !!organizationId && !!contractId,
    staleTime: 30_000,
  });

  // ── Salvar resultado ──────────────────────────────────────────────────────
  const saveResult = useMutation({
    mutationFn: async (input: SaveVariableResultInput) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const payload = buildPayload(input, organizationId);

      if (input.id) {
        const { error } = await supabase
          .from("contract_variable_results")
          .update(payload)
          .eq("id", input.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_variable_results")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Gerar lançamento em payments ──────────────────────────────────────────
  const generatePayment = useMutation({
    mutationFn: async (result: ContractVariableResult) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      if (result.payment_id) throw new Error("Lançamento já gerado para este resultado.");
      if (result.commission_value <= 0) throw new Error("Comissão apurada é zero — nenhum lançamento gerado.");

      const refDate = new Date(result.reference_month);
      const monthLabel = format(refDate, "MM/yyyy");

      const { data, error } = await supabase
        .from("payments")
        .insert({
          organization_id: organizationId,
          contract_id: result.contract_id,
          client_id: result.client_id,
          description: `Comissão variável ${monthLabel} — ${
            result.result_type === "contrato_individual"
              ? `${result.individual_contracts?.length ?? 0} contrato(s)`
              : `incremento de ${result.incremental_result?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
          }`,
          value: result.commission_value,
          due_date: result.due_date,
          status: "pendente",
          payment_method: "pix",
          metadata: {
            type: "comissao_variavel",
            reference_month: result.reference_month,
            result_type: result.result_type,
            commission_pct: result.commission_pct,
            commission_base: result.commission_base,
          },
        })
        .select("id")
        .single();

      if (error) throw error;

      // Vincula o payment ao resultado
      const paymentId = (data as { id: string }).id;
      const { error: linkError } = await supabase
        .from("contract_variable_results")
        .update({ payment_id: paymentId })
        .eq("id", result.id)
        .eq("organization_id", organizationId);
      if (linkError) throw linkError;

      return paymentId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  // ── Remover resultado ─────────────────────────────────────────────────────
  const removeResult = useMutation({
    mutationFn: async (resultId: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      const { error } = await supabase
        .from("contract_variable_results")
        .delete()
        .eq("id", resultId)
        .eq("organization_id", organizationId)
        .is("payment_id", null); // só remove se não tiver payment vinculado
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    ...query,
    saveResult,
    generatePayment,
    removeResult,
  };
}

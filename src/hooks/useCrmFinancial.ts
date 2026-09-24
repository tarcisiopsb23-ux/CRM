import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setDate, addMonths, isBefore, startOfDay, format } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { SubscriptionStatus } from "@/lib/crmModules";

export interface CrmFinancialClient {
  client_id: string;
  client_name: string;
  plan_value: number;
  subscription_status: SubscriptionStatus;
  due_day: number;
  modules: string[];
  max_users: number;
  pending_amount: number;
  next_due_date: string | null;
}

function calcNextDueDate(dueDay: number): string {
  const today = startOfDay(new Date());
  let candidate = setDate(today, dueDay);
  if (isBefore(candidate, today)) candidate = setDate(addMonths(today, 1), dueDay);
  return format(candidate, "yyyy-MM-dd");
}

export function useCrmFinancial(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["crm_financial", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Buscar clientes com c8_control_enabled + planos
      const { data: rows, error } = await supabase
        .from("clients")
        .select("id, name, crm_client_plans(*)")
        .eq("organization_id", organizationId)
        .eq("c8_control_enabled", true);
      if (error) throw error;

      const clients: CrmFinancialClient[] = [];
      const now = new Date();
      const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");

      for (const row of rows ?? []) {
        const plan = Array.isArray(row.crm_client_plans)
          ? row.crm_client_plans[0]
          : row.crm_client_plans;
        if (!plan) continue;

        // Buscar o contrato CRM do cliente (fonte única de pagamentos)
        const { data: contracts } = await supabase
          .from("contracts")
          .select("id")
          .eq("client_id", row.id)
          .eq("service_contracted", "C8 Control CRM")
          .order("created_at", { ascending: false })
          .limit(1);

        const contractId = contracts?.[0]?.id ?? null;

        // Buscar pagamentos: via contrato (fonte única) ou fallback por descrição
        let paymentsQuery = supabase
          .from("payments")
          .select("value, status, due_date")
          .eq("client_id", row.id);

        if (contractId) {
          paymentsQuery = paymentsQuery.eq("contract_id", contractId);
        } else {
          paymentsQuery = paymentsQuery
            .like("description", "Mensalidade C8 Control%")
            .is("contract_id", null);
        }

        const { data: payments } = await paymentsQuery;

        const pendingPayments = (payments ?? []).filter(
          (p) => p.status === "pendente" || p.status === "atrasado"
        );
        const pending_amount = pendingPayments.reduce((sum, p) => sum + (p.value ?? 0), 0);

        clients.push({
          client_id: row.id,
          client_name: row.name,
          plan_value: plan.plan_value,
          subscription_status: plan.subscription_status as SubscriptionStatus,
          due_day: plan.due_day,
          modules: plan.modules ?? [],
          max_users: plan.max_users,
          pending_amount,
          next_due_date: calcNextDueDate(plan.due_day),
        });
      }

      return clients;
    },
    enabled: !!organizationId,
  });

  const clients = query.data ?? [];

  // Totais calculados
  const totalExpectedMonthly = clients
    .filter((c) => c.subscription_status === "ativo")
    .reduce((sum, c) => sum + c.plan_value, 0);

  const now = new Date();
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");

  const totalReceivedMonthQuery = useQuery({
    queryKey: ["crm_financial_received", organizationId, monthStart],
    queryFn: async () => {
      if (!organizationId) return 0;
      // Buscar contratos CRM da organização
      const { data: crmContracts } = await supabase
        .from("contracts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("service_contracted", "C8 Control CRM");

      const contractIds = (crmContracts ?? []).map(c => c.id);

      let query = supabase
        .from("payments")
        .select("value")
        .eq("organization_id", organizationId)
        .eq("status", "pago")
        .gte("paid_at", monthStart)
        .lte("paid_at", monthEnd + "T23:59:59");

      if (contractIds.length > 0) {
        // Pagamentos vinculados a contratos CRM OU avulsos com descrição C8 Control
        const { data: byContract } = await query.in("contract_id", contractIds);
        const { data: byDesc } = await supabase
          .from("payments")
          .select("value")
          .eq("organization_id", organizationId)
          .like("description", "Mensalidade C8 Control%")
          .is("contract_id", null)
          .eq("status", "pago")
          .gte("paid_at", monthStart)
          .lte("paid_at", monthEnd + "T23:59:59");
        return [...(byContract ?? []), ...(byDesc ?? [])].reduce((sum, p) => sum + (p.value ?? 0), 0);
      }

      // Fallback: apenas por descrição
      const { data } = await query.like("description", "Mensalidade C8 Control%");
      return (data ?? []).reduce((sum, p) => sum + (p.value ?? 0), 0);
    },
    enabled: !!organizationId,
  });

  const totalReceivedMonth = totalReceivedMonthQuery.data ?? 0;

  // Clientes com pagamento atrasado > 5 dias
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoStr = format(fiveDaysAgo, "yyyy-MM-dd");

  const overdueClients = clients.filter((c) =>
    c.pending_amount > 0 && c.next_due_date !== null && c.next_due_date < fiveDaysAgoStr
  );

  const generateCharge = useMutation({
    mutationFn: async (clientId: string) => {
      const client = clients.find((c) => c.client_id === clientId);
      if (!client) throw new Error("Cliente não encontrado");

      // Buscar contrato CRM para vincular o pagamento
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id")
        .eq("client_id", clientId)
        .eq("service_contracted", "C8 Control CRM")
        .order("created_at", { ascending: false })
        .limit(1);
      const contractId = contracts?.[0]?.id ?? null;

      const { data, error } = await supabase
        .from("payments")
        .insert({
          organization_id: organizationId!,
          client_id: clientId,
          ...(contractId ? { contract_id: contractId } : {}),
          description: `Mensalidade C8 Control — ${client.client_name}`,
          value: client.plan_value,
          due_date: calcNextDueDate(client.due_day),
          status: "pendente",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_financial", organizationId] });
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
  });

  const blockAccess = useMutation({
    mutationFn: async (clientId: string) => {
      const { error: planError } = await supabase
        .from("crm_client_plans")
        .update({ subscription_status: "bloqueado" })
        .eq("client_id", clientId);
      if (planError) throw planError;

      const { error: sessionError } = await supabase
        .from("crm_sessions")
        .update({ revoked: true })
        .eq("client_id", clientId);
      if (sessionError) throw sessionError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_financial", organizationId] }),
  });

  const unblockAccess = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("crm_client_plans")
        .update({ subscription_status: "ativo" })
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_financial", organizationId] }),
  });

  return {
    ...query,
    clients,
    totalExpectedMonthly,
    totalReceivedMonth,
    overdueClients,
    generateCharge,
    blockAccess,
    unblockAccess,
  };
}

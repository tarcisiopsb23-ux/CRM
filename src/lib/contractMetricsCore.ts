import { DateRange, isDateInRange } from "./periodHelpers";

export type ContractStatus = "ativo" | "suspenso" | "finalizado" | "cancelado";
export type PaymentStatus = "pendente" | "pago" | "atrasado" | "cancelado";

export interface Contract {
  id: string;
  client_id: string;
  status: ContractStatus | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

export interface Payment {
  id: string;
  contract_id: string | null;
  client_id: string;
  due_date: string;
  paid_at: string | null;
  status: PaymentStatus | null;
  value: number;
}

export type ContractMetricsContract = Contract;
export type ContractMetricsPayment = Payment;

export interface ContractMetrics {
  suspendedTotal: number;
  suspendedMonth: number;
  reactivatedMonth: number;
  suspendedClientIdsMonth: string[];
  reactivatedVsSuspendedPercent: number | null;
  overdueTotalValue: number;
  overdueOver30ContractIds: string[];
  delinquencyReceivedMonthValue: number;
  delinquencyReceivedMonthPercentOfOverdue: number | null;
}

const getMetaIso = (meta: Record<string, unknown> | null | undefined, key: string) => {
  const v = meta?.[key];
  if (typeof v !== "string") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return v;
};

export function computeContractMetrics(input: {
  contracts: Contract[];
  payments: Payment[];
  now?: Date;
  range?: DateRange;
  overdueDaysToSuspend?: number;
}): ContractMetrics {
  const now = input.now ?? new Date();
  
  // Se não for passado um range, usa o mês atual como padrão
  const range = input.range ?? {
    from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };

  const suspendedTotal = input.contracts.filter((c) => c.status === "suspenso").length;

  const suspendedClientIdsMonth = new Set<string>();
  let suspendedMonth = 0;
  let reactivatedMonth = 0;

  for (const c of input.contracts) {
    const meta = c.metadata ?? null;
    const suspendedAt = getMetaIso(meta, "suspended_at");
    if (suspendedAt && isDateInRange(suspendedAt, range)) {
      suspendedMonth += 1;
      suspendedClientIdsMonth.add(c.client_id);
    }

    const reactivatedAt = getMetaIso(meta, "reactivated_at");
    if (reactivatedAt && isDateInRange(reactivatedAt, range)) {
      reactivatedMonth += 1;
    }
  }

  const reactivatedVsSuspendedPercent =
    suspendedTotal > 0 ? (reactivatedMonth / suspendedTotal) * 100 : null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const overdueCutoff = new Date(today);
  overdueCutoff.setDate(overdueCutoff.getDate() - Math.max(0, input.overdueDaysToSuspend ?? 30));

  let overdueTotalValue = 0;
  let delinquencyReceivedMonthValue = 0;
  const overdueOver30ContractIds = new Set<string>();

  for (const p of input.payments) {
    const st = p.status;
    const due = new Date(p.due_date);
    if (!Number.isNaN(due.getTime())) {
      const isUnpaid = !p.paid_at && st !== "pago" && st !== "cancelado";
      // Inadimplência total (snapshot hoje)
      if (isUnpaid && due < today) overdueTotalValue += Number(p.value ?? 0);
      // Contratos para suspender (hoje)
      if (isUnpaid && due < overdueCutoff && p.contract_id) overdueOver30ContractIds.add(p.contract_id);
    }

    if (p.paid_at) {
      const paidAt = new Date(p.paid_at);
      if (!Number.isNaN(paidAt.getTime()) && isDateInRange(p.paid_at, range)) {
        // Recuperação: pago no período, mas vencido antes do período
        const recoveredOverdue = due < range.from;
        if (recoveredOverdue) delinquencyReceivedMonthValue += Number(p.value ?? 0);
      }
    }
  }

  const delinquencyReceivedMonthPercentOfOverdue =
    overdueTotalValue > 0 ? (delinquencyReceivedMonthValue / overdueTotalValue) * 100 : null;

  return {
    suspendedTotal,
    suspendedMonth,
    reactivatedMonth,
    suspendedClientIdsMonth: Array.from(suspendedClientIdsMonth),
    reactivatedVsSuspendedPercent,
    overdueTotalValue,
    overdueOver30ContractIds: Array.from(overdueOver30ContractIds),
    delinquencyReceivedMonthValue,
    delinquencyReceivedMonthPercentOfOverdue,
  };
}

// Helpers de listas solicitados na Fase A
export function getDelinquentClients(input: {
  contracts: Contract[];
  payments: Payment[];
  overdueDays?: number;
}) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (input.overdueDays ?? 30));

  const clientMap = new Map<string, { totalOverdue: number; oldestDue: Date; contractIds: Set<string> }>();

  for (const p of input.payments) {
    if (p.paid_at || p.status === "pago" || p.status === "cancelado") continue;
    const due = new Date(p.due_date);
    if (due < now) {
      const entry = clientMap.get(p.client_id) || { totalOverdue: 0, oldestDue: due, contractIds: new Set() };
      entry.totalOverdue += Number(p.value || 0);
      if (due < entry.oldestDue) entry.oldestDue = due;
      if (p.contract_id) entry.contractIds.add(p.contract_id);
      clientMap.set(p.client_id, entry);
    }
  }

  return Array.from(clientMap.entries()).map(([clientId, data]) => ({
    clientId,
    totalOverdue: data.totalOverdue,
    oldestDue: data.oldestDue.toISOString(),
    contractIds: Array.from(data.contractIds),
    isCritical: data.oldestDue < cutoff,
  }));
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContractRow = {
  id: string;
  organization_id: string;
  client_id: string;
  title: string;
  value: number;
  status: string | null;
  start_date: string;
  contract_date: string | null;
  end_date: string | null;
  periodicity: string | null;
  duration_months: number | null;
  first_payment_value: number | null;
  first_payment_due_date: string | null;
  first_payment_installments: number | null;
  first_payment_fees: number | null;
  first_payment_split: boolean | null;
  first_payment_second_due_date: string | null;
  recurring_due_date: string | null;
};

type PaymentRow = {
  id: string;
  contract_id: string | null;
  due_date: string;
  value: number;
};

const clampEnd = (d: Date, endIso: string | null) => {
  if (!endIso) return true;
  const end = new Date(endIso);
  return d <= end;
};

const listDueDates = (contract: ContractRow, from: Date, to: Date) => {
  const start = new Date(contract.start_date);
  const end = contract.end_date ? new Date(contract.end_date) : null;
  const per = contract.periodicity ?? "mensal";

  const dates: Date[] = [];
  const pushIfInRange = (d: Date) => {
    if (d >= from && d <= to && (!end || d <= end)) dates.push(d);
  };

  if (per === "pagamento_unico") {
    pushIfInRange(start);
    return dates;
  }

  if (per === "50_50") {
    pushIfInRange(start);
    pushIfInRange(addMonths(start, 1));
    return dates;
  }

  const stepMonths =
    per === "mensal" ? 1 : per === "trimestral" ? 3 : per === "semestral" ? 6 : per === "anual" ? 12 : 1;

  let cur = new Date(start);
  while (cur <= to && clampEnd(cur, contract.end_date)) {
    pushIfInRange(cur);
    cur = addMonths(cur, stepMonths);
  }
  return dates;
};

const listReceivableEntries = (contract: ContractRow, from: Date, to: Date) => {
  const end = contract.end_date ? new Date(contract.end_date) : null;
  const inRange = (d: Date) => d >= from && d <= to && (!end || d <= end);

  const duration = contract.duration_months && contract.duration_months > 0 ? contract.duration_months : null;
  const baseDueIso = contract.first_payment_due_date ?? contract.contract_date ?? contract.start_date;
  const baseDue = new Date(baseDueIso);

  const items: Array<{ due: string; value: number; description: string }> = [];

  if (duration) {
    const firstTotal = (contract.first_payment_value ?? contract.value) ?? 0;
    const installmentsRaw = contract.first_payment_installments ?? (contract.first_payment_split ? 2 : 1);
    const installments = Math.min(12, Math.max(1, Number(installmentsRaw || 1)));
    const fees = installments > 1 ? Math.max(0, Number(contract.first_payment_fees ?? 0)) : 0;

    if (installments > 1) {
      const baseInstallment = (Number(firstTotal) + fees) / installments;
      for (let i = 0; i < installments; i++) {
        const d = addMonths(baseDue, i);
        if (!inRange(d)) continue;
        items.push({
          due: format(d, "yyyy-MM-dd"),
          value: baseInstallment,
          description: `Contrato • ${contract.title} • ${i + 1}/${installments}`,
        });
      }
    } else if (contract.first_payment_split === true && !!contract.first_payment_second_due_date) {
      const half = Number(firstTotal) / 2;
      const d1 = new Date(baseDueIso);
      const d2 = new Date(contract.first_payment_second_due_date);
      if (inRange(d1)) items.push({ due: format(d1, "yyyy-MM-dd"), value: half, description: `Contrato • ${contract.title} • 1/2` });
      if (inRange(d2)) items.push({ due: format(d2, "yyyy-MM-dd"), value: half, description: `Contrato • ${contract.title} • 2/2` });
    } else {
      const d0 = new Date(baseDueIso);
      if (inRange(d0)) items.push({ due: format(d0, "yyyy-MM-dd"), value: Number(firstTotal), description: `Contrato • ${contract.title} • Inicial` });
    }

    const recurringCount = Math.max(0, duration - 1);
    const recurringBaseIso =
      contract.recurring_due_date ?? format(addMonths(baseDue, installments), "yyyy-MM-dd");
    const recurringBase = new Date(recurringBaseIso);
    for (let i = 0; i < recurringCount; i++) {
      const d = addMonths(recurringBase, i);
      if (!inRange(d)) continue;
      items.push({ due: format(d, "yyyy-MM-dd"), value: Number(contract.value ?? 0), description: `Contrato • ${contract.title}` });
    }
    return items;
  }

  const dueDates = listDueDates(contract, from, to);
  for (const d of dueDates) {
    const due = format(d, "yyyy-MM-dd");
    const isSplit = (contract.periodicity ?? "") === "50_50";
    const value = isSplit ? Number(contract.value ?? 0) / 2 : Number(contract.value ?? 0);
    items.push({ due, value, description: `Contrato • ${contract.title}` });
  }
  return items;
};

export function useContractReceivablesSync(organizationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!organizationId) return { inserted: 0 };
      const now = new Date();
      const from = startOfMonth(addMonths(now, -1));
      const to = endOfMonth(addMonths(now, 3));

      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { data: contractsData, error: contractsError } = await supabaseUntyped
        .from("contracts")
        .select(
          "id, organization_id, client_id, title, value, status, start_date, contract_date, end_date, periodicity, duration_months, first_payment_value, first_payment_due_date, first_payment_installments, first_payment_fees, first_payment_split, first_payment_second_due_date, recurring_due_date"
        )
        .eq("organization_id", organizationId)
        .neq("status", "cancelado");
      if (contractsError) throw contractsError;

      const contracts = (contractsData ?? []) as unknown as Array<Record<string, unknown>>;
      const normalized = contracts
        .map((r) => ({
          id: String(r.id),
          organization_id: String(r.organization_id),
          client_id: String(r.client_id),
          title: String(r.title ?? "Contrato"),
          value: Number(r.value ?? 0),
          status: (r.status as string | null) ?? null,
          start_date: String(r.start_date),
          contract_date: (r.contract_date as string | null) ?? null,
          end_date: (r.end_date as string | null) ?? null,
          periodicity: (r.periodicity as string | null) ?? null,
          duration_months: typeof r.duration_months === "number" ? r.duration_months : (r.duration_months ? Number(r.duration_months) : null),
          first_payment_value: typeof r.first_payment_value === "number" ? r.first_payment_value : (r.first_payment_value ? Number(r.first_payment_value) : null),
          first_payment_due_date: (r.first_payment_due_date as string | null) ?? null,
          first_payment_installments: typeof r.first_payment_installments === "number" ? r.first_payment_installments : (r.first_payment_installments ? Number(r.first_payment_installments) : null),
          first_payment_fees: typeof r.first_payment_fees === "number" ? r.first_payment_fees : (r.first_payment_fees ? Number(r.first_payment_fees) : null),
          first_payment_split: (r.first_payment_split as boolean | null) ?? null,
          first_payment_second_due_date: (r.first_payment_second_due_date as string | null) ?? null,
          recurring_due_date: (r.recurring_due_date as string | null) ?? null,
        }))
        .filter((c) => c.status === "ativo" || c.status === "suspenso");

      if (normalized.length === 0) return { inserted: 0 };

      const contractIds = normalized.map((c) => c.id);
      const { data: existingData, error: existingError } = await supabase
        .from("payments")
        .select("id, contract_id, due_date, value")
        .eq("organization_id", organizationId)
        .in("contract_id", contractIds)
        .gte("due_date", format(from, "yyyy-MM-dd"))
        .lte("due_date", format(to, "yyyy-MM-dd"));
      if (existingError) throw existingError;
      const existing = (existingData ?? []) as PaymentRow[];
      const existingKey = new Set(existing.map((p) => `${p.contract_id ?? ""}|${p.due_date}`));

      const inserts: Database["public"]["Tables"]["payments"]["Insert"][] = [];
      for (const c of normalized as ContractRow[]) {
        const entries = listReceivableEntries(c, from, to);
        for (const it of entries) {
          const key = `${c.id}|${it.due}`;
          if (existingKey.has(key)) continue;
          inserts.push({
            organization_id: organizationId,
            contract_id: c.id,
            client_id: c.client_id,
            description: it.description,
            value: it.value,
            due_date: it.due,
            status: "pendente",
            metadata: toJson({ source: "contract_sync", contract_id: c.id }) ?? null,
          });
        }
      }

      if (inserts.length === 0) return { inserted: 0 };

      const { error: insertError } = await supabase.from("payments").insert(inserts);
      if (insertError) throw insertError;
      return { inserted: inserts.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", organizationId] });
    },
  });
}

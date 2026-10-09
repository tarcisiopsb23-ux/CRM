/**
 * useContractSchedule
 *
 * Lógica de cálculo automático do cronograma de pagamento de contratos.
 *
 * Regras:
 * - Se há setup/pagamento único: mensalidade começa no mês seguinte
 * - O vencimento da 2ª parcela deve ter prazo > 25 dias da anterior
 * - Suporte a cronograma evolutivo personalizado (linha a linha)
 * - Carência removida: grace_months dos blocos é ignorado
 */

import { addMonths, differenceInDays, setDate, startOfMonth } from "date-fns";
import type { ServiceBlock } from "./useContractTemplates";

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface ContractPaymentLine {
  id?: string;
  contract_id?: string;
  line_order: number;
  month_from: number;
  month_to: number | null;        // null = "em diante"
  period_label: string;
  due_date: string | null;        // ISO date string
  is_recurring: boolean;
  amount: number;
  payment_method: "pix" | "cartao" | "boleto" | "transferencia";
  line_type: "setup" | "mensalidade" | "unico" | "outro";
  notes: string | null;
  created_at?: string;
}

export interface ScheduleInput {
  blocks: ServiceBlock[];
  firstPaymentDate: Date;
  dueDay: number;
  setupAmount?: number;
  monthlyAmounts?: { monthFrom: number; monthTo: number | null; amount: number }[];
}

export interface ScheduleResult {
  lines: ContractPaymentLine[];
  warnings: string[];               // alertas para o usuário
  totalSetup: number;
  totalMonthly: number;             // valor da mensalidade recorrente final
  hasFlexSchedule: boolean;         // true = tem variação nas primeiras parcelas
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formata data para ISO string (YYYY-MM-DD) */
function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Rótulo do período para exibição no contrato */
function periodLabel(from: number, to: number | null): string {
  if (to === null) return `A partir do mês ${from}`;
  if (from === to)  return `Mês ${from}`;
  return `Meses ${from} e ${to}`;
}

/**
 * Dado o dia de vencimento e uma data de referência, calcula a
 * próxima data de vencimento que esteja pelo menos minGap dias depois.
 */
function nextDueDate(referenceDate: Date, dueDay: number, minGapDays = 25): Date {
  const safeDay = Math.min(dueDay, 28);

  // Tenta o dueDay no mesmo mês da referência
  let candidate = setDate(referenceDate, safeDay);
  if (candidate <= referenceDate) {
    candidate = setDate(addMonths(referenceDate, 1), safeDay);
  }

  // Garante o gap mínimo
  while (differenceInDays(candidate, referenceDate) < minGapDays) {
    candidate = setDate(addMonths(candidate, 1), safeDay);
  }

  return candidate;
}

// ── Função principal de cálculo ───────────────────────────────────────────────

export function calculateSchedule(input: ScheduleInput): ScheduleResult {
  const { blocks, firstPaymentDate, dueDay, setupAmount, monthlyAmounts } = input;
  const safeDay = Math.min(dueDay, 28);
  const warnings: string[] = [];
  const lines: ContractPaymentLine[] = [];

  // Agrega valores financeiros dos blocos (grace_months ignorado)
  let totalSetup   = 0;
  let totalMonthly = 0;
  let hasOneTime   = false;

  for (const b of blocks) {
    if (b.has_setup && b.setup_amount)     totalSetup   += b.setup_amount;
    if (b.has_monthly && b.monthly_amount) totalMonthly += b.monthly_amount;
    if (b.is_one_time && b.one_time_amount) { totalSetup += b.one_time_amount; hasOneTime = true; }
  }

  if (setupAmount !== undefined) totalSetup = setupAmount;

  const hasSetupOrOneTime = totalSetup > 0;
  let lineOrder = 0;
  let month = 1;

  // ── Linha 1: setup / pagamento único (se houver) ──────────────────────────
  if (hasSetupOrOneTime) {
    lines.push({
      line_order:     lineOrder++,
      month_from:     month,
      month_to:       month,
      period_label:   hasOneTime ? "Pagamento inicial (serviço + implementação)" : "Implementação (setup)",
      due_date:       toIso(firstPaymentDate),
      is_recurring:   false,
      amount:         totalSetup,
      payment_method: "pix",
      line_type:      "setup",
      notes:          null,
    });
    month++;
  }

  // ── Calcula data da 1ª mensalidade ────────────────────────────────────────
  let firstMonthlyDate: Date;
  if (hasSetupOrOneTime) {
    // Mensalidade começa no mês seguinte ao setup, respeitando 25 dias
    firstMonthlyDate = nextDueDate(firstPaymentDate, safeDay, 25);
  } else {
    // Sem setup: 1ª mensalidade na data escolhida pelo usuário
    firstMonthlyDate = firstPaymentDate;
  }

  // Verifica gap mínimo e emite alerta se foi necessário ajustar
  if (hasSetupOrOneTime) {
    const gap = differenceInDays(firstMonthlyDate, firstPaymentDate);
    if (gap < 25) {
      warnings.push(
        `A data da 1ª mensalidade foi ajustada para garantir prazo mínimo de 25 dias após o pagamento inicial.`
      );
    }
  }

  if (totalMonthly <= 0) {
    // Sem mensalidade recorrente (ex: consultoria pura)
    return {
      lines,
      warnings,
      totalSetup,
      totalMonthly: 0,
      hasFlexSchedule: false,
    };
  }

  // ── Cronograma de mensalidades ────────────────────────────────────────────
  // Se o usuário forneceu um cronograma evolutivo personalizado, usa ele.
  // Caso contrário, sugere automaticamente com base na carência dos blocos.

  const customAmounts = monthlyAmounts ?? [];

  if (customAmounts.length > 0) {
    // Cronograma personalizado (evolutivo)
    let currentDate = firstMonthlyDate;
    for (const seg of customAmounts) {
      lines.push({
        line_order:     lineOrder++,
        month_from:     seg.monthFrom,
        month_to:       seg.monthTo,
        period_label:   periodLabel(seg.monthFrom, seg.monthTo),
        due_date:       toIso(currentDate),
        is_recurring:   seg.monthTo === null,
        amount:         seg.amount,
        payment_method: "pix",
        line_type:      "mensalidade",
        notes:          null,
      });
      if (seg.monthTo !== null) {
        const months = seg.monthTo - seg.monthFrom + 1;
        currentDate = setDate(addMonths(currentDate, months), safeDay);
      }
    }
  } else {
    // Mensalidade fixa recorrente
    lines.push({
      line_order:     lineOrder++,
      month_from:     month,
      month_to:       null,
      period_label:   hasSetupOrOneTime ? `A partir do mês ${month}` : "Mensalidade",
      due_date:       toIso(firstMonthlyDate),
      is_recurring:   true,
      amount:         totalMonthly,
      payment_method: "pix",
      line_type:      "mensalidade",
      notes:          null,
    });
  }

  const hasFlexSchedule = lines.filter(l => l.line_type === "mensalidade").length > 1;

  return { lines, warnings, totalSetup, totalMonthly, hasFlexSchedule };
}

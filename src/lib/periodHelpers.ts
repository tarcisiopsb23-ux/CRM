export type PeriodOption = "mes_atual" | "mes_anterior" | "3_meses" | "6_meses" | "12_meses";

export interface DateRange {
  from: Date;
  to: Date;
}

export function getPeriodDateRange(option: PeriodOption, now: Date = new Date()): DateRange {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  switch (option) {
    case "mes_atual":
      from.setDate(1);
      to.setMonth(now.getMonth() + 1, 0); // Last day of month
      break;
    case "mes_anterior":
      from.setMonth(now.getMonth() - 1, 1);
      to.setMonth(now.getMonth(), 0);
      break;
    case "3_meses":
      from.setMonth(now.getMonth() - 2, 1); // Current + 2 previous
      break;
    case "6_meses":
      from.setMonth(now.getMonth() - 5, 1);
      break;
    case "12_meses":
      from.setMonth(now.getMonth() - 11, 1);
      break;
  }

  return { from, to };
}

export function isDateInRange(date: string | Date, range: DateRange): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return false;
  return d >= range.from && d <= range.to;
}

export const PERIOD_LABELS: Record<PeriodOption, string> = {
  mes_atual: "Mês atual",
  mes_anterior: "Mês anterior",
  "3_meses": "Últimos 3 meses",
  "6_meses": "Últimos 6 meses",
  "12_meses": "Últimos 12 meses",
};

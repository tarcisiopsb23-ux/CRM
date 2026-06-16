// src/lib/financialSchedule.ts
import { addMonths, addYears, format } from 'date-fns';

export type Recurrence = 'mensal' | 'trimestral' | 'semestral' | 'anual';

export interface ScheduleParams {
  firstValue: number;
  firstDate: string;           // 'yyyy-MM-dd'
  recurrence: Recurrence;
  installments: number;        // máx 360
  adjustments?: Record<number, number>; // { [installmentIndex]: value }
}

export interface ScheduleRow {
  installment: number;
  monthRef: string;
  value: number;
  dueDate: string;
}

/**
 * Gera o cronograma de parcelas de forma determinística.
 * P4: rows.length === installments
 *     datas incrementais conforme recorrência
 *     valores respeitam adjustments por índice
 */
export function generateSchedule(params: ScheduleParams): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const base = new Date(params.firstDate + 'T12:00:00');
  const clampedInstallments = Math.min(params.installments, 360);

  for (let i = 0; i < clampedInstallments; i++) {
    let date: Date;
    switch (params.recurrence) {
      case 'mensal':      date = addMonths(base, i);     break;
      case 'trimestral':  date = addMonths(base, i * 3); break;
      case 'semestral':   date = addMonths(base, i * 6); break;
      case 'anual':       date = addYears(base, i);      break;
    }

    const value = params.adjustments?.[i] ?? params.firstValue;
    rows.push({
      installment: i + 1,
      monthRef: format(date, 'MM/yyyy'),
      value,
      dueDate: format(date, 'dd/MM/yyyy'),
    });
  }
  return rows;
}

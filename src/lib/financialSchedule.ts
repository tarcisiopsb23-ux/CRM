// src/lib/financialSchedule.ts
import { addMonths, addYears, format } from 'date-fns';
import type { ScheduleConfig, ScheduleMode } from '@/types/proposals';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type Recurrence = 'mensal' | 'trimestral' | 'semestral' | 'anual';

/** Parâmetros legados — mantidos para retrocompatibilidade */
export interface ScheduleParams {
  firstValue: number;
  firstDate: string;
  recurrence: Recurrence;
  installments: number;
  adjustments?: Record<number, number>;
}

/** Uma linha do cronograma gerado para exibição */
export interface ScheduleRow {
  installment: number;
  /** Rótulo do período (ex: "Mês 1–3", "Mensalidade", "Setup") */
  label: string;
  /** Mês/ano de referência "MM/yyyy" */
  monthRef: string;
  value: number;
  dueDate: string;
  /** Tipo da linha para estilização no viewer */
  type: 'setup' | 'entrada' | 'mensalidade' | 'unico' | 'conclusao';
  /** true = parcela recorrente indefinida (exibe "em diante") */
  isRecurring?: boolean;
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export const MODE_LABELS: Record<ScheduleMode, string> = {
  integral:           'À vista (pagamento único)',
  mensal:             'Mensalidades fixas',
  setup_mensal:       'Setup + Mensalidades',
  meio_meio:          '50% na assinatura / 50% na conclusão',
  entrada_parcelado:  'Entrada + Parcelado',
  evolutivo:          'Cronograma evolutivo',
  carencia:           'Período de carência',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix:          'PIX',
  boleto:       'Boleto',
  cartao:       'Cartão',
  transferencia:'Transferência',
};

// ─── defaultSchedule ─────────────────────────────────────────────────────────

export function defaultSchedule(): ScheduleConfig {
  return {
    mode:         'mensal',
    firstValue:   0,
    firstDate:    new Date().toISOString().split('T')[0],
    dueDay:       10,
    recurrence:   'mensal',
    installments: 12,
    paymentMethod: 'pix',
  };
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function advanceDate(base: Date, i: number, recurrence: Recurrence): Date {
  switch (recurrence) {
    case 'mensal':     return addMonths(base, i);
    case 'trimestral': return addMonths(base, i * 3);
    case 'semestral':  return addMonths(base, i * 6);
    case 'anual':      return addYears(base, i);
  }
}

function isoToDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

function fmt(d: Date): string {
  return format(d, 'dd/MM/yyyy');
}

function monthRef(d: Date): string {
  return format(d, 'MM/yyyy');
}

// ─── generateScheduleFromConfig (nova API) ───────────────────────────────────

/**
 * Gera linhas de cronograma a partir de um ScheduleConfig completo.
 *
 * Regras unificadas de data:
 *   - firstDate é a ÚNICA data de referência para todo o cronograma.
 *   - Parcelas de setup: firstDate + 0, 1, 2… meses.
 *   - Carência: meses entre o fim do setup e o início da mensalidade (não cobrados).
 *   - Mensalidades: começam em firstDate + setupQty + graceMonths.
 *   - Todas as parcelas usam o mesmo dia de vencimento (dia de firstDate).
 *   - Linhas que caem no mesmo MM/yyyy são CONSOLIDADAS em uma única linha,
 *     com valores somados e rótulo combinado.
 */
export function generateScheduleFromConfig(
  cfg: ScheduleConfig,
  planValue: number,
): ScheduleRow[] {
  const mode = cfg.mode ?? 'mensal';
  const base = isoToDate(cfg.firstDate);

  // ── setup add-on ──────────────────────────────────────────────────────────
  const useSetup = (cfg.hasSetup === true && mode !== 'setup_mensal') || mode === 'setup_mensal';
  const setupQty   = useSetup ? Math.max(1, cfg.setupInstallments ?? 1) : 0;
  const setupVal   = useSetup ? (cfg.setupValue ?? 0) : 0;
  const graceMonths = Math.max(0, cfg.graceMonths ?? 0);

  // Data de início das mensalidades: firstDate + setupQty + carência
  const monthlyBase = addMonths(base, setupQty + graceMonths);

  // Monta as linhas brutas (sem numeração final)
  type RawRow = Omit<ScheduleRow, 'installment'>;
  const raw: RawRow[] = [];

  // 1. Parcelas de setup
  if (useSetup && setupVal > 0) {
    const perParcel = Math.round((setupVal / setupQty) * 100) / 100;
    for (let s = 0; s < setupQty; s++) {
      const d = addMonths(base, s);
      raw.push({
        label: setupQty === 1 ? 'Setup / Implementação' : `Setup ${s + 1}/${setupQty}`,
        monthRef: monthRef(d),
        value: perParcel,
        dueDate: fmt(d),
        type: 'setup',
      });
    }
  }

  // 2. Linhas do modo principal
  const modeRows = _buildModeRows(cfg, mode, planValue, base, monthlyBase);
  for (const r of modeRows) {
    raw.push({ label: r.label, monthRef: r.monthRef, value: r.value, dueDate: r.dueDate, type: r.type, isRecurring: r.isRecurring });
  }

  // 3. Consolidar linhas do mesmo MM/yyyy
  const merged = _mergeByMonth(raw);

  // 4. Numerar
  return merged.map((r, i) => ({ ...r, installment: i + 1 }));
}

/**
 * Consolida linhas com o mesmo monthRef em uma única linha.
 * Valores são somados; rótulos são concatenados com " + " quando diferentes.
 * O tipo da linha resultante segue a hierarquia: setup > entrada > unico > conclusao > mensalidade.
 */
function _mergeByMonth(rows: Array<Omit<ScheduleRow, 'installment'>>): Array<Omit<ScheduleRow, 'installment'>> {
  const TYPE_PRIORITY: Record<ScheduleRow['type'], number> = {
    setup:      5,
    entrada:    4,
    unico:      3,
    conclusao:  2,
    mensalidade:1,
  };

  const map = new Map<string, Omit<ScheduleRow, 'installment'>>();

  for (const row of rows) {
    const key = row.monthRef;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
    } else {
      // Mescla: soma valor, une rótulos se diferentes, mantém tipo de maior prioridade
      const mergedLabel = existing.label === row.label
        ? existing.label
        : `${existing.label} + ${row.label}`;
      const higherType = (TYPE_PRIORITY[existing.type] ?? 0) >= (TYPE_PRIORITY[row.type] ?? 0)
        ? existing.type
        : row.type;
      map.set(key, {
        label: mergedLabel,
        monthRef: key,
        value: Math.round((existing.value + row.value) * 100) / 100,
        dueDate: existing.dueDate, // mantém a data da primeira ocorrência
        type: higherType,
        isRecurring: existing.isRecurring || row.isRecurring,
      });
    }
  }

  return Array.from(map.values());
}

/** Gera as linhas do modo sem considerar setup add-on */
function _buildModeRows(
  cfg: ScheduleConfig,
  mode: ScheduleMode,
  planValue: number,
  base: Date,
  monthlyBase: Date,
): Array<Omit<ScheduleRow, 'installment'>> {
  // ── 1. À vista ─────────────────────────────────────────────────────────────
  if (mode === 'integral') {
    const val = cfg.integralValue ?? planValue;
    return [{ label: 'Pagamento à vista', monthRef: monthRef(base), value: val, dueDate: fmt(base), type: 'unico' }];
  }

  // ── 2. Mensalidades fixas ──────────────────────────────────────────────────
  if (mode === 'mensal') {
    return _buildUniform(cfg, monthlyBase);
  }

  // ── 3. Setup + Mensalidades (legado) ─────────────────────────────────────
  if (mode === 'setup_mensal') {
    // No modo legado, o setup já é tratado pelo bloco useSetup acima via hasSetup=false,
    // mas mantemos compatibilidade gerando as linhas aqui também
    const setupVal = cfg.setupValue ?? 0;
    const setupQty = Math.max(1, cfg.setupInstallments ?? 1);
    const perParcel = Math.round((setupVal / setupQty) * 100) / 100;
    const rows: Array<Omit<ScheduleRow, 'installment'>> = [];

    for (let s = 0; s < setupQty; s++) {
      const d = addMonths(base, s);
      rows.push({
        label: setupQty === 1 ? 'Setup / Implementação' : `Setup ${s + 1}/${setupQty}`,
        monthRef: monthRef(d),
        value: perParcel,
        dueDate: fmt(d),
        type: 'setup',
      });
    }

    const qty = Math.min(cfg.installments, 360);
    for (let i = 0; i < qty; i++) {
      const d = advanceDate(monthlyBase, i, cfg.recurrence);
      rows.push({
        label: 'Mensalidade',
        monthRef: monthRef(d),
        value: cfg.adjustments?.[i] ?? cfg.firstValue,
        dueDate: fmt(d),
        type: 'mensalidade',
        isRecurring: i === qty - 1,
      });
    }
    return rows;
  }

  // ── 4. 50% / 50% ─────────────────────────────────────────────────────────
  if (mode === 'meio_meio') {
    const pct = (cfg.entryPercent ?? 50) / 100;
    const entrada  = Math.round(planValue * pct * 100) / 100;
    const restante = planValue - entrada;
    const trigger  = cfg.secondPaymentTrigger ?? 'conclusao';
    const d2 = trigger === 'conclusao' ? base : addMonths(base, trigger as number);

    return [
      { label: `Entrada (${cfg.entryPercent ?? 50}%)`, monthRef: monthRef(base), value: entrada, dueDate: fmt(base), type: 'entrada' },
      {
        label: trigger === 'conclusao' ? 'Saldo na conclusão' : `Saldo (${trigger} ${trigger === 1 ? 'mês' : 'meses'} após assinatura)`,
        monthRef: trigger === 'conclusao' ? 'A combinar' : monthRef(d2),
        value: restante,
        dueDate: trigger === 'conclusao' ? 'Na conclusão' : fmt(d2),
        type: 'conclusao',
      },
    ];
  }

  // ── 5. Entrada + Parcelado ────────────────────────────────────────────────
  if (mode === 'entrada_parcelado') {
    const entradaVal = cfg.entryValue ?? 0;
    const parcelVal  = cfg.remainderInstallmentValue ?? 0;
    const parcelQty  = Math.min(cfg.remainderInstallments ?? 1, 360);
    const rows: Array<Omit<ScheduleRow, 'installment'>> = [
      { label: 'Entrada', monthRef: monthRef(base), value: entradaVal, dueDate: fmt(base), type: 'entrada' },
    ];
    for (let i = 0; i < parcelQty; i++) {
      const d = advanceDate(monthlyBase, i, cfg.recurrence);
      rows.push({
        label: `Parcela ${i + 1}/${parcelQty}`,
        monthRef: monthRef(d),
        value: cfg.adjustments?.[i] ?? parcelVal,
        dueDate: fmt(d),
        type: 'mensalidade',
      });
    }
    return rows;
  }

  // ── 6. Evolutivo ──────────────────────────────────────────────────────────
  if (mode === 'evolutivo') {
    const slices = cfg.slices ?? [];
    if (slices.length === 0) return _buildUniform(cfg, monthlyBase);
    return _buildSliceRows(slices, monthlyBase, cfg.recurrence);
  }

  // ── 7. Carência ──────────────────────────────────────────────────────────
  if (mode === 'carencia') {
    const slices = cfg.slices ?? [];
    if (slices.length === 0) return _buildUniform(cfg, monthlyBase);
    return _buildSliceRows(slices, monthlyBase, cfg.recurrence);
  }

  return _buildUniform(cfg, monthlyBase);
}

// ─── _buildSliceRows — fatias de valor (evolutivo / carência) ────────────────

function _buildSliceRows(
  slices: import('@/types/proposals').ScheduleSlice[],
  base: Date,
  recurrence: Recurrence,
): Array<Omit<ScheduleRow, 'installment'>> {
  const rows: Array<Omit<ScheduleRow, 'installment'>> = [];
  let cursor = base;

  for (const slice of slices) {
    const sliceStart = slice.firstDate ? isoToDate(slice.firstDate) : cursor;
    const isIndefinite = slice.installments === null;
    const qty = isIndefinite ? 1 : (slice.installments ?? 1);

    for (let i = 0; i < qty; i++) {
      const d = advanceDate(sliceStart, i, recurrence);
      rows.push({
        label: isIndefinite || qty === 1 ? slice.label : `${slice.label} (${i + 1}/${qty})`,
        monthRef: monthRef(d),
        value: slice.value,
        dueDate: fmt(d),
        type: 'mensalidade',
        isRecurring: isIndefinite,
      });
    }

    if (!isIndefinite) {
      cursor = advanceDate(sliceStart, qty, recurrence);
    } else {
      break;
    }
  }
  return rows;
}

// ─── _buildUniform — mensalidades uniformes (reutilizado internamente) ────────

function _buildUniform(cfg: ScheduleConfig, base: Date): Array<Omit<ScheduleRow, 'installment'>> {
  const qty = Math.min(cfg.installments, 360);
  return Array.from({ length: qty }, (_, i) => {
    const d = advanceDate(base, i, cfg.recurrence);
    return {
      label: qty === 1 ? 'Mensalidade' : `Parcela ${i + 1}/${qty}`,
      monthRef: monthRef(d),
      value: cfg.adjustments?.[i] ?? cfg.firstValue,
      dueDate: fmt(d),
      type: 'mensalidade' as const,
      isRecurring: i === qty - 1 && qty > 0,
    };
  });
}

// ─── generateSchedule (API legada — retrocompatibilidade) ─────────────────────

export function generateSchedule(params: ScheduleParams): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const base = isoToDate(params.firstDate);
  const qty = Math.min(params.installments, 360);

  for (let i = 0; i < qty; i++) {
    const d = advanceDate(base, i, params.recurrence);
    rows.push({
      installment: i + 1,
      label: `Parcela ${i + 1}/${qty}`,
      monthRef: monthRef(d),
      value: params.adjustments?.[i] ?? params.firstValue,
      dueDate: fmt(d),
      type: 'mensalidade',
    });
  }
  return rows;
}

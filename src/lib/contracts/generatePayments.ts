/**
 * generatePayments — pure function that produces payment drafts for a contract.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 * Properties: 16 (count + unique due_dates), 17 (financial sum), 18 (idempotence)
 *
 * Suporta três modos:
 *   - Mensal fixo (padrão): recurringValue igual para todos os meses
 *   - Evolutivo: evolutiveSchedule define o valor de cada mês; o último valor
 *     se repete até durationMonths
 *   - Variável: gera apenas o lançamento fixo mensal (a parcela variável é
 *     gerada separadamente via contract_variable_results)
 */

export interface EvolutiveEntry {
  /** 1-based month index */
  month: number;
  value: number;
}

export interface GeneratePaymentsParams {
  contractId: string;
  title: string;
  recurringValue: number;
  durationMonths: number;
  /** ISO date string, e.g. "2025-01-10" — data de vencimento do 1º pagamento */
  firstPaymentDueDate: string;
  /**
   * Dia do mês escolhido para os demais pagamentos (1–28).
   * Quando informado, aplica a regra dos 25 dias:
   *   - Se o dia escolhido resultar em menos de 25 dias após o 1º pagamento,
   *     o 2º vencimento é jogado para o mês seguinte.
   * Quando ausente, usa o mesmo dia do firstPaymentDueDate para todos os meses.
   */
  recurringDueDay?: number;
  /** 0 or undefined = no setup */
  setupInstallments?: number;
  /** Value per setup installment (pre-calculated, including fees) */
  setupParcelValue?: number;
  /**
   * Cronograma evolutivo — array de entradas {month, value} ordenado por month.
   * O último valor se repete para todos os meses subsequentes até durationMonths.
   * Quando presente, substitui recurringValue para os meses recorrentes.
   */
  evolutiveSchedule?: EvolutiveEntry[];
}

export interface PaymentDraft {
  contract_id: string;
  /** ISO date string */
  due_date: string;
  value: number;
  description: string;
  status: 'pendente';
}

/**
 * Retorna o valor recorrente para um determinado mês (1-based) levando em
 * conta o cronograma evolutivo. Se não houver schedule, retorna recurringValue.
 */
function getRecurringValueForMonth(
  monthIndex: number,
  recurringValue: number,
  evolutiveSchedule?: EvolutiveEntry[]
): number {
  if (!evolutiveSchedule || evolutiveSchedule.length === 0) return recurringValue;

  // Ordena por mês para garantir a busca correta
  const sorted = [...evolutiveSchedule].sort((a, b) => a.month - b.month);

  // Encontra a última entrada cujo mês <= monthIndex
  let value = sorted[0].value;
  for (const entry of sorted) {
    if (entry.month <= monthIndex) value = entry.value;
    else break;
  }
  return value;
}

/**
 * Generates exactly `durationMonths` payment drafts for a contract.
 *
 * Months 1..setupInstallments (1-based):
 *   value = setupParcelValue + recurringValue(month)
 *   description = "[title] • Mensalidade + Setup ([X]/[N])"
 *
 * Months setupInstallments+1..durationMonths:
 *   value = recurringValue(month)
 *   description = "[title] • Mensalidade" ou "[title] • Mensalidade (evolutiva)"
 *
 * When no setup (setupInstallments = 0 or undefined):
 *   all months use recurringValue(month) with appropriate description
 *
 * Date arithmetic uses UTC to avoid DST issues.
 */
export function generatePayments(params: GeneratePaymentsParams): PaymentDraft[] {
  const {
    contractId,
    title,
    recurringValue,
    durationMonths,
    firstPaymentDueDate,
    recurringDueDay,
    setupInstallments = 0,
    setupParcelValue = 0,
    evolutiveSchedule,
  } = params;

  const isEvolutive = evolutiveSchedule && evolutiveSchedule.length > 0;

  // Parse the first payment due date (ISO format: "YYYY-MM-DD")
  const [yearStr, monthStr, dayStr] = firstPaymentDueDate.split('-');
  const firstYear  = parseInt(yearStr,  10);
  const firstMonth = parseInt(monthStr, 10) - 1; // 0-based
  const firstDay   = parseInt(dayStr,   10);

  // Data UTC do 1º pagamento
  const firstDate = new Date(Date.UTC(firstYear, firstMonth, firstDay));

  /**
   * Calcula a data do i-ésimo pagamento recorrente (i = 0 → 1º recorrente, após o 1º).
   *
   * Regra dos 25 dias:
   *   - O 1º pagamento recorrente (i=0) tem dia = recurringDueDay no mês seguinte ao 1º pag.
   *   - Se a diferença entre essa data e o 1º pagamento for < 25 dias, pula mais um mês.
   *   - Os pagamentos seguintes (i>0) seguem normalmente o dia escolhido mês a mês.
   */
  const getRecurringDate = (i: number): Date => {
    const day = recurringDueDay ?? firstDay;
    // Mês base: 1 mês após o 1º pagamento
    let targetMonth = firstMonth + 1 + i;
    let targetYear  = firstYear;
    // Normaliza overflow de meses
    targetYear  += Math.floor(targetMonth / 12);
    targetMonth  = targetMonth % 12;

    // Para o 1º recorrente (i=0), aplica regra dos 25 dias
    if (i === 0 && recurringDueDay !== undefined) {
      const candidate = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth))));
      const diffDays = Math.floor((candidate.getTime() - firstDate.getTime()) / 86_400_000);
      if (diffDays < 25) {
        // Pula mais um mês
        targetMonth += 1;
        targetYear  += Math.floor(targetMonth / 12);
        targetMonth  = targetMonth % 12;
      }
    }

    const maxDay = daysInMonth(targetYear, targetMonth);
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, maxDay)));
  };

  const effectiveSetupInstallments = setupInstallments ?? 0;

  // Pre-compute setup totals for rounding distribution
  const setupTotal = effectiveSetupInstallments > 0
    ? Math.round(setupParcelValue * effectiveSetupInstallments * 100) / 100
    : 0;
  const setupPerInstallment = effectiveSetupInstallments > 0
    ? Math.round((setupTotal / effectiveSetupInstallments) * 100) / 100
    : 0;
  const setupResidual = effectiveSetupInstallments > 0
    ? Math.round((setupTotal - setupPerInstallment * (effectiveSetupInstallments - 1)) * 100) / 100
    : 0;

  const drafts: PaymentDraft[] = [];

  for (let i = 0; i < durationMonths; i++) {
    const monthIndex = i + 1; // 1-based

    // 1º pagamento usa firstPaymentDueDate; demais usam getRecurringDate
    const dueDate = i === 0
      ? firstDate
      : getRecurringDate(i - 1);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const monthRecurring = getRecurringValueForMonth(monthIndex, recurringValue, evolutiveSchedule);

    let value: number;
    let description: string;

    if (effectiveSetupInstallments > 0 && monthIndex <= effectiveSetupInstallments) {
      const isLastSetup = monthIndex === effectiveSetupInstallments;
      const setupAmount = isLastSetup ? setupResidual : setupPerInstallment;
      value = setupAmount !== 0 ? round2(setupAmount + monthRecurring) : monthRecurring;
      description = `${title} • Mensalidade + Setup (${monthIndex}/${effectiveSetupInstallments})`;
    } else {
      value = monthRecurring;
      description = isEvolutive
        ? `${title} • Mensalidade (evolutiva)`
        : `${title} • Mensalidade`;
    }

    drafts.push({
      contract_id: contractId,
      due_date: dueDateStr,
      value,
      description,
      status: 'pendente',
    });
  }

  return drafts;
}

/** Número de dias em um mês (ano e mês 0-based) */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Round to 2 decimal places using standard rounding. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

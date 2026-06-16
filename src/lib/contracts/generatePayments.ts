/**
 * generatePayments — pure function that produces payment drafts for a contract.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 * Properties: 16 (count + unique due_dates), 17 (financial sum), 18 (idempotence)
 */

export interface GeneratePaymentsParams {
  contractId: string;
  title: string;
  recurringValue: number;
  durationMonths: number;
  /** ISO date string, e.g. "2025-01-10" */
  firstPaymentDueDate: string;
  /** 0 or undefined = no setup */
  setupInstallments?: number;
  /** Value per setup installment (pre-calculated, including fees) */
  setupParcelValue?: number;
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
 * Generates exactly `durationMonths` payment drafts for a contract.
 *
 * Months 1..setupInstallments (1-based):
 *   value = setupParcelValue + recurringValue
 *   description = "[title] • Mensalidade + Setup ([X]/[N])"
 *
 * Months setupInstallments+1..durationMonths:
 *   value = recurringValue
 *   description = "[title] • Mensalidade"
 *
 * When no setup (setupInstallments = 0 or undefined):
 *   all months use recurringValue with description "[title] • Mensalidade"
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
    setupInstallments = 0,
    setupParcelValue = 0,
  } = params;

  // Parse the first payment due date (ISO format: "YYYY-MM-DD")
  const [yearStr, monthStr, dayStr] = firstPaymentDueDate.split('-');
  const baseYear = parseInt(yearStr, 10);
  const baseMonth = parseInt(monthStr, 10) - 1; // 0-based for Date.UTC
  const baseDay = parseInt(dayStr, 10);

  const effectiveSetupInstallments = setupInstallments ?? 0;

  const drafts: PaymentDraft[] = [];

  for (let i = 0; i < durationMonths; i++) {
    // 1-based month index
    const monthIndex = i + 1;

    // Compute due_date using UTC arithmetic to avoid DST shifts
    const dueDate = new Date(Date.UTC(baseYear, baseMonth + i, baseDay));
    const dueDateStr = dueDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

    let value: number;
    let description: string;

    if (effectiveSetupInstallments > 0 && monthIndex <= effectiveSetupInstallments) {
      // Setup + recurring months
      value = round2(setupParcelValue + recurringValue);
      description = `${title} • Mensalidade + Setup (${monthIndex}/${effectiveSetupInstallments})`;
    } else {
      // Pure recurring months
      value = recurringValue;
      description = `${title} • Mensalidade`;
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

/** Round to 2 decimal places using standard rounding. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

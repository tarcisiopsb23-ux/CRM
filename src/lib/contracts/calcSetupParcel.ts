/**
 * Calculates the value of each setup installment.
 * Formula: round((total * (1 + fees/100)) / installments, 2)
 *
 * @param total - Total setup value (> 0)
 * @param installments - Number of installments (integer 1–12)
 * @param fees - Interest/fees percentage (0–100), default 0
 * @returns Value per installment rounded to 2 decimal places
 */
export function calcSetupParcel(total: number, installments: number, fees: number = 0): number {
  return Math.round((total * (1 + fees / 100)) / installments * 100) / 100;
}

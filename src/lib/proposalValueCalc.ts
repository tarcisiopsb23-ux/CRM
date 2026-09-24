// src/lib/proposalValueCalc.ts

export interface ProposalServiceInput {
  value: number;
  is_bonus: boolean;
}

export interface ValueComparison {
  totalIndividual: number;
  planValue: number;
  savings: number;
  savingsPercent: number;
}

/**
 * Calcula o comparativo de valor da proposta.
 * P1: totalIndividual = soma(service.value para todos os serviços)
 *     savings = totalIndividual − planValue
 *     savingsPercent = (savings / totalIndividual) × 100
 */
export function calcValueComparison(
  services: ProposalServiceInput[],
  planValue: number
): ValueComparison {
  const totalIndividual = services.reduce((sum, s) => sum + s.value, 0);
  const savings = totalIndividual - planValue;
  const savingsPercent = totalIndividual > 0
    ? (savings / totalIndividual) * 100
    : 0;
  return { totalIndividual, planValue, savings, savingsPercent };
}

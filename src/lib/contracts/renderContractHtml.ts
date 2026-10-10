import type { ContractAssemblyResult } from '../../types/contracts';
import { applyClauseEdits } from './applyClauseEdits';

/**
 * Produces the final contract HTML by applying inline clause edits
 * to the assembled HTML. Called both in the Review Modal and when
 * dispatching the webhook payload.
 *
 * Requirements: 9.3, 9.7
 */
export function renderContractHtml(
  assembled: ContractAssemblyResult,
  clauseEdits: Record<string, string> = {}
): string {
  return applyClauseEdits(assembled.html, clauseEdits);
}

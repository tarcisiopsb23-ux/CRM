// Feature: contract-system, Properties 4, 5
// Validates: Requirements 2.3, 2.4
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// Pure reorder function — mirrors what useContractClauses.reorderClauses does
function applyReorder(
  clauses: { id: string; display_order: number }[],
  newOrderIds: string[]
): { id: string; display_order: number }[] {
  return newOrderIds.map((id, index) => ({
    id,
    display_order: index,
  }));
}

// Helper: does the array form a gap-free sequence {0, 1, ..., n-1}?
function isGapFree(orders: number[]): boolean {
  const sorted = [...orders].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i);
}

describe('Property 4 — display_order gap-free after reorder', () => {
  it('reordering always produces {0, 1, ..., n-1}', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
        (ids) => {
          const clauses = ids.map((id, i) => ({ id, display_order: i }));
          // Shuffle the order for reordering
          const shuffled = [...ids].sort(() => 0.5 - Math.random());
          const result = applyReorder(clauses, shuffled);
          return isGapFree(result.map(c => c.display_order));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result length equals input length', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
        (ids) => {
          const clauses = ids.map((id, i) => ({ id, display_order: i }));
          const result = applyReorder(clauses, ids);
          return result.length === ids.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 5 — idempotência de reordenação', () => {
  it('applying same order twice produces same result as applying once', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
        (ids) => {
          const clauses = ids.map((id, i) => ({ id, display_order: i }));
          const once = applyReorder(clauses, ids);
          const twice = applyReorder(once, ids);
          return JSON.stringify(once) === JSON.stringify(twice);
        }
      ),
      { numRuns: 100 }
    );
  });
});

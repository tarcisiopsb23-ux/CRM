// Feature: contract-system, Properties 16, 17, 18
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { generatePayments } from '../generatePayments';

/**
 * Arbitrary for valid GeneratePaymentsParams.
 *
 * Constraints:
 *  - setupInstallments ≤ durationMonths (a setup cannot outlast the contract)
 *  - recurringValue and setupParcelValue are non-negative finite floats
 *  - firstPaymentDueDate is fixed to avoid date-arithmetic edge cases
 */
const paramsArb = fc.record({
  contractId: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  recurringValue: fc.float({ min: 0, max: 10_000, noNaN: true }),
  durationMonths: fc.integer({ min: 1, max: 24 }),
  firstPaymentDueDate: fc.constant('2025-01-10'),
  setupInstallments: fc.integer({ min: 0, max: 12 }),
  setupParcelValue: fc.float({ min: 0, max: 5_000, noNaN: true }),
}).filter(p => p.setupInstallments <= p.durationMonths);

/**
 * Property 16 — Unicidade de lançamento por mês
 *
 * For any contract with duration_months = D, generatePayments produces exactly
 * D payment drafts, each with a distinct due_date.
 *
 * Validates: Requirements 8.1, 8.2
 */
describe('Property 16 — unicidade de lançamento por mês', () => {
  it('generates exactly durationMonths records with distinct due_dates', () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const drafts = generatePayments(params);
        const countOk = drafts.length === params.durationMonths;
        const dates = drafts.map(d => d.due_date);
        const uniqueDates = new Set(dates).size === dates.length;
        return countOk && uniqueDates;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 17 — Soma financeira total dos lançamentos
 *
 * sum(drafts.map(p => p.value)) =
 *   recurringValue * durationMonths + round(setupParcelValue * setupInstallments, 2)
 *
 * A tolerance of 0.05 is used to account for float rounding on individual values.
 *
 * Validates: Requirements 8.3, 8.4, 8.5
 */
describe('Property 17 — soma financeira total', () => {
  it('sum of values equals recurring*D + round(setupTotal, 2)', () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const drafts = generatePayments(params);
        const sum = drafts.reduce((acc, d) => acc + d.value, 0);
        const setupTotal = params.setupInstallments > 0
          ? Math.round(params.setupParcelValue * params.setupInstallments * 100) / 100
          : 0;
        const expected = params.recurringValue * params.durationMonths + setupTotal;
        return Math.abs(sum - expected) < 0.05; // tolerance for float rounding
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 18 — Idempotência de geração de lançamentos
 *
 * Calling generatePayments twice with the same params produces identical results.
 * The function is pure and deterministic — no randomness, no side effects.
 *
 * Validates: Requirements 8.8
 */
describe('Property 18 — idempotência de geração', () => {
  it('calling generatePayments twice with same params produces identical results', () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const first = generatePayments(params);
        const second = generatePayments(params);
        return JSON.stringify(first) === JSON.stringify(second);
      }),
      { numRuns: 100 }
    );
  });
});

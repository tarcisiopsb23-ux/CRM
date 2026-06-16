// Feature: contract-system, Property 13: Invariante de cálculo de parcela de setup
// Validates: Requirements 6.4
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { calcSetupParcel } from '../calcSetupParcel';

describe('Property 13 — calcSetupParcel invariant', () => {
  it('matches formula: round((total * (1 + fees/100)) / installments, 2)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true }),
        fc.integer({ min: 1, max: 12 }),
        fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        (total, installments, fees) => {
          const result = calcSetupParcel(total, installments, fees);
          const expected = Math.round((total * (1 + fees / 100)) / installments * 100) / 100;
          return Math.abs(result - expected) < 0.01;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result is always >= 0 for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true }),
        fc.integer({ min: 1, max: 12 }),
        fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        (total, installments, fees) => calcSetupParcel(total, installments, fees) >= 0
      ),
      { numRuns: 100 }
    );
  });
});

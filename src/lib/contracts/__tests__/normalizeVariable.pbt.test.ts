// Feature: contract-system, Property 7: Determinismo de normalização de variável dinâmica
// Validates: Requirements 3.3
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { normalizeVariableIdentifier } from '../normalizeVariable';

describe('Property 7 — normalizeVariableIdentifier determinism', () => {
  it('always returns the same result for the same input', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        return normalizeVariableIdentifier(name) === normalizeVariableIdentifier(name);
      }),
      { numRuns: 100 }
    );
  });

  it('result never exceeds 50 characters', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        return normalizeVariableIdentifier(name).length <= 50;
      }),
      { numRuns: 100 }
    );
  });

  it('result never starts or ends with underscore', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const result = normalizeVariableIdentifier(name);
        return !result.startsWith('_') && !result.endsWith('_');
      }),
      { numRuns: 100 }
    );
  });

  it('result only contains [a-z0-9_]', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        return /^[a-z0-9_]*$/.test(normalizeVariableIdentifier(name));
      }),
      { numRuns: 100 }
    );
  });
});

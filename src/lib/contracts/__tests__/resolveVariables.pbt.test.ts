// Feature: contract-system, Property 8: Substituição total de variáveis no HTML final
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { resolveVariables } from '../resolveVariables';

const VARIABLE_PATTERN = /\{\{([a-z_]{1,50})\}\}/g;

// Arbitrário que gera templates com variáveis válidas
const variableNameArb = fc.stringMatching(/^[a-z_]{1,15}$/);
const varMapArb = fc.dictionary(variableNameArb, fc.string({ maxLength: 50 }));

describe('Property 8 — resolveVariables total substitution', () => {
  it('output contains no remaining {{...}} patterns when all vars are provided', () => {
    fc.assert(
      fc.property(varMapArb, (vars) => {
        // Build a template from the keys
        const template = Object.keys(vars).map(k => `{{${k}}}`).join(' text ');
        const { output } = resolveVariables(template, vars);
        return !VARIABLE_PATTERN.test(output);
      }),
      { numRuns: 100 }
    );
  });

  it('unresolved variables appear in unresolved array and not in output', () => {
    fc.assert(
      fc.property(
        variableNameArb,
        fc.string({ maxLength: 20 }),
        (varName, surrounding) => {
          const template = `${surrounding}{{${varName}}}${surrounding}`;
          const { output, unresolved } = resolveVariables(template, {});
          const noMarker = !output.includes(`{{${varName}}}`);
          const inUnresolved = unresolved.includes(varName);
          return noMarker && inUnresolved;
        }
      ),
      { numRuns: 100 }
    );
  });
});

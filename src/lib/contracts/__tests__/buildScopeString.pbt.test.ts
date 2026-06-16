// Feature: contract-system, Property 12: Escopo cresce monotonicamente com serviços
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { buildScopeString } from '../buildScopeString';
import type { SelectedService } from '../../../types/contracts';

const selectedServiceArb = fc.record({
  service_id: fc.uuid(),
  service_name: fc.string({ minLength: 1, maxLength: 30 }),
  sub_service_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.oneof(fc.string(), fc.integer(), fc.boolean())
  ),
}) as fc.Arbitrary<SelectedService>;

describe('Property 12 — buildScopeString monotonic growth', () => {
  it('adding a service never reduces the scope string length', () => {
    fc.assert(
      fc.property(
        fc.array(selectedServiceArb),
        selectedServiceArb,
        (services, extra) => {
          const before = buildScopeString(services).length;
          const after = buildScopeString([...services, extra]).length;
          return after >= before;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty array always returns empty string', () => {
    fc.assert(
      fc.property(fc.constant([] as import("../../../types/contracts").SelectedService[]), (arr) => buildScopeString(arr) === ''),
      { numRuns: 1 }
    );
  });
});

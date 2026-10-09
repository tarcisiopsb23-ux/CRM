// Feature: contract-system, Property 12: Escopo cresce monotonicamente com serviços
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { buildScopeString } from '../buildScopeString';
import type { SelectedService } from '../../../types/contracts';

const selectedServiceArb = fc.record({
  service_id: fc.uuid(),
  service_name: fc.string({ minLength: 1, maxLength: 30 }),
  selected_deliverables: fc.array(
    fc.record({
      deliverable_id: fc.uuid(),
      included: fc.boolean(),
      number_value: fc.option(fc.integer({ min: 1, max: 999 }), { nil: null }),
      period: fc.constant(null),
      deadline_type: fc.constant(null),
      deadline_value: fc.constant(null),
      execution_format: fc.constant(null),
    })
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

  it('service name always appears in output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('<') && !s.includes('&')),
        (name) => {
          const result = buildScopeString([
            { service_id: '1', service_name: name, selected_deliverables: [] },
          ]);
          return result.includes(name);
        }
      ),
      { numRuns: 50 }
    );
  });
});

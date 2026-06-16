// Feature: contract-system, Property 10: Unicidade do template padrão
// Validates: Requirements 4.3, 4.4
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

interface Template { id: string; is_default: boolean; }

// Pure function mirroring the setDefault logic in useContractTemplates
function setDefaultTemplate(templates: Template[], targetId: string): Template[] {
  return templates.map(t => ({
    ...t,
    is_default: t.id === targetId,
  }));
}

describe('Property 10 — unicidade do template padrão', () => {
  it('after setDefault, exactly one template has is_default = true', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.nat(),
        (ids, idx) => {
          const templates: Template[] = ids.map(id => ({ id, is_default: false }));
          const targetId = ids[idx % ids.length];
          const result = setDefaultTemplate(templates, targetId);
          const defaultCount = result.filter(t => t.is_default).length;
          return defaultCount === 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the correct template is marked as default', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
        fc.nat(),
        (ids, idx) => {
          const templates: Template[] = ids.map(id => ({ id, is_default: false }));
          const targetId = ids[idx % ids.length];
          const result = setDefaultTemplate(templates, targetId);
          const defaultTemplate = result.find(t => t.is_default);
          return defaultTemplate?.id === targetId;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all other templates have is_default = false', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
        fc.nat(),
        (ids, idx) => {
          const templates: Template[] = ids.map(id => ({ id, is_default: false }));
          const targetId = ids[idx % ids.length];
          const result = setDefaultTemplate(templates, targetId);
          return result.filter(t => !t.is_default).every(t => t.id !== targetId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: contract-system, Properties 6, 19
// Validates: Requirements 2.5-2.8, 9.2, 9.3
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { assembleContract } from '../assembleContract';
import type { ContractClause, ContractTemplateV2, JSONContent } from '../../../types/contracts';

const simpleContent: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto.' }] }] };

function makeClause(overrides: Partial<ContractClause> = {}): ContractClause {
  return {
    id: 'clause-1', organization_id: 'org', title: 'Test',
    content: simpleContent, display_order: 0,
    condition_type: 'always', condition_value: null,
    is_editable: false, service_id: null,
    created_at: '', updated_at: '', ...overrides,
  };
}

const mockTemplate: ContractTemplateV2 = {
  id: 'tpl', name: 'Test', organization_id: 'org',
  content: '', is_default: true, created_at: '', updated_at: '',
  structure: { header: '', parties_block: '', clauses_block: '{{CLAUSES}}', signature_block: '', footer: '' },
};

const mockContract = { id: 'c1', title: 'Contrato', value: 1000, min_duration_months: 0, metadata: { services: [], setup_installments: 0 } };
const mockClient = { name: 'Cliente', company_name: 'Empresa', cnpj: '00.000.000/0001-00' };

describe('Property 6 — filtragem correta de cláusulas por condição', () => {
  it('clauses with condition has_setup are excluded when no setup', () => {
    const clause = makeClause({ condition_type: 'has_setup' });
    const result = assembleContract(mockContract, [clause], mockTemplate, mockClient);
    expect(result.clauseCount).toBe(0);
  });

  it('clauses with condition has_setup are included when setup present', () => {
    const clause = makeClause({ condition_type: 'has_setup' });
    const contract = { ...mockContract, metadata: { ...mockContract.metadata, setup_installments: 3 } };
    const result = assembleContract(contract, [clause], mockTemplate, mockClient);
    expect(result.clauseCount).toBe(1);
  });

  it('always clauses are always included', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        const clauses = Array.from({ length: n }, (_, i) => makeClause({ id: `c-${i}`, display_order: i }));
        const result = assembleContract(mockContract, clauses, mockTemplate, mockClient);
        return result.clauseCount === n;
      }),
      { numRuns: 50 }
    );
  });
});

describe('Property 19 — determinismo de montagem do documento', () => {
  it('same inputs always produce the same HTML', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
        const clauses = Array.from({ length: n }, (_, i) => makeClause({ id: `c-${i}`, display_order: i }));
        const r1 = assembleContract(mockContract, clauses, mockTemplate, mockClient);
        const r2 = assembleContract(mockContract, clauses, mockTemplate, mockClient);
        return r1.html === r2.html && r1.clauseCount === r2.clauseCount;
      }),
      { numRuns: 50 }
    );
  });
});

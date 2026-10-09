/**
 * Smoke tests — pure functions checkpoint (Task 5.3)
 *
 * Verifies that all 5 pure-function files are importable and return correct
 * output on the canonical examples from the spec.
 *
 * Requirements: 3.1, 3.3, 4.1, 4.3, 5.1
 */

import { describe, it, expect } from 'vitest';
import { normalizeVariableIdentifier } from '../normalizeVariable';
import { calcSetupParcel } from '../calcSetupParcel';
import { buildScopeString } from '../buildScopeString';
import { resolveVariables } from '../resolveVariables';
import { generatePayments } from '../generatePayments';

// ---------------------------------------------------------------------------
// normalizeVariableIdentifier
// ---------------------------------------------------------------------------
describe('normalizeVariableIdentifier', () => {
  it('converts "Captação de Vídeo" to "captacao_de_video"', () => {
    expect(normalizeVariableIdentifier('Captação de Vídeo')).toBe('captacao_de_video');
  });

  it('produces lowercase output only', () => {
    const result = normalizeVariableIdentifier('ABC DEF');
    expect(result).toBe(result.toLowerCase());
  });

  it('never exceeds 50 characters', () => {
    const long = 'a'.repeat(200);
    expect(normalizeVariableIdentifier(long).length).toBeLessThanOrEqual(50);
  });

  it('never starts or ends with underscore', () => {
    const result = normalizeVariableIdentifier('  Olá mundo  ');
    expect(result).not.toMatch(/^_|_$/);
  });

  it('matches charset [a-z0-9_]*', () => {
    const result = normalizeVariableIdentifier('Hello World! @#$');
    expect(result).toMatch(/^[a-z0-9_]*$/);
  });
});

// ---------------------------------------------------------------------------
// calcSetupParcel
// ---------------------------------------------------------------------------
describe('calcSetupParcel', () => {
  it('returns 250 for (1000, 4, 0)', () => {
    expect(calcSetupParcel(1000, 4, 0)).toBe(250);
  });

  it('applies interest correctly: (1000, 2, 10) → 550', () => {
    // round((1000 * 1.10) / 2, 2) = 550
    expect(calcSetupParcel(1000, 2, 10)).toBe(550);
  });

  it('rounds to 2 decimal places', () => {
    const result = calcSetupParcel(100, 3, 0);
    // 100/3 = 33.333... → 33.33
    expect(result).toBe(33.33);
  });

  it('handles 1 installment without interest', () => {
    expect(calcSetupParcel(500, 1, 0)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// buildScopeString
// ---------------------------------------------------------------------------
describe('buildScopeString', () => {
  it('returns empty string for empty array', () => {
    expect(buildScopeString([])).toBe('');
  });

  it('formats a service with no deliverables — shows only service name', () => {
    const result = buildScopeString([
      { service_id: '1', service_name: 'Consultoria', selected_deliverables: [] },
    ]);
    expect(result).toContain('Consultoria');
  });

  it('formats a service with included deliverables', () => {
    const result = buildScopeString([
      {
        service_id: '1',
        service_name: 'Design',
        selected_deliverables: [
          { deliverable_id: 'd1', included: true, number_value: 10 },
          { deliverable_id: 'd2', included: false, number_value: 4 },
        ],
      },
    ]);
    // Only included deliverables appear; deliverable_id used as name fallback
    expect(result).toContain('Design');
    expect(result).toContain('d1');
    expect(result).not.toContain('d2');
  });

  it('joins multiple services separated by double newline content', () => {
    const result = buildScopeString([
      { service_id: '1', service_name: 'A', selected_deliverables: [] },
      { service_id: '2', service_name: 'B', selected_deliverables: [] },
    ]);
    // Both service names appear in the HTML output
    expect(result).toContain('A');
    expect(result).toContain('B');
  });
});

// ---------------------------------------------------------------------------
// resolveVariables
// ---------------------------------------------------------------------------
describe('resolveVariables', () => {
  it('replaces known variables correctly', () => {
    const { output, unresolved } = resolveVariables('Olá {{cliente}}', { cliente: 'João' });
    expect(output).toBe('Olá João');
    expect(unresolved).toEqual([]);
  });

  it('records unresolved variables and replaces them with empty string', () => {
    const { output, unresolved } = resolveVariables('Olá {{cliente}}', {});
    expect(output).toBe('Olá ');
    expect(unresolved).toContain('cliente');
  });

  it('handles template with no variables', () => {
    const { output, unresolved } = resolveVariables('Sem variáveis aqui.', {});
    expect(output).toBe('Sem variáveis aqui.');
    expect(unresolved).toEqual([]);
  });

  it('replaces multiple variables', () => {
    const { output } = resolveVariables('{{empresa}} — {{cnpj}}', {
      empresa: 'Agência C8',
      cnpj: '00.000.000/0001-00',
    });
    expect(output).toBe('Agência C8 — 00.000.000/0001-00');
  });
});

// ---------------------------------------------------------------------------
// generatePayments
// ---------------------------------------------------------------------------
describe('generatePayments', () => {
  it('returns exactly durationMonths records', () => {
    const payments = generatePayments({
      contractId: 'x',
      title: 'T',
      recurringValue: 100,
      durationMonths: 2,
      firstPaymentDueDate: '2025-01-10',
    });
    expect(payments.length).toBe(2);
  });

  it('all due_dates are distinct', () => {
    const payments = generatePayments({
      contractId: 'x',
      title: 'T',
      recurringValue: 100,
      durationMonths: 3,
      firstPaymentDueDate: '2025-01-10',
    });
    const dates = payments.map((p) => p.due_date);
    const unique = new Set(dates);
    expect(unique.size).toBe(3);
  });

  it('increments due_date by 1 month each step', () => {
    const payments = generatePayments({
      contractId: 'x',
      title: 'T',
      recurringValue: 50,
      durationMonths: 3,
      firstPaymentDueDate: '2025-01-10',
    });
    expect(payments[0].due_date).toBe('2025-01-10');
    expect(payments[1].due_date).toBe('2025-02-10');
    expect(payments[2].due_date).toBe('2025-03-10');
  });

  it('all payments use recurringValue when no setup', () => {
    const payments = generatePayments({
      contractId: 'x',
      title: 'T',
      recurringValue: 100,
      durationMonths: 2,
      firstPaymentDueDate: '2025-01-10',
    });
    payments.forEach((p) => {
      expect(p.value).toBe(100);
      expect(p.description).toMatch(/Mensalidade$/);
    });
  });

  it('setup installments add setup parcel value on first N months', () => {
    const payments = generatePayments({
      contractId: 'x',
      title: 'T',
      recurringValue: 100,
      durationMonths: 3,
      firstPaymentDueDate: '2025-01-10',
      setupInstallments: 2,
      setupParcelValue: 250,
    });
    // Months 1 and 2 → 250 + 100 = 350
    expect(payments[0].value).toBe(350);
    expect(payments[1].value).toBe(350);
    expect(payments[0].description).toMatch(/Setup \(1\/2\)/);
    expect(payments[1].description).toMatch(/Setup \(2\/2\)/);
    // Month 3 → only recurring
    expect(payments[2].value).toBe(100);
    expect(payments[2].description).toMatch(/Mensalidade$/);
  });

  it('all records have status "pendente"', () => {
    const payments = generatePayments({
      contractId: 'x',
      title: 'T',
      recurringValue: 100,
      durationMonths: 2,
      firstPaymentDueDate: '2025-01-10',
    });
    payments.forEach((p) => expect(p.status).toBe('pendente'));
  });

  it('all records carry the correct contract_id', () => {
    const payments = generatePayments({
      contractId: 'contract-abc',
      title: 'T',
      recurringValue: 100,
      durationMonths: 2,
      firstPaymentDueDate: '2025-01-10',
    });
    payments.forEach((p) => expect(p.contract_id).toBe('contract-abc'));
  });
});

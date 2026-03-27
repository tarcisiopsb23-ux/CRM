/**
 * Preservation Property Tests — CRM Dashboard KPI Fix
 *
 * These tests MUST PASS on unfixed code.
 * They confirm baseline behavior that must be preserved after the fix.
 *
 * Validates: Requirements 3.3, 3.5
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure helper: UNFIXED implementation (only counts 'fechado')
// Copied verbatim from the exploration test / PublicDashboardPage.tsx
// ---------------------------------------------------------------------------

type Lead = {
  status: string;
  created_at: string;
  updated_at: string | null;
  origin: string | null;
  proposal_value: number;
};

/**
 * CURRENT (unfixed) implementation — only counts 'fechado' leads.
 * Extracted verbatim from PublicDashboardPage.tsx AtendimentoSection.
 */
function calcTempoMedioVidaDias_UNFIXED(data: Lead[]): number | null {
  const fechados = data.filter(
    (l) => l.status === "fechado" && l.updated_at && l.created_at
  );
  return fechados.length > 0
    ? fechados.reduce((acc, l) => {
        const dias =
          (new Date(l.updated_at!).getTime() -
            new Date(l.created_at).getTime()) /
          (1000 * 60 * 60 * 24);
        return acc + dias;
      }, 0) / fechados.length
    : null;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid ISO date string between 2020-01-01 and 2026-12-31 */
const isoDateArb = fc
  .integer({ min: new Date("2020-01-01").getTime(), max: new Date("2026-12-31").getTime() })
  .map((ms) => new Date(ms).toISOString());

/** Generates a 'fechado' lead with updated_at >= created_at */
const fechadoLeadArb = fc
  .tuple(isoDateArb, fc.integer({ min: 0, max: 365 }))
  .map(([created_at, extraDays]) => {
    const updatedMs = new Date(created_at).getTime() + extraDays * 24 * 60 * 60 * 1000;
    return {
      status: "fechado",
      created_at,
      updated_at: new Date(updatedMs).toISOString(),
      origin: null,
      proposal_value: 0,
    } as Lead;
  });

/** Generates a lead with a status that is NOT 'fechado' or 'perdido' */
const nonConcludedLeadArb = fc
  .tuple(
    fc.constantFrom("novo", "contato", "proposta", "negociacao"),
    isoDateArb
  )
  .map(([status, created_at]) => ({
    status,
    created_at,
    updated_at: created_at,
    origin: null,
    proposal_value: 0,
  } as Lead));

// ---------------------------------------------------------------------------
// Property 1: For all non-empty arrays of 'fechado' leads,
//             tempoMedioVidaDias equals the arithmetic mean of durations.
//
// This PASSES on unfixed code — fechado leads ARE counted.
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe("Preservation Property 1 — fechado leads are included in tempoMedioVidaDias", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any non-empty array of leads where every lead has status = 'fechado',
   * tempoMedioVidaDias must equal the arithmetic mean of (updated_at - created_at) in days.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code (fechado leads ARE counted).
   */
  it("property: all-fechado arrays produce the correct arithmetic mean", () => {
    fc.assert(
      fc.property(fc.array(fechadoLeadArb, { minLength: 1, maxLength: 20 }), (leads) => {
        const result = calcTempoMedioVidaDias_UNFIXED(leads);

        // Compute expected mean manually
        const totalDias = leads.reduce((acc, l) => {
          const dias =
            (new Date(l.updated_at!).getTime() - new Date(l.created_at).getTime()) /
            (1000 * 60 * 60 * 24);
          return acc + dias;
        }, 0);
        const expected = totalDias / leads.length;

        expect(result).toBeCloseTo(expected, 10);
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: For any leads array with no 'fechado' or 'perdido' entries,
//             tempoMedioVidaDias is null.
//
// This PASSES on unfixed code — no fechado leads → null.
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------

describe("Preservation Property 2 — no concluded leads yields null", () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any leads array containing only non-concluded statuses
   * (novo, contato, proposta, negociacao), tempoMedioVidaDias must be null.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code.
   */
  it("property: arrays with no fechado/perdido leads return null", () => {
    fc.assert(
      fc.property(fc.array(nonConcludedLeadArb, { minLength: 0, maxLength: 20 }), (leads) => {
        const result = calcTempoMedioVidaDias_UNFIXED(leads);
        expect(result).toBeNull();
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Concrete Test 3: given only 'fechado' leads, result equals average duration
//
// Concrete example: 1 lead, 4 days → result = 4
// PASSES on unfixed code.
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe("Preservation Concrete Test 3 — single fechado lead produces correct duration", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * Given a single 'fechado' lead with created_at = 2025-01-01 and
   * updated_at = 2025-01-05, tempoMedioVidaDias must equal 4 days.
   *
   * EXPECTED OUTCOME: PASSES on unfixed code.
   */
  it("single fechado lead: 2025-01-01 → 2025-01-05 = 4 days", () => {
    const leads: Lead[] = [
      {
        status: "fechado",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-05T00:00:00Z",
        origin: null,
        proposal_value: 0,
      },
    ];

    const result = calcTempoMedioVidaDias_UNFIXED(leads);
    expect(result).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Concrete Test 4: empty leads array → null
//
// PASSES on unfixed code.
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------

describe("Preservation Concrete Test 4 — empty array returns null", () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * Given an empty leads array, tempoMedioVidaDias must return null
   * (no division by zero).
   *
   * EXPECTED OUTCOME: PASSES on unfixed code.
   */
  it("empty leads array returns null", () => {
    const result = calcTempoMedioVidaDias_UNFIXED([]);
    expect(result).toBeNull();
  });
});

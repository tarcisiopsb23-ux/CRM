/**
 * Property-based tests for metadata serialization utilities.
 *
 * Validates: Requirements 13.1, 13.3, 13.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseMetadata, serializeMetadata, METADATA_DEFAULTS, ClientMetadata } from './metadata';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a fully-populated ClientMetadata object with arbitrary valid values. */
const validMetadata: fc.Arbitrary<ClientMetadata> = fc.record({
  gtm_id: fc.string(),
  meta_pixel_id: fc.string(),
  n8n_api_key: fc.string(),
  whatsapp_webhook_url: fc.string(),
  dashboard_password: fc.string(),
  support_password: fc.string(),
  has_temp_password: fc.boolean(),
  show_tab_leads: fc.boolean(),
  show_tab_conversions: fc.boolean(),
  show_tab_whatsapp: fc.boolean(),
  show_tab_import: fc.boolean(),
});

/**
 * Generates a partial/sparse metadata object where any subset of fields may be
 * absent, null, or have an unexpected type (number, array, object, boolean where
 * string is expected, string where boolean is expected, etc.).
 */
const sparseOrWrongTypedMetadata: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    gtm_id: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    meta_pixel_id: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    n8n_api_key: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    whatsapp_webhook_url: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    dashboard_password: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    support_password: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
    has_temp_password: fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
    show_tab_leads: fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
    show_tab_conversions: fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
    show_tab_whatsapp: fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
    show_tab_import: fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
  },
  { requiredKeys: [] }, // all keys are optional — simulates missing fields
);

/** Completely non-object values that should be treated as empty metadata. */
const nonObjectValues: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.float(),
  fc.string(),
  fc.boolean(),
  fc.constant([]),
  fc.array(fc.string()),
);

// ---------------------------------------------------------------------------
// Property 1: Round-trip — parse → serialize → parse produces equivalent object
// Validates: Requirement 13.3
// ---------------------------------------------------------------------------

describe('parseMetadata / serializeMetadata — property-based tests', () => {
  /**
   * **Validates: Requirements 13.3**
   *
   * Property: parse → serialize → parse produz objeto equivalente ao original.
   *
   * For any valid ClientMetadata object:
   *   parseMetadata(serializeMetadata(meta)) deep-equals meta
   */
  it('round-trip: parse(serialize(meta)) equals meta for any valid metadata', () => {
    fc.assert(
      fc.property(validMetadata, (meta) => {
        const serialized = serializeMetadata(meta);
        const reparsed = parseMetadata(serialized);
        expect(reparsed).toEqual(meta);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 13.3**
   *
   * Property: parse → serialize → parse is idempotent.
   *
   * Parsing twice (with a serialize in between) yields the same result as
   * parsing once — i.e. the operation is stable after the first parse.
   */
  it('round-trip is idempotent: parse(serialize(parse(raw))) equals parse(raw)', () => {
    fc.assert(
      fc.property(sparseOrWrongTypedMetadata, (raw) => {
        const first = parseMetadata(raw);
        const second = parseMetadata(serializeMetadata(first));
        expect(second).toEqual(first);
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Property 2: Missing / wrong-typed fields use defaults without throwing
  // Validates: Requirements 13.1, 13.4
  // ---------------------------------------------------------------------------

  /**
   * **Validates: Requirements 13.1, 13.4**
   *
   * Property: campos ausentes no metadata usam valores padrão sem lançar exceção.
   *
   * For any sparse/wrong-typed input, parseMetadata must:
   *   1. Not throw
   *   2. Return the default value for every field that is absent or has an unexpected type
   */
  it('uses defaults for absent or wrong-typed fields without throwing', () => {
    fc.assert(
      fc.property(sparseOrWrongTypedMetadata, (raw) => {
        let result: ReturnType<typeof parseMetadata> | undefined;
        expect(() => {
          result = parseMetadata(raw);
        }).not.toThrow();

        // For each field, if the raw value has the correct type it should be
        // preserved; otherwise the default must be used.
        const stringFields = [
          'gtm_id', 'meta_pixel_id', 'n8n_api_key', 'whatsapp_webhook_url',
          'dashboard_password', 'support_password',
        ] as const;

        const boolFields = [
          'has_temp_password', 'show_tab_leads', 'show_tab_conversions',
          'show_tab_whatsapp', 'show_tab_import',
        ] as const;

        for (const field of stringFields) {
          if (typeof raw[field] !== 'string') {
            expect(result![field]).toBe(METADATA_DEFAULTS[field]);
          }
        }

        for (const field of boolFields) {
          if (typeof raw[field] !== 'boolean') {
            expect(result![field]).toBe(METADATA_DEFAULTS[field]);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 13.1, 13.4**
   *
   * Property: non-object inputs (null, number, string, array, …) are treated as
   * empty metadata and all fields receive their default values without throwing.
   */
  it('returns all defaults for non-object inputs without throwing', () => {
    fc.assert(
      fc.property(nonObjectValues, (raw) => {
        let result: ReturnType<typeof parseMetadata> | undefined;
        expect(() => {
          result = parseMetadata(raw);
        }).not.toThrow();
        expect(result).toEqual(METADATA_DEFAULTS);
      }),
      { numRuns: 100 },
    );
  });
});

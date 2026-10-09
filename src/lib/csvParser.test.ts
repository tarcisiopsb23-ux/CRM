/**
 * Property-based tests for csvParser.
 *
 * Validates: Requirements 11.8, 11.10
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseCsvFile } from './csvParser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a File object from a string content. */
function makeFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

/**
 * Builds a CSV string from a header row and data rows using the given separator.
 * Cell values are sanitised to avoid containing the separator itself.
 */
function buildCsv(
  headers: string[],
  rows: string[][],
  separator: ',' | ';',
): string {
  const sanitize = (v: string) => v.replace(/[,;\r\n]/g, '_');
  const headerLine = headers.map(sanitize).join(separator);
  const dataLines = rows.map((row) => row.map(sanitize).join(separator));
  return [headerLine, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string that won't accidentally contain separator characters. */
const safeCell = fc.string({ minLength: 1, maxLength: 20 }).map((s) =>
  s.replace(/[,;\r\n]/g, '_'),
);

/** A header row: 1–5 distinct-ish column names. */
const headerArb = fc.array(safeCell, { minLength: 1, maxLength: 5 });

/** One or more data rows matching a given column count. */
function rowsArb(colCount: number) {
  return fc.array(
    fc.array(safeCell, { minLength: colCount, maxLength: colCount }),
    { minLength: 1, maxLength: 20 },
  );
}

// ---------------------------------------------------------------------------
// Property 1: same row count regardless of separator (`,` or `;`)
// Validates: Requirements 11.8
// ---------------------------------------------------------------------------

describe('csvParser — property-based tests', () => {
  /**
   * **Validates: Requirements 11.8**
   *
   * Property: para qualquer CSV válido com separador `,` ou `;`, o parser
   * retorna o mesmo número de linhas de dados (excluindo o cabeçalho).
   *
   * For any set of headers + data rows, formatting the CSV with `,` vs `;`
   * must produce the same `rows.length` after parsing.
   */
  it('returns the same number of data rows regardless of separator (comma vs semicolon)', async () => {
    await fc.assert(
      fc.asyncProperty(headerArb, async (headers) => {
        const colCount = headers.length;
        const rows = await fc.sample(rowsArb(colCount), 1);
        const dataRows = rows[0];

        const csvComma = buildCsv(headers, dataRows, ',');
        const csvSemicolon = buildCsv(headers, dataRows, ';');

        const [resultComma, resultSemicolon] = await Promise.all([
          parseCsvFile(makeFile(csvComma)),
          parseCsvFile(makeFile(csvSemicolon)),
        ]);

        expect(resultComma.error).toBeUndefined();
        expect(resultSemicolon.error).toBeUndefined();
        expect(resultComma.rows.length).toBe(dataRows.length);
        expect(resultSemicolon.rows.length).toBe(dataRows.length);
        expect(resultComma.rows.length).toBe(resultSemicolon.rows.length);
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Property 2: files above 5 MB always return a size error
  // Validates: Requirements 11.10
  // ---------------------------------------------------------------------------

  /**
   * **Validates: Requirements 11.10**
   *
   * Property: arquivos acima de 5 MB sempre retornam erro de tamanho.
   *
   * For any content whose byte size exceeds 5 * 1024 * 1024, parseCsvFile must
   * resolve with a non-empty `error` string (never throw, never succeed).
   */
  it('always returns a size error for files larger than 5 MB', async () => {
    const MAX = 5 * 1024 * 1024;

    // Generate a small extra chunk (1–1024 bytes) to add on top of the 5 MB boundary.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1024 }),
        async (extraBytes) => {
          // Build content that is exactly MAX + extraBytes bytes.
          const base = 'a'.repeat(MAX);
          const extra = 'b'.repeat(extraBytes);
          const content = base + extra;

          const file = makeFile(content);
          // Sanity: file must actually exceed the limit.
          expect(file.size).toBeGreaterThan(MAX);

          const result = await parseCsvFile(file);

          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);
          expect(result.headers).toEqual([]);
          expect(result.rows).toEqual([]);
        },
      ),
      { numRuns: 50 },
    );
  });
});

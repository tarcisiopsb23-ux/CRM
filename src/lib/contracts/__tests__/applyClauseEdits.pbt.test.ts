// Feature: contract-system, Property 20: Preservação de edições inline no HTML final
// Validates: Requirements 9.6
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { applyClauseEdits } from '../applyClauseEdits';

// Build a minimal clause wrapper matching the format used by assembleContract
function wrapClause(id: string, content: string): string {
  return `<div data-clause-id="${id}" class="contract-clause"><h4 class="clause-title">Cláusula 1ª</h4><div class="clause-content">${content}</div></div>`;
}

/**
 * Extract the inner text of the .clause-content div for a given clause id.
 * Parses the pattern used by assembleContract/wrapClause.
 */
function extractClauseContent(html: string, id: string): string | null {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(
    new RegExp(
      `<div[^>]*data-clause-id="${escapedId}"[^>]*>[\\s\\S]*?<div class="clause-content">([\\s\\S]*?)</div>\\s*</div>`
    )
  );
  return match ? match[1] : null;
}

describe('Property 20 — applyClauseEdits preserves edits', () => {
  it('output contains exactly clauseEdits[id] for each edited clause', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 3, maxLength: 100 }).filter(s => !/<|>/.test(s)),
        fc.string({ minLength: 3, maxLength: 100 }).filter(s => !/<|>/.test(s)),
        (id, original, edited) => {
          fc.pre(original !== edited);
          const html = wrapClause(id, original);
          const result = applyClauseEdits(html, { [id]: edited });
          const content = extractClauseContent(result, id);
          // The clause-content div must now contain `edited`, not `original`
          return content === edited;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('untouched clauses are not modified', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id1, id2, content1, content2, edited2) => {
          fc.pre(id1 !== id2);
          const html = wrapClause(id1, content1) + wrapClause(id2, content2);
          const result = applyClauseEdits(html, { [id2]: edited2 });
          return result.includes(content1); // id1 content unchanged
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * applyClauseEdits — Pure function that applies inline clause edits to assembled contract HTML.
 *
 * For each [clause_id, editedHtml] pair in clauseEdits, replaces the inner content of
 * the `.clause-content` div inside the matching `<div data-clause-id="<id>">` wrapper.
 *
 * Uses regex replacement — no DOM dependency required.
 * Works in both browser and Node.js / jsdom (Vitest) environments.
 *
 * Requirements: 9.6
 * Property 20: output contains exactly clauseEdits[id] for each edited clause.
 */

/**
 * Applies inline clause edits to the assembled contract HTML.
 * For each [clause_id, editedHtml] pair in clauseEdits, replaces the
 * content of the matching <div data-clause-id="id"> wrapper's inner
 * .clause-content div with the edited HTML.
 *
 * Uses regex replacement — no DOM dependency required.
 * Property 20: output contains exactly clauseEdits[id] for each edited clause.
 */
export function applyClauseEdits(
  html: string,
  clauseEdits: Record<string, string>
): string {
  let result = html;
  for (const [clauseId, editedContent] of Object.entries(clauseEdits)) {
    // Escape the clause ID for use in a regex
    const escapedId = clauseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the clause wrapper div and replace its inner clause-content div.
    // Group 1: everything from the wrapper opening tag up to and including
    //           the opening <div class="clause-content"> tag.
    // Group 2: the original inner content (to be replaced).
    // Group 3: the closing </div> for clause-content + closing </div> for wrapper.
    const pattern = new RegExp(
      `(<div[^>]*data-clause-id="${escapedId}"[^>]*>[\\s\\S]*?<div class="clause-content">)([\\s\\S]*?)(</div>\\s*</div>)`,
      'g'
    );
    // Escape `$` in the replacement string to prevent backreference interpretation
    // (e.g. `$1`, `$&`, `$'` would otherwise be treated as regex replacement patterns).
    const safeReplacement = editedContent.replace(/\$/g, '$$$$');
    result = result.replace(pattern, `$1${safeReplacement}$3`);
  }
  return result;
}

/**
 * Browser-compatible entry point for applying clause edits.
 * Falls back to the regex implementation, which works in all environments
 * (browser, Node.js, jsdom) without requiring a DOM parser.
 */
export function applyClauseEditsDOM(
  html: string,
  clauseEdits: Record<string, string>
): string {
  // Regex implementation works in all environments — no DOMParser needed.
  return applyClauseEdits(html, clauseEdits);
}

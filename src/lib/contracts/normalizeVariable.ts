// src/lib/contracts/normalizeVariable.ts
// Pure string utilities for dynamic variable identifiers.
// Requirements: 3.3

/**
 * Converts an arbitrary string into a normalized variable identifier.
 *
 * Transformation rules (applied in order):
 * 1. Lowercase
 * 2. Remove accents (NFD decomposition + strip diacritics)
 * 3. Replace non-alphanumeric characters with `_`
 * 4. Collapse consecutive `_` into one
 * 5. Strip leading and trailing `_`
 * 6. Truncate to 50 characters
 *
 * May return an empty string for inputs consisting entirely of special characters.
 */
export function normalizeVariableIdentifier(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

/**
 * Wraps a normalized variable identifier in the dynamic scope template syntax.
 *
 * Example: "Gestão de Mídias" → "{{escopo_gestao_de_midias}}"
 */
export function normalizeServiceVariable(name: string): string {
  return `{{escopo_${normalizeVariableIdentifier(name)}}}`;
}

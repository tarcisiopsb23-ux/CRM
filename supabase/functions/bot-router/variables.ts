// ── variables.ts — Resolução de variáveis de template ────────────────────────

import type { ContactData } from './types.ts';

/**
 * Substitui expressões {{...}} em um template pelo valor correspondente.
 *
 * Variáveis suportadas:
 *   {{contact.name}}        → contact.name
 *   {{contact.phone}}       → contact.phone
 *   {{contact.email}}       → contact.email
 *   {{contact.external_id}} → contact.external_id
 *   {{var.X}}               → variables["X"]
 *
 * Variável não encontrada → string vazia (nunca lança erro).
 */
export function resolveVariables(
  template: string,
  variables: Record<string, string>,
  contact: ContactData
): string {
  return template
    .replace(/\{\{contact\.name\}\}/gi,        contact.name        ?? '')
    .replace(/\{\{contact\.phone\}\}/gi,       contact.phone       ?? '')
    .replace(/\{\{contact\.email\}\}/gi,       contact.email       ?? '')
    .replace(/\{\{contact\.external_id\}\}/gi, contact.external_id ?? '')
    .replace(/\{\{var\.([^}]+)\}\}/gi,         (_, v) => variables[v] ?? '');
}

/**
 * assembleContract — Pure function that assembles the full contract HTML.
 *
 * Steps:
 * 1. Validate template.structure exists
 * 2. Filter clauses by condition_type
 * 3. Sort by display_order ascending
 * 4. Build variable map from contract + client data
 * 5. Convert each clause's TipTap JSONContent to HTML
 * 6. Resolve variables in each clause HTML
 * 7. Inject clauses into template structure
 * 8. Build full HTML and do final variable resolution pass
 * 9. Return ContractAssemblyResult
 *
 * Requirements: 9.1, 9.2, 9.4, 9.8
 * Properties 6, 19
 */

import type {
  ContractClause,
  ContractTemplateV2,
  ContractAssemblyResult,
  SelectedService,
  JSONContent,
} from '../../types/contracts';
import { resolveVariables } from './resolveVariables';
import { buildScopeString } from './buildScopeString';

// ---------------------------------------------------------------------------
// Minimal contract shape needed for assembly
// ---------------------------------------------------------------------------
interface AssemblyContract {
  id: string;
  title: string;
  value: number;
  first_payment_due_date?: string | null;
  min_duration_months?: number;
  metadata?: {
    services?: SelectedService[];
    setup_installments?: number;
    setup_value?: number;
    setup_fees?: number;
    setup_first_due_date?: string;
    setup_payment_method?: string;
    setup_parcel_value?: number;
    clause_edits?: Record<string, string>;
  } | null;
}

interface AssemblyClient {
  name?: string | null;
  responsible_name?: string | null;
  company_name?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Ordinal suffix helper — 1→"1ª", 2→"2ª", etc.
// ---------------------------------------------------------------------------
function ordinal(n: number): string {
  return `${n}ª`;
}

// ---------------------------------------------------------------------------
// Minimal TipTap JSONContent → HTML converter (no TipTap dependency)
// Requirements: 3.7, 9.4
// ---------------------------------------------------------------------------
function jsonContentToHtml(node: JSONContent): string {
  if (!node) return '';

  // Text leaf node — apply marks
  if (node.type === 'text') {
    let text = node.text ?? '';
    // Apply marks in order
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`;
      else if (mark.type === 'italic') text = `<em>${text}</em>`;
      else if (mark.type === 'underline') text = `<u>${text}</u>`;
    }
    return text;
  }

  // Variable mention chip (custom node or TipTap Mention extension)
  if (node.type === 'mention' || node.type === 'variableMention') {
    const varName = (node.attrs?.id ?? node.attrs?.label ?? '') as string;
    return `{{${varName}}}`;
  }

  // Hard break
  if (node.type === 'hardBreak') return '<br>';

  // Recursively render children
  const childHtml = (node.content ?? []).map(jsonContentToHtml).join('');

  switch (node.type) {
    case 'doc':
      return childHtml;
    case 'paragraph':
      return `<p>${childHtml}</p>`;
    case 'bulletList':
      return `<ul>${childHtml}</ul>`;
    case 'orderedList':
      return `<ol>${childHtml}</ol>`;
    case 'listItem':
      return `<li>${childHtml}</li>`;
    default:
      return childHtml;
  }
}

// ---------------------------------------------------------------------------
// evaluateCondition — determines if a clause should be included
// Property 6: every included clause satisfies its condition; every excluded
//             clause does not.
// ---------------------------------------------------------------------------
function evaluateCondition(
  clause: ContractClause,
  contract: AssemblyContract
): boolean {
  switch (clause.condition_type) {
    case 'always':
      return true;

    case 'has_setup':
      return (contract.metadata?.setup_installments ?? 0) > 0;

    case 'has_min_duration':
      return (contract.min_duration_months ?? 0) > 0;

    case 'has_service': {
      const serviceIds =
        contract.metadata?.services?.map((s) => s.service_id) ?? [];
      return clause.service_id != null && serviceIds.includes(clause.service_id);
    }

    case 'has_setup_installments':
      return (contract.metadata?.setup_installments ?? 0) > 1;

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// assembleContract — core pure function
// ---------------------------------------------------------------------------
export function assembleContract(
  contract: AssemblyContract,
  clauses: ContractClause[],
  template: ContractTemplateV2,
  client: AssemblyClient
): ContractAssemblyResult {
  // Step 1 — Validate template structure
  if (!template.structure) {
    throw new Error(
      'O template selecionado não está configurado. Acesse Configurações → Contratos para configurar a estrutura do template.'
    );
  }

  const structure = template.structure;

  // Step 2 — Filter clauses by condition
  const filteredClauses = clauses.filter((clause) =>
    evaluateCondition(clause, contract)
  );

  // Step 3 — Sort by display_order ascending
  const sortedClauses = [...filteredClauses].sort(
    (a, b) => a.display_order - b.display_order
  );

  // Step 4 — Build variable map
  const scopeString = buildScopeString(contract.metadata?.services ?? []);

  const varMap: Record<string, string> = {
    cliente: client.name ?? client.responsible_name ?? '',
    empresa: client.company_name ?? '',
    cnpj: client.cnpj ?? '',
    cpf: client.cpf ?? '',
    valor: new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(contract.value),
    servicos: scopeString,
    escopo: scopeString,
    vencimento: contract.first_payment_due_date ?? '',
    primeiro_pagamento: contract.first_payment_due_date ?? '',
    data: new Date().toLocaleDateString('pt-BR'),
    consultor: '',
    cronograma: '',
    prazo_minimo: String(contract.min_duration_months ?? 0),
  };

  // Step 5 & 6 — Convert each clause to HTML, resolve variables, wrap
  const allUnresolved: string[] = [];
  const clauseHtmlParts: string[] = [];

  for (let i = 0; i < sortedClauses.length; i++) {
    const clause = sortedClauses[i];

    // Convert TipTap JSONContent to raw HTML
    const rawHtml = jsonContentToHtml(clause.content);

    // Resolve variables in clause content
    const { output: resolvedHtml, unresolved } = resolveVariables(rawHtml, varMap);
    allUnresolved.push(...unresolved);

    // Wrap with clause container
    const clauseNumber = ordinal(i + 1);
    const wrappedClause = `<div data-clause-id="${clause.id}" class="contract-clause"><h4 class="clause-title">Cláusula ${clauseNumber}</h4><div class="clause-content">${resolvedHtml}</div></div>`;
    clauseHtmlParts.push(wrappedClause);
  }

  // Step 7 — Inject clauses into template
  // Resolve variables in parties_block
  const { output: resolvedPartiesBlock, unresolved: partiesUnresolved } =
    resolveVariables(structure.parties_block, varMap);
  allUnresolved.push(...partiesUnresolved);

  // Replace {{CLAUSES}} marker in clauses_block
  const joinedClausesHtml = clauseHtmlParts.join('');
  const clauses_block_with_clauses = structure.clauses_block.replace(
    '{{CLAUSES}}',
    joinedClausesHtml
  );

  // Step 8 — Build full HTML
  const combinedHtml =
    structure.header +
    resolvedPartiesBlock +
    clauses_block_with_clauses +
    structure.signature_block +
    structure.footer;

  // Step 9 — Final variable resolution pass (covers header/footer/signature_block)
  const { output: finalHtml, unresolved: finalUnresolved } = resolveVariables(
    combinedHtml,
    varMap
  );
  allUnresolved.push(...finalUnresolved);

  // Step 10 — Return result
  return {
    html: finalHtml,
    resolvedVariables: varMap,
    unresolvedVariables: [...new Set(allUnresolved)],
    clauseCount: sortedClauses.length,
  };
}

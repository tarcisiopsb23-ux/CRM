// src/types/contracts.ts
// Base types for the Contract System redesign.
// Requirements: 1.4, 2.1, 4.1, 5.4, 9.1

import type { ContractTemplate } from './proposals';

// ---------------------------------------------------------------------------
// TipTap JSONContent — defined locally to avoid depending on @tiptap/core directly
// ---------------------------------------------------------------------------
export type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Requirement 1.4 — Sub-serviço tipado
// ---------------------------------------------------------------------------
export interface SubService {
  id: string;
  name: string;
  type: 'number' | 'text' | 'boolean' | 'select';
  /** Required when type === 'select'. Maximum 50 items. */
  options?: string[];
}

// ---------------------------------------------------------------------------
// Requirement 1.1 / 1.2 — Item do Catálogo de Serviços
// ---------------------------------------------------------------------------
export interface ServiceCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  sub_services: SubService[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Requirement 2.1 — Cláusula da Biblioteca de Cláusulas
// ---------------------------------------------------------------------------
export interface ContractClause {
  id: string;
  organization_id: string;
  title: string;
  /** TipTap JSONContent — stored as JSONB, rendered to HTML on output */
  content: JSONContent;
  display_order: number;
  condition_type:
    | 'always'
    | 'has_setup'
    | 'has_min_duration'
    | 'has_service'
    | 'has_setup_installments';
  condition_value: string | null;
  is_editable: boolean;
  /** FK → service_catalog(id) ON DELETE SET NULL */
  service_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Requirement 4.1 — Estrutura do Template de Contrato
// ---------------------------------------------------------------------------
export interface ContractTemplateStructure {
  /** HTML estático do cabeçalho (logotipo, dados da empresa) */
  header: string;
  /** HTML com placeholders {{cliente}}, {{empresa}}, etc. */
  parties_block: string;
  /** Deve conter o marcador "{{CLAUSES}}" onde as cláusulas são injetadas */
  clauses_block: string;
  /** HTML do bloco de assinaturas */
  signature_block: string;
  /** HTML do rodapé */
  footer: string;
}

// ---------------------------------------------------------------------------
// Requirement 4.1 — Extensão do ContractTemplate com estrutura v2
// ---------------------------------------------------------------------------
export interface ContractTemplateV2 extends ContractTemplate {
  structure: ContractTemplateStructure | null;
}

// ---------------------------------------------------------------------------
// Requirement 5.4 — Serviço selecionado num contrato
// ---------------------------------------------------------------------------
export interface SelectedService {
  service_id: string;
  service_name: string;
  sub_service_values: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Requirement 9.1 — Resultado da montagem automática do contrato
// ---------------------------------------------------------------------------
export interface ContractAssemblyResult {
  html: string;
  resolvedVariables: Record<string, string>;
  unresolvedVariables: string[];
  clauseCount: number;
}

// ---------------------------------------------------------------------------
// Requirements 5.4, 6.5, 9.6 — Extensão JSONB do metadata do contrato
// ---------------------------------------------------------------------------
export interface ContractMetadataExtension {
  // Bloco 2 — Serviços selecionados
  services: SelectedService[];

  // Bloco 2 — Setup / Taxa de Implantação (todos opcionais quando sem setup)
  setup_value?: number;
  setup_installments?: number;
  setup_parcel_value?: number;
  /** Percentual de juros/taxas, ex: 2.5 para 2,5% */
  setup_fees?: number;
  /** ISO date string, ex: "2025-01-10" */
  setup_first_due_date?: string;
  setup_payment_method?: string;

  // Bloco 3 — Snapshot de edições inline no Modal de Revisão
  /** Map of { [clause_id]: html_editado } — persisted per Requirement 9.6 */
  clause_edits?: Record<string, string>;
  /** Variables that had no value at document generation time (Requirement 3.6) */
  unresolved_variables?: string[];

  // Campos existentes preservados
  contract_type?: string;
  notes?: string;
  recurring_payment_method?: string;
}

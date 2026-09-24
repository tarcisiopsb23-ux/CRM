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
// Requirement 1.4 — Sub-serviço tipado (mantido para retrocompatibilidade com
// dados já persistidos no banco; não é mais utilizado na UI)
// ---------------------------------------------------------------------------
export interface SubService {
  id: string;
  name: string;
  type: 'number' | 'text' | 'boolean' | 'select';
  /** Required when type === 'select'. Maximum 50 items. */
  options?: string[];
}

// ---------------------------------------------------------------------------
// Entregável estruturado de um serviço (migration 062 + redesign v2)
// ---------------------------------------------------------------------------

/**
 * Tipo de entrega do entregável:
 *   recorrente — ocorre com periodicidade durante o contrato (ex: relatório mensal, reunião semanal)
 *   unico      — entregável único, acontece uma vez (ex: configuração inicial, setup, onboarding)
 *   pontual    — entregue conforme solicitação ou prazo acordado (ex: revisões avulsas, demandas)
 */
export type DeliverableType = 'recorrente' | 'unico' | 'pontual';

/**
 * Formato do entregável — determina o que o usuário preenche ao cadastrar o contrato:
 *
 *   texto   — valor fixo definido no cadastro do serviço (text_value).
 *             Não abre campo de preenchimento no contrato; o texto é exibido como está.
 *             Ex: "Licença ativa durante a vigência do contrato"
 *
 *   numero  — campo numérico preenchido no momento do contrato.
 *             Acompanha unidade livre (unit), ex: "horas", "revisões", "acessos".
 *             Quando delivery_type = 'recorrente', também solicita o período
 *             (dia / semana / mês / vigência / não indicar).
 */
export type DeliverableOutputFormat = 'texto' | 'numero';

/**
 * Período de recorrência — aplicável quando delivery_type = 'recorrente'
 * e output_format = 'numero'. Define a granularidade da quantidade.
 *
 *   dia        — ex: 2 posts por dia
 *   semana     — ex: 3 reuniões por semana
 *   mes        — ex: 4 relatórios por mês
 *   vigencia   — ex: 10 horas durante toda a vigência do contrato
 *   nao_indicar — quantidade definida mas sem período explícito no contrato
 */
export type DeliverablePeriod = 'dia' | 'semana' | 'mes' | 'vigencia' | 'nao_indicar';

/**
 * Tipo de prazo selecionável no cadastro do contrato (não no serviço).
 *
 *   dias       — prazo em número de dias corridos
 *   meses      — prazo em número de meses
 *   data_limite — data-alvo específica (ISO date string)
 */
export type DeadlineType = 'dias' | 'meses' | 'data_limite';

export interface ServiceDeliverable {
  /** UUID gerado no frontend */
  id: string;
  /** Nome do entregável, ex: "Relatório de Performance" */
  name: string;
  /** Tipo de entrega */
  delivery_type: DeliverableType;
  /**
   * Formato do entregável — define a experiência de preenchimento no contrato.
   * Padrão: 'numero' para compatibilidade com dados anteriores ao redesign.
   */
  output_format: DeliverableOutputFormat;
  /**
   * Texto fixo (somente quando output_format = 'texto').
   * Preenchido no cadastro do serviço; exibido como informação no contrato.
   * Ex: "Licença ativa durante toda a vigência do contrato."
   */
  text_value?: string | null;
  /**
   * Rótulo da unidade no singular (somente quando output_format = 'numero').
   * Ex: "hora", "revisão", "post", "acesso".
   */
  unit?: string | null;
  /**
   * Rótulo da unidade no plural (somente quando output_format = 'numero').
   * Usado quando number_value > 1. Ex: "horas", "revisões", "posts".
   * Se não preenchido, o singular é usado em ambos os casos.
   */
  unit_plural?: string | null;
}

// ---------------------------------------------------------------------------
// Entregável selecionado num contrato (preenchido no módulo clientes)
// ---------------------------------------------------------------------------

/**
 * Representa um entregável de um serviço dentro de um contrato.
 * Cada entregável do catálogo é opcional — o usuário decide se inclui ou não.
 */
export interface SelectedDeliverable {
  /** ID do ServiceDeliverable no catálogo */
  deliverable_id: string;
  /** true = incluído neste contrato; false = excluído */
  included: boolean;
  /**
   * Valor numérico preenchido (somente quando output_format = 'numero').
   * Ex: 10 (horas), 4 (posts), 2 (revisões)
   */
  number_value?: number | null;
  /**
   * Período de recorrência selecionado no contrato
   * (somente quando delivery_type = 'recorrente' e output_format = 'numero').
   */
  period?: DeliverablePeriod | null;
  /**
   * Tipo de prazo configurado no contrato para este entregável.
   * Opcional — o usuário pode ou não definir prazo.
   */
  deadline_type?: DeadlineType | null;
  /**
   * Valor do prazo:
   *   - Para 'dias' ou 'meses': número inteiro (ex: 30, 3)
   *   - Para 'data_limite': string ISO date (ex: "2025-12-31")
   */
  deadline_value?: number | string | null;
  /**
   * Formato de execução do entregável (somente quando o serviço tem
   * modalidade "Híbrida (consultiva e executiva)").
   *   consultivo — entregável de caráter estratégico/consultivo
   *   executivo  — entregável de caráter operacional/executivo
   */
  execution_format?: 'consultivo' | 'executivo' | null;
}

// ---------------------------------------------------------------------------
// Requirement 1.1 / 1.2 — Item do Catálogo de Serviços
// ---------------------------------------------------------------------------
export interface ServiceCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  category: string;
  /** Modalidade de entrega: "Consultiva" | "Executiva" | "Híbrida (consultiva e executiva)" */
  modality?: 'Consultiva' | 'Executiva' | 'Híbrida (consultiva e executiva)' | null;
  /** Descrição estratégica do serviço */
  description_text?: string | null;
  /** Escopo de atuação (ex: planejamento, gestão de campanhas, indicadores) */
  scope?: string | null;
  /** Lista de entregáveis estruturados */
  deliverables: ServiceDeliverable[];
  /**
   * @deprecated sub_services não é mais utilizado na UI. Mantido para
   * retrocompatibilidade com dados já persistidos no banco.
   */
  sub_services: SubService[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Requirement 2.1 — Cláusula da Biblioteca de Cláusulas
// ---------------------------------------------------------------------------

/**
 * Tipos de condição de inclusão de alínea.
 *
 * Legados (mantidos para retrocompatibilidade):
 *   always               — sempre incluída
 *   has_setup            — contrato tem setup/taxa de implantação
 *   has_min_duration     — contrato tem prazo mínimo de permanência
 *   has_service          — serviço específico contratado (por UUID legado)
 *   has_setup_installments — setup parcelado (> 1 parcela)
 *
 * Novos (migration 00205):
 *   service              — serviço por slug: condition_value = {"slugs": [...]}
 *   has_multiple_representatives — assinatura conjunta (signing_type = 'joint')
 *   signing_type         — tipo de assinatura: condition_value = {"type": "joint"|"individual"}
 *   has_schedule         — contrato possui cronograma de pagamento
 *   service_count        — nº de serviços >= min: condition_value = {"min": N}
 *   has_grace_period     — contrato tem meses de carência > 0
 */
export type ContractClauseConditionType =
  // Legados
  | 'always'
  | 'has_setup'
  | 'has_min_duration'
  | 'has_service'
  | 'has_setup_installments'
  // Novos
  | 'service'
  | 'has_multiple_representatives'
  | 'signing_type'
  | 'has_schedule'
  | 'service_count'
  | 'has_grace_period'
  // ── Pessoa física / jurídica ──────────────────────────────────────────────
  /** Inclui somente quando o contratante é pessoa física (CPF, 11 dígitos) */
  | 'is_pf'
  /** Inclui somente quando o contratante é pessoa jurídica (CNPJ, 14 dígitos) */
  | 'is_pj'
  /** Inclui somente quando há ao menos um procurador ativo nos signatários */
  | 'has_procurador';

/**
 * Parâmetros tipados de condition_value por tipo de condição.
 * Armazenado como JSONB no banco.
 */
export type ContractClauseConditionValue =
  | { slugs: string[] }           // service
  | { type: 'joint' | 'individual' } // signing_type
  | { min: number }               // service_count, has_min_duration
  | null;

export interface ContractClause {
  id: string;
  organization_id: string;
  title: string;
  /** TipTap JSONContent — stored as JSONB, rendered to HTML on output */
  content: JSONContent;
  /** HTML gerado a partir do content (migration 00203+) */
  html_content?: string;
  display_order: number;
  condition_type: ContractClauseConditionType;
  condition_value: ContractClauseConditionValue;
  /** @deprecated Substituído por condition_type/condition_value em 00205 */
  is_editable?: boolean;
  /** @deprecated Substituído por condition_type='service' + condition_value.slugs */
  service_id?: string | null;
  /** Slug do serviço associado (migration 00203) */
  service_slug?: string | null;
  /** Categoria da alínea (migration 00203) */
  category_key?: string;
  /** Alínea fixa (entra em todo contrato) ou condicional por serviço */
  is_fixed?: boolean;
  /** Alínea ativa */
  is_active?: boolean;
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
// Representante legal / procurador para montagem do contrato
// Espelha client_representatives + migration 00208
// ---------------------------------------------------------------------------

export type TipoRepresentacao = 'legal' | 'procurador';
export type ProcuracaoTipo = 'publica' | 'particular';
export type EstadoCivil =
  | 'solteiro'
  | 'casada'   // alias aceito
  | 'casado'
  | 'viuvo'
  | 'divorciado'
  | 'uniao_estavel';

/**
 * Representante legal ou procurador a ser usado na montagem da qualificação
 * do contratante no documento do contrato.
 */
export interface ClientRepresentativeAssembly {
  id: string;
  nome: string;
  cpf: string;
  /** Cargo ou qualificação (sócio-administrador, proprietário, etc.) */
  cargo?: string | null;
  qualificacao?: string | null;
  tipo_representacao: TipoRepresentacao;
  /** Tipo do instrumento: pública ou particular */
  procuracao_tipo?: ProcuracaoTipo | null;
  /** Data de lavratura da procuração (ISO date string) */
  procuracao_data?: string | null;
  /** true = procuração por prazo indeterminado */
  procuracao_indeterminada?: boolean;
  /**
   * IDs de outros ClientRepresentativeAssembly que este procurador representa.
   * null = representa a própria parte (PJ ou PF diretamente).
   */
  representa_ids?: string[] | null;
  /** Indica se deve assinar este contrato específico */
  is_signing_responsible?: boolean;
}

// ---------------------------------------------------------------------------
// Requirement 5.4 — Serviço selecionado num contrato
// ---------------------------------------------------------------------------
export interface SelectedService {
  service_id: string;
  service_name: string;
  /**
   * Lista de entregáveis do serviço com as configurações preenchidas no
   * momento do cadastro do contrato. Cada entregável é opcional (included).
   */
  selected_deliverables: SelectedDeliverable[];
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

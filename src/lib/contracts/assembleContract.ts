/**
 * assembleContract — Pure function that assembles the full contract HTML.
 *
 * Steps:
 * 1. Validate template.structure exists
 * 2. Filter clauses by condition_type (roots only — children evaluated recursively)
 * 3. Sort by display_order ascending
 * 4. Build variable map from contract + client data
 * 5. Build tree of clauses (parent → children)
 * 6. Render each category recursively with marker_type per node
 * 7. Inject clauses into template structure
 * 8. Build full HTML and do final variable resolution pass
 * 9. Return ContractAssemblyResult
 */

import type {
  ContractClause,
  ContractTemplateV2,
  ContractTemplateStructure,
  ContractAssemblyResult,
  SelectedService,
  JSONContent,
  ClientRepresentativeAssembly,
  ServiceCatalogItem,
  ServiceDeliverable,
} from '../../types/contracts';
import { resolveVariables } from './resolveVariables';
import { buildScopeString } from './buildScopeString';
import { buildScheduleHtml } from './buildScheduleHtml';
import { buildQualificacaoContratante } from './buildQualificacaoContratante';
import { buildSignatureBlockHtml } from './buildSignatureBlock';

// ---------------------------------------------------------------------------
// Minimal contract shape needed for assembly
// ---------------------------------------------------------------------------
interface AssemblyContract {
  id: string;
  title: string;
  value: number;
  first_payment_due_date?: string | null;
  /** Duração total do contrato em meses (ex: 12) */
  duration_months?: number | null;
  min_duration_months?: number;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
  /** Data de início / Data da Contratação (contracts_v2.start_date) */
  start_date?: string | null;
  prazo_minimo_meses?: number | null;
  total_monthly?: number | null;
  cidade_estado?: string | null;
  signed_at?: string | null;
  recurring_payment_method?: string | null;
  chave_pix?: string | null;
  grace_months?: number | null;
  due_day?: number | null;
  has_payment_schedule?: boolean;
  /** Linhas do cronograma de pagamento — populam {{cronograma_pagamento}} */
  payment_schedule?: Array<{
    line_type: string;
    period_label: string;
    due_date: string | null;
    amount: number;
    month_to: number | null;
  }> | null;
  signing_type?: 'individual' | 'joint' | null;
  /** true quando o contrato possui ao menos uma garantia cadastrada */
  has_guarantees?: boolean | null;
  /** Slugs dos serviços contratados — fallback quando metadata.services está vazio */
  service_slugs?: string[] | null;
  /** Número sequencial do contrato — injetado como {{numero_contrato}} e {{contract_number}} */
  contract_number?: string | null;
  /** Garantias do contrato — passadas para montagem das variáveis */
  guarantees?: ContractGuarantee[] | null;
  metadata?: {
    services?: SelectedService[];
    /** Catalog items keyed by service_id — enriches {{servicos}} with modality, scope and deliverable details */
    catalogItems?: ServiceCatalogItem[];
    setup_installments?: number;
    setup_value?: number;
    setup_fees?: number;
    setup_first_due_date?: string;
    setup_payment_method?: string;
    setup_parcel_value?: number;
    clause_edits?: Record<string, string>;
    setup_amount_manual?: number;
    representative_count?: number;
  } | null;
}

/** Garantia de resultado vinculada ao contrato */
export interface ContractGuarantee {
  id: string;
  kpi_name: string;
  kpi_unit: 'currency' | 'percentage' | 'number';
  growth_percent: number;
  base_value?: number | null;
  deadline: string; // ISO date "YYYY-MM-DD"
  notes?: string | null;
}

interface AssemblyClient {
  name?: string | null;
  responsible_name?: string | null;
  company_name?: string | null;
  /** CPF (11 dígitos) ou CNPJ (14 dígitos), apenas números */
  document?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  cidade?: string | null;
  estado?: string | null;
  /** Endereço completo formatado */
  address?: string | null;
  /** Estado civil — relevante para PF */
  estado_civil?: string | null;
  /** Nacionalidade — relevante para PF. Default: 'brasileiro(a)' */
  nacionalidade?: string | null;
  /** Representantes legais e/ou procuradores cadastrados */
  representatives?: ClientRepresentativeAssembly[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Ordinal suffix helper — 1→"1ª", 2→"2ª", etc.
// ---------------------------------------------------------------------------
function ordinal(n: number): string {
  return `${n}ª`;
}

// ---------------------------------------------------------------------------
// labelFormaPagamento — converte código de forma de pagamento em label legível
// ---------------------------------------------------------------------------
function labelFormaPagamento(method: string | null | undefined): string {
  switch (method) {
    case 'pix':           return 'PIX';
    case 'boleto':        return 'Boleto Bancário';
    case 'cartao':        return 'Cartão de Crédito';
    case 'transferencia': return 'Transferência Bancária';
    default:              return method ?? '';
  }
}

// ---------------------------------------------------------------------------
// buildTextoPagamento
// Gera a frase completa de forma de pagamento para uso em alíneas contratuais.
// Evita que o redator precise concatenar manualmente ~6 variáveis diferentes.
//
// Exemplo de saída:
//   "Os pagamentos serão realizados exclusivamente via PIX (Chave CNPJ nº
//    62.659.676/0001-49 – Agência C8 LTDA), vencendo-se a primeira parcela
//    em 01 de agosto de 2026 e as demais no dia 20 de cada mês, sendo a
//    adimplência condição indispensável para a continuidade dos serviços."
// ---------------------------------------------------------------------------
function buildTextoPagamento(
  method:           string | null | undefined,
  chavePix:         string | null | undefined,
  firstPaymentDate: string | null | undefined,
  dueDay:           number | null | undefined,
): string {
  const forma = labelFormaPagamento(method);
  if (!forma) return '';

  // Instrumento de pagamento com chave PIX quando aplicável
  const instrumento = (method === 'pix' && chavePix)
    ? `${forma} (Chave CNPJ nº <strong>${chavePix}</strong>)`
    : `<strong>${forma}</strong>`;

  // Data da primeira parcela por extenso
  const primeiraParcela = firstPaymentDate
    ? (() => {
        const d = new Date(firstPaymentDate + 'T12:00:00');
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      })()
    : '';

  // Dia de vencimento recorrente
  const diaVenc = dueDay != null
    ? String(dueDay)
    : (firstPaymentDate
        ? String(new Date(firstPaymentDate + 'T00:00:00').getDate())
        : '');

  // Monta a frase (sem <p> envolvente — o wrapper vem da alínea no template)
  let frase = `Os pagamentos serão realizados exclusivamente via ${instrumento}`;

  if (primeiraParcela && diaVenc) {
    frase += `, vencendo-se a primeira parcela em <strong>${primeiraParcela}</strong> e as demais no dia <strong>${diaVenc}</strong> de cada mês`;
  } else if (primeiraParcela) {
    frase += `, com primeira parcela em <strong>${primeiraParcela}</strong>`;
  } else if (diaVenc) {
    frase += `, vencendo todo dia <strong>${diaVenc}</strong> de cada mês`;
  }

  frase += ', sendo a adimplência condição indispensável para a continuidade da prestação dos serviços.';
  return frase;
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
  contract: AssemblyContract,
  client: AssemblyClient
): boolean {
  // ── Helper local: detecta PF pelo document ────────────────────────────────
  const clientDoc = (
    (client.document as string | null | undefined) ?? client.cnpj ?? client.cpf ?? ''
  ).replace(/\D/g, '');
  const clientIsPF = clientDoc.length <= 11;

  const result = evaluateConditionRaw(clause, contract, clientIsPF, client);

  // condition_negate inverte o resultado:
  //   false (padrão) → inclui quando condição é verdadeira
  //   true           → inclui quando condição é FALSA (ocultar quando verdadeiro)
  const negate = (clause as ContractClause & { condition_negate?: boolean }).condition_negate ?? false;
  return negate ? !result : result;
}

function evaluateConditionRaw(
  clause: ContractClause,
  contract: AssemblyContract,
  clientIsPF: boolean,
  client: AssemblyClient
): boolean {
  switch (clause.condition_type) {
    case 'always':
      return true;

    // ── Legado ──────────────────────────────────────────────────────────────
    case 'has_setup':
      return (
        (contract.metadata?.setup_installments ?? 0) > 0 ||
        (contract.metadata?.setup_value ?? 0) > 0 ||
        (contract.metadata?.setup_amount_manual ?? 0) > 0
      );

    case 'has_min_duration':
      return (
        (contract.prazo_minimo_meses ?? contract.min_duration_months ?? 0) > 0
      );

    case 'has_service': {
      // Legado: clause.service_id (UUID)
      const serviceIds =
        contract.metadata?.services?.map((s) => s.service_id) ?? [];
      return clause.service_id != null && serviceIds.includes(clause.service_id);
    }

    case 'has_setup_installments':
      return (contract.metadata?.setup_installments ?? 0) > 1;

    // ── Novos (migration 00205) ──────────────────────────────────────────────

    /**
     * service: {"slugs": ["agente_ia", "assessoria"]}
     * Inclui a alínea se qualquer slug da lista estiver entre os serviços
     * selecionados no contrato (via service_name normalizado ou condition_value).
     */
    case 'service': {
      const conditionValue = clause.condition_value as { slugs?: string[] } | null;
      const slugs = conditionValue?.slugs ?? [];
      if (slugs.length === 0) return false;
      const serviceNames =
        contract.metadata?.services?.map((s) =>
          s.service_name?.toLowerCase().replace(/\s+/g, '_')
        ) ?? [];
      return slugs.some((slug) => serviceNames.includes(slug));
    }

    /**
     * has_multiple_representatives: incluir quando assinatura é conjunta.
     * Compatível tanto com signing_type === 'joint' quanto com
     * representative_count > 1.
     */
    case 'has_multiple_representatives':
      return (
        contract.signing_type === 'joint' ||
        (contract.metadata?.representative_count ?? 1) > 1
      );

    /**
     * signing_type: {"type": "joint"} | {"type": "individual"}
     */
    case 'signing_type': {
      const conditionValue = clause.condition_value as { type?: string } | null;
      const expectedType = conditionValue?.type ?? 'individual';
      return (contract.signing_type ?? 'individual') === expectedType;
    }

    /**
     * has_schedule: inclui a alínea quando o contrato tem cronograma de
     * pagamento definido (contract_payment_schedule preenchido).
     */
    case 'has_schedule':
      return contract.has_payment_schedule === true;

    /**
     * service_count: {"min": 2}
     * Inclui a alínea quando o número de serviços contratados >= min.
     */
    case 'service_count': {
      const conditionValue = clause.condition_value as { min?: number } | null;
      const min = conditionValue?.min ?? 1;
      return (contract.metadata?.services?.length ?? 0) >= min;
    }

    /**
     * has_grace_period: inclui quando há meses de carência configurados.
     */
    case 'has_grace_period':
      return (contract.grace_months ?? 0) > 0;

    /**
     * has_guarantees: inclui quando o contrato possui ao menos uma garantia
     * de resultado baseada em KPI cadastrada.
     */
    case 'has_guarantees':
      return contract.has_guarantees === true ||
        (contract.guarantees != null && contract.guarantees.length > 0);

    // ── Pessoa física / jurídica (migration 00208+) ──────────────────────────

    /**
     * is_pf: inclui somente para contratante pessoa física (CPF, 11 dígitos).
     * Útil para alíneas de qualificação, estado civil, herança, etc.
     */
    case 'is_pf':
      return clientIsPF;

    /**
     * is_pj: inclui somente para contratante pessoa jurídica (CNPJ, 14 dígitos).
     * Útil para alíneas de representação societária, CNPJ, sede, etc.
     */
    case 'is_pj':
      return !clientIsPF;

    /**
     * has_procurador: inclui quando há ao menos um representante com
     * tipo_representacao === 'procurador' entre os signatários do contrato.
     * Controla exibição de alíneas sobre instrumento de procuração.
     */
    case 'has_procurador':
      return (client.representatives ?? []).some(
        (r) =>
          r.tipo_representacao === 'procurador' &&
          r.is_signing_responsible !== false
      );

    default: {
      // Retrocompatibilidade: cláusulas com condition_type não reconhecido
      // são incluídas se is_fixed=true ou service_slug bater com um serviço selecionado.
      // Isso evita que cláusulas legadas (obrigacoes_contratada/contratante, remuneracao, etc.)
      // sejam silenciosamente excluídas por condition_type desconhecido.
      const clauseAsLegacy = clause as ContractClause & { is_fixed?: boolean; service_slug?: string | null };
      if (clauseAsLegacy.is_fixed === true) return true;
      if (clauseAsLegacy.service_slug) {
        const serviceNames = contract.metadata?.services?.map(s =>
          s.service_name?.toLowerCase().replace(/\s+/g, '_')
        ) ?? [];
        return serviceNames.includes(clauseAsLegacy.service_slug.toLowerCase());
      }
      // Sem condition_type reconhecido e sem is_fixed/service_slug: inclui por padrão
      return true;
    }
  }}

// ---------------------------------------------------------------------------
// buildGuaranteesVars — monta variáveis de garantia para o varMap
// ---------------------------------------------------------------------------
function buildGuaranteesVars(guarantees: ContractGuarantee[]): Record<string, string> {
  if (!guarantees.length) {
    return {
      garantias:              '',
      garantias_lista:        '',
      garantias_count:        '0',
      garantia_1_kpi:         '',
      garantia_1_crescimento: '',
      garantia_1_prazo:       '',
      garantia_1_base:        '',
    };
  }

  const fmtDate = (iso: string) => {
    try { return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR'); }
    catch { return iso; }
  };

  const fmtValue = (v: number | null | undefined, unit: string) => {
    if (v == null) return '';
    if (unit === 'currency')
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    if (unit === 'percentage') return `${v}%`;
    return String(v);
  };

  // Lista HTML formatada para uso em cláusulas
  const rows = guarantees
    .map((g, i) => {
      const base = g.base_value != null
        ? ` (base: ${fmtValue(g.base_value, g.kpi_unit)})`
        : '';
      return (
        `<tr>` +
        `<td>${i + 1}</td>` +
        `<td><strong>${g.kpi_name}</strong>${base}</td>` +
        `<td>${g.growth_percent}%</td>` +
        `<td>${fmtDate(g.deadline)}</td>` +
        `</tr>`
      );
    })
    .join('');

  const tabelaHtml =
    `<table class="garantias-table">` +
    `<thead><tr><th>#</th><th>Indicador (KPI)</th><th>Meta de crescimento</th><th>Prazo</th></tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `</table>`;

  // Parágrafo narrativo para uso inline
  const narrativa = guarantees
    .map((g) => {
      const base = g.base_value != null
        ? ` a partir de ${fmtValue(g.base_value, g.kpi_unit)}`
        : '';
      return `${g.kpi_name}: crescimento de ${g.growth_percent}%${base} até ${fmtDate(g.deadline)}`;
    })
    .join('; ');

  // Variáveis individuais (até 5 garantias)
  const individual: Record<string, string> = {};
  for (let i = 0; i < Math.min(guarantees.length, 5); i++) {
    const g = guarantees[i];
    const n = i + 1;
    individual[`garantia_${n}_kpi`]         = g.kpi_name;
    individual[`garantia_${n}_crescimento`]  = `${g.growth_percent}%`;
    individual[`garantia_${n}_prazo`]        = fmtDate(g.deadline);
    individual[`garantia_${n}_base`]         = g.base_value != null ? fmtValue(g.base_value, g.kpi_unit) : '';
  }
  // Preenche slots vazios
  for (let i = guarantees.length + 1; i <= 5; i++) {
    individual[`garantia_${i}_kpi`]         = '';
    individual[`garantia_${i}_crescimento`]  = '';
    individual[`garantia_${i}_prazo`]        = '';
    individual[`garantia_${i}_base`]         = '';
  }

  return {
    garantias:       tabelaHtml,
    garantias_lista: narrativa,
    garantias_count: String(guarantees.length),
    ...individual,
  };
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
    // Fallback: se o template tem html_content mas não tem structure,
    // substitui apenas variáveis no html_content — sem injetar cláusulas
    // separadas do banco (que causaria duplicação).
    if ((template as Record<string, unknown>).html_content) {
      const rawHtml = String((template as Record<string, unknown>).html_content);

      // Precisamos montar o varMap primeiro — faremos isso de forma simplificada aqui
      // reutilizando o mesmo processo do path principal mas retornando cedo.
      // Delegamos ao path principal via structure sintética que NÃO injeta cláusulas:
      // parties_block = html_content completo, clauses_block = "" (sem {{CLAUSES}})
      (template as unknown as { structure: ContractTemplateStructure }).structure = {
        header:          "",
        parties_block:   rawHtml,
        clauses_block:   "", // ← NÃO injeta cláusulas do banco — evita duplicação
        signature_block: "",
        footer:          "",
      };
    } else {
      throw new Error(
        'O template selecionado não está configurado. Acesse Configurações → Contratos para configurar a estrutura do template.'
      );
    }
  }

  const structure = template.structure!;

  // Step 2 — Filter clauses by condition (client passed for is_pf/is_pj/has_procurador)
  // Exclui cláusulas inativas (is_active === false) antes de avaliar condições.
  const filteredClauses = clauses.filter((clause) => {
    if ((clause as ContractClause & { is_active?: boolean }).is_active === false) return false;
    return evaluateCondition(clause, contract, client);
  });

  // Step 3 — Sort by display_order ascending
  const sortedClauses = [...filteredClauses].sort(
    (a, b) => a.display_order - b.display_order
  );

  // Step 4 — Build variable map
  // Shorthand for metadata — used throughout varMap
  const meta = (contract.metadata ?? {}) as Record<string, unknown>;
  // Populate catalog maps for buildScopeString enrichment.
  // catalogItemMap is keyed by BOTH id AND slug, because metadata.services
  // stores service_id as a slug when created via ContractGenerator.
  const catalogDeliverableMap = new Map<string, ServiceDeliverable>();
  const catalogItemMap = new Map<string, ServiceCatalogItem>();

  for (const item of (contract.metadata?.catalogItems ?? [])) {
    catalogItemMap.set(item.id, item);
    if (item.slug) catalogItemMap.set(item.slug, item);
    for (const del of (item.deliverables ?? [])) {
      catalogDeliverableMap.set(del.id, del);
    }
  }

  // ── Serviços: resolve a lista para buildScopeString ───────────────────────
  // Priority 1: metadata.services (has full selected_deliverables)
  // Priority 2: service_slugs fallback — when the contract pre-dates metadata.services
  //             or when selected_deliverables is empty, build minimal SelectedService
  //             list from service_slugs + catalogItemMap so deliverables still render.
  const rawMetaServices: SelectedService[] = contract.metadata?.services ?? [];

  const resolvedServices: SelectedService[] = (() => {
    if (rawMetaServices.length > 0) {
      // If any service has deliverables selected, use as-is
      const hasDeliverables = rawMetaServices.some(s => s.selected_deliverables?.length > 0);
      if (hasDeliverables) return rawMetaServices;

      // services exist but selected_deliverables is empty everywhere:
      // enrich from the catalog — include ALL deliverables as "included"
      return rawMetaServices.map(svc => {
        const slug = svc.service_id;
        const catalogItem = catalogItemMap.get(slug);
        if (!catalogItem?.deliverables?.length) return svc;
        return {
          ...svc,
          selected_deliverables: catalogItem.deliverables.map(d => ({
            deliverable_id: d.id,
            included: true,
            number_value: null,
            period: null,
          })),
        };
      });
    }

    // Fallback: build from service_slugs (contracts created before metadata.services)
    const slugs: string[] = (contract as unknown as { service_slugs?: string[] }).service_slugs ?? [];
    if (slugs.length === 0) return [];
    return slugs.map(slug => {
      const catalogItem = catalogItemMap.get(slug);
      return {
        service_id:   slug,
        service_name: catalogItem?.name ?? slug,
        selected_deliverables: (catalogItem?.deliverables ?? []).map(d => ({
          deliverable_id: d.id,
          included: true,
          number_value: null,
          period: null,
        })),
      };
    });
  })();

  const scopeString = buildScopeString(
    resolvedServices,
    catalogDeliverableMap,
    catalogItemMap
  );

  // ── Helpers de formatação ────────────────────────────────────────────────
  const formatCurrency = (v: number | null | undefined) =>
    v != null
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
      : '';

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '';
    // Aceita tanto Date quanto string ISO "YYYY-MM-DD"
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
  };

  /** Converte número de meses para extenso: 12 → "doze (12) meses" */
  const mesesExtenso = (n: number | null | undefined): string => {
    if (!n || n <= 0) return '';
    const extenso: Record<number, string> = {
      1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
      6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
      11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze', 15: 'quinze',
      16: 'dezesseis', 17: 'dezessete', 18: 'dezoito', 19: 'dezenove',
      20: 'vinte', 24: 'vinte e quatro', 36: 'trinta e seis',
      48: 'quarenta e oito', 60: 'sessenta',
    };
    const label = extenso[n] ? `${extenso[n]} (${n})` : String(n);
    return `${label} ${n === 1 ? 'mês' : 'meses'}`;
  };

  // Valor efetivo de setup: manual > metadata.setup_value
  const setupValue =
    contract.metadata?.setup_amount_manual ??
    contract.metadata?.setup_value ??
    0;

  // Prazo mínimo efetivo: prazo_minimo_meses tem precedência sobre min_duration_months
  const prazoMinimoMeses =
    contract.prazo_minimo_meses ?? contract.min_duration_months ?? 0;

  // Duração total do contrato (vigência) — separado do prazo mínimo (fidelidade)
  const vigenciaMeses = contract.duration_months ?? prazoMinimoMeses;

  // Cidade/Estado: prefere campo explícito do contrato, depois do cliente
  const cidadeEstado =
    contract.cidade_estado ??
    (client.cidade && client.estado
      ? `${client.cidade}/${client.estado}`
      : (client.cidade ?? client.estado ?? ''));

  // Documento do cliente: prefere campo document, depois cnpj/cpf individuais
  const clientDocument =
    (client.document as string | null | undefined) ??
    client.cnpj ??
    client.cpf ??
    '';

  // Endereço formatado do cliente
  const clientAddress =
    (client.address as string | null | undefined) ??
    (client.cidade && client.estado
      ? `${client.cidade}/${client.estado}`
      : '');

  // Qualificação dinâmica do contratante (PF/PJ + representantes + procuradores)
  const qualificacaoContratante = buildQualificacaoContratante({
    name: client.company_name ?? client.name ?? client.responsible_name ?? '',
    document: clientDocument,
    address: clientAddress,
    estado_civil: (client.estado_civil as string | null | undefined) ?? null,
    nacionalidade: (client.nacionalidade as string | null | undefined) ?? 'brasileiro(a)',
    representatives: client.representatives ?? [],
  });

  const varMap: Record<string, string> = {
    // ── Identificação do cliente ──────────────────────────────────────────
    cliente: client.name ?? client.responsible_name ?? '',
    empresa: client.company_name ?? '',
    contratante_razao_social: client.company_name ?? client.name ?? '',
    cnpj: client.cnpj ?? (clientDocument.replace(/\D/g, '').length === 14 ? clientDocument : ''),
    cpf: client.cpf ?? (clientDocument.replace(/\D/g, '').length === 11 ? clientDocument : ''),
    contratante_cnpj: client.cnpj ?? '',
    contratante_endereco: clientAddress,

    // ── Número do contrato ────────────────────────────────────────────────
    numero_contrato: contract.contract_number ?? '',
    contract_number: contract.contract_number ?? '',

    // ── Qualificação completa (PF/PJ + representantes + procuradores) ─────
    // Pronto para uso direto no parties_block como {{qualificacao_contratante}}
    qualificacao_contratante: qualificacaoContratante,

    // ── Variáveis legadas de representante (retrocompatibilidade) ─────────
    // Preenchidas com o primeiro signatário legal para templates antigos que
    // ainda usem {{representante_nome}} / {{representante_cpf}} diretamente.
    representante_nome: (() => {
      const rep = client.representatives?.find(
        (r) => r.tipo_representacao === 'legal' && r.is_signing_responsible !== false
      ) ?? client.representatives?.[0];
      return rep?.nome ?? '';
    })(),
    representante_cpf: (() => {
      const rep = client.representatives?.find(
        (r) => r.tipo_representacao === 'legal' && r.is_signing_responsible !== false
      ) ?? client.representatives?.[0];
      const d = (rep?.cpf ?? '').replace(/\D/g, '');
      if (d.length !== 11) return rep?.cpf ?? '';
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    })(),

    // ── Financeiro — recorrente ────────────────────────────────────────────
    valor: formatCurrency(contract.value),
    valor_mensalidade: formatCurrency(contract.total_monthly),

    // ── Financeiro — setup ────────────────────────────────────────────────
    valor_setup: formatCurrency(setupValue),
    parcelas_setup: String(contract.metadata?.setup_installments ?? 0),
    parcela_setup: formatCurrency(contract.metadata?.setup_parcel_value),
    taxa_setup: contract.metadata?.setup_fees != null
      ? `${contract.metadata.setup_fees}%`
      : '',
    vencimento_setup: formatDate(contract.metadata?.setup_first_due_date),
    forma_pagamento_setup: labelFormaPagamento(contract.metadata?.setup_payment_method),
    // ── Financeiro — recorrente ───────────────────────────────────────────
    // {{forma_pagamento}}: quando PIX e chave cadastrada → "PIX (Chave CNPJ nº X – Titular)"
    //                       quando PIX sem chave           → "PIX"
    //                       outros métodos                  → label normal
    // Retorna texto puro (sem HTML) — a formatação fica na alínea do template.
    forma_pagamento: (() => {
      const method = contract.recurring_payment_method ?? contract.metadata?.recurring_payment_method;
      const label  = labelFormaPagamento(method) || 'PIX';
      if ((method === 'pix' || !method) && contract.chave_pix) {
        return `${label} (Chave CNPJ nº ${contract.chave_pix})`;
      }
      return label;
    })(),
    chave_pix: contract.chave_pix ?? '',

    // ── Texto composto de forma de pagamento ─────────────────────────────
    // Renderiza automaticamente a frase completa de pagamento com todos os dados
    // do contrato (forma, chave PIX, primeira parcela, dia de vencimento).
    // Use {{texto_pagamento}} na alínea para evitar concatenar ~6 variáveis.
    texto_pagamento: buildTextoPagamento(
      // Fallback para 'pix' quando nenhum método foi informado (padrão da agência)
      contract.recurring_payment_method ?? contract.metadata?.recurring_payment_method ?? 'pix',
      contract.chave_pix,
      contract.first_payment_due_date,
      contract.due_day,
    ),

    // ── Datas e vigência ──────────────────────────────────────────────────
    // {{vencimento}} = primeira linha do cronograma (qualquer tipo), por extenso.
    // Independe de ser setup, mensalidade ou evolutivo — é sempre o 1º pagamento.
    vencimento: (() => {
      const sched = contract.payment_schedule ?? [];
      const date = sched[0]?.due_date ?? contract.first_payment_due_date;
      return date ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    })(),
    /** Primeiro vencimento do cronograma (alias explícito) */
    primeiro_vencimento: (() => {
      const sched = contract.payment_schedule ?? [];
      const date = sched[0]?.due_date ?? contract.first_payment_due_date;
      return date ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    })(),
    /** Vencimento da 1ª mensalidade recorrente (pula setup/entrada) */
    vencimento_primeira_mensalidade: (() => {
      const sched = contract.payment_schedule ?? [];
      const line = sched.find(l => l.line_type === 'mensalidade');
      const date = line?.due_date ?? sched[0]?.due_date ?? contract.first_payment_due_date;
      return date ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    })(),
    primeiro_pagamento: formatDate(contract.first_payment_due_date),
    /** Dia do mês para vencimento das mensalidades — ex: "20" */
    dia_vencimento: (() => {
      if (contract.due_day != null) return String(contract.due_day);
      const sched = contract.payment_schedule ?? [];
      const primeiraMsg = sched.find(l => l.line_type === 'mensalidade');
      const date = primeiraMsg?.due_date ?? contract.first_payment_due_date;
      return date ? String(new Date(date + 'T12:00:00').getDate()) : '';
    })(),
    data: new Date().toLocaleDateString('pt-BR'),
    data_assinatura: (() => {
      // start_date (Data da Contratação) → vigencia_inicio → signed_at → data atual
      const refDate = contract.start_date
        ?? contract.vigencia_inicio
        ?? contract.signed_at;
      if (refDate) {
        const d = new Date(refDate.includes('T') ? refDate : refDate + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        }
      }
      return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    })(),
    vigencia_inicio: formatDate(contract.vigencia_inicio),
    vigencia_fim: formatDate(contract.vigencia_fim),

    // ── Prazo e permanência ───────────────────────────────────────────────
    prazo_minimo:           String(prazoMinimoMeses),
    prazo_minimo_meses:     String(prazoMinimoMeses),
    prazo_minimo_extenso:   mesesExtenso(prazoMinimoMeses),
    // prazo_vigencia_extenso usa a duração total (vigência), não o prazo mínimo (fidelidade)
    prazo_vigencia_extenso: mesesExtenso(vigenciaMeses),
    duracao_extenso:        mesesExtenso(vigenciaMeses),

    // ── Carência ──────────────────────────────────────────────────────────
    carencia_meses: String(contract.grace_months ?? 0),
    carencia_extenso: mesesExtenso(contract.grace_months),

    // ── Serviços ──────────────────────────────────────────────────────────
    servicos: scopeString,
    escopo: scopeString,
    lista_servicos: scopeString,

    // ── Localização / foro ────────────────────────────────────────────────
    cidade_estado: cidadeEstado,
    foro_cidade: cidadeEstado,

    // ── Campos a preencher pelo caller (consultor, cronograma) ────────────
    /** @deprecated Use {{cronograma}} — mantido para retrocompatibilidade */
    consultor: '',
    cronograma: '',
    cronograma_pagamento: buildScheduleHtml(contract.payment_schedule ?? []),
    /** @deprecated Use {{vencimento}} — mantido para retrocompatibilidade */
    primeiro_pagamento: formatDate(contract.first_payment_due_date),

    // ── Bloco de assinaturas dinâmico ─────────────────────────────────────
    bloco_assinaturas: buildSignatureBlockHtml({
      contratanteRazaoSocial: client.company_name ?? client.name ?? '',
      reps: (() => {
        const allReps = client.representatives ?? [];
        // IDs de representados que têm procurador — esses NÃO geram campo de assinatura
        const idsRepresentados = new Set<string>(
          allReps
            .filter(r => r.tipo_representacao === 'procurador' && r.representa_ids?.length)
            .flatMap(r => r.representa_ids ?? [])
        );
        return allReps
          .filter(r => !idsRepresentados.has(r.id))
          .map(r => ({
            nome:               r.nome,
            cpf:                r.cpf,
            cargo:              r.cargo ?? null,
            qualificacao:       r.qualificacao ?? null,
            tipo_representacao: r.tipo_representacao ?? null,
            representa_nomes:   r.tipo_representacao === 'procurador' && r.representa_ids?.length
              ? r.representa_ids
                  .map(rid => allReps.find(x => x.id === rid)?.nome)
                  .filter(Boolean) as string[]
              : null,
          }));
      })(),
    }),

    // ── Garantias de resultado ────────────────────────────────────────────
    ...buildGuaranteesVars(contract.guarantees ?? []),

    // ── Comissão variável ─────────────────────────────────────────────────
    comissao_habilitada:    meta.commission_enabled ? 'Sim' : 'Não',
    comissao_tipo: (() => {
      if (!meta.commission_enabled) return '';
      return meta.commission_type === 'fixed_per_unit' ? 'Valor fixo por resultado' : 'Percentual sobre o valor';
    })(),
    comissao_taxa: (() => {
      if (!meta.commission_enabled || !meta.commission_rate) return '';
      const rate = Number(meta.commission_rate);

      // ── Percentual por extenso ────────────────────────────────────────────
      if (meta.commission_type !== 'fixed_per_unit') {
        const extensoPct: Record<number, string> = {
          1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
          6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
          11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze', 15: 'quinze',
          16: 'dezesseis', 17: 'dezessete', 18: 'dezoito', 19: 'dezenove',
          20: 'vinte', 25: 'vinte e cinco', 30: 'trinta',
          40: 'quarenta', 50: 'cinquenta',
        };
        // Formata o número: remove .0 desnecessário (10.0 → "10", 10.5 → "10,5")
        const pctFormatado = rate % 1 === 0
          ? String(rate)
          : rate.toLocaleString('pt-BR');
        const label = extensoPct[rate] ? `${extensoPct[rate]} por cento` : `${pctFormatado} por cento`;
        return `percentual de ${pctFormatado}% (${label})`;
      }

      // ── Valor fixo por extenso ────────────────────────────────────────────
      const valorBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rate);

      /** Converte número inteiro (≤ 9.999) para extenso em português */
      const inteiroExtenso = (n: number): string => {
        const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
          'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
        const dezenas  = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta',
          'sessenta', 'setenta', 'oitenta', 'noventa'];
        const centenas = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
          'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

        if (n === 0) return 'zero';
        if (n < 20) return unidades[n];
        if (n < 100) {
          const d = Math.floor(n / 10);
          const u = n % 10;
          return u === 0 ? dezenas[d] : `${dezenas[d]} e ${unidades[u]}`;
        }
        if (n === 100) return 'cem';
        if (n < 1000) {
          const c = Math.floor(n / 100);
          const resto = n % 100;
          // centena exata (200, 300…) já mapeada; 100-algo → cento
          const centLabel = c === 1 ? 'cento' : centenas[c];
          return resto === 0 ? centenas[c] : `${centLabel} e ${inteiroExtenso(resto)}`;
        }
        // Milhar
        const mil = Math.floor(n / 1000);
        const resto = n % 1000;
        const milLabel = mil === 1 ? 'mil' : `${inteiroExtenso(mil)} mil`;
        return resto === 0 ? milLabel : `${milLabel} e ${inteiroExtenso(resto)}`;
      };

      const inteiros  = Math.floor(rate);
      const centavos  = Math.round((rate - inteiros) * 100);
      const parteReal = inteiroExtenso(inteiros);
      const unidReal  = inteiros === 1 ? 'real' : 'reais';

      let extensoCompleto: string;
      if (centavos === 0) {
        extensoCompleto = `${parteReal} ${unidReal}`;
      } else {
        const parteCent = inteiroExtenso(centavos);
        const unidCent  = centavos === 1 ? 'centavo' : 'centavos';
        extensoCompleto = inteiros === 0
          ? `${parteCent} ${unidCent}`
          : `${parteReal} ${unidReal} e ${parteCent} ${unidCent}`;
      }

      return `valor de ${valorBRL} (${extensoCompleto})`;
    })(),
    comissao_descricao:    meta.commission_enabled && meta.commission_description ? String(meta.commission_description) : '',
    comissao_periodicidade: (() => {
      if (!meta.commission_enabled) return '';
      const s = String(meta.commission_settlement ?? 'mensal');
      return s === 'semanal' ? 'Semanal' : s === 'quinzenal' ? 'Quinzenal' : 'Mensal';
    })(),
    comissao_periodicidade_extenso: (() => {
      if (!meta.commission_enabled) return '';
      const s = String(meta.commission_settlement ?? 'mensal');
      return s === 'semanal'
        ? 'semanalmente'
        : s === 'quinzenal'
        ? 'quinzenalmente'
        : 'mensalmente';
    })(),
    comissao_prazo_pagamento: (() => {
      if (!meta.commission_enabled) return '';
      const dias = meta.commission_payment_days ? Number(meta.commission_payment_days) : 5;
      const extensoDias: Record<number, string> = {
        1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
        6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
        11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze', 15: 'quinze',
        20: 'vinte', 25: 'vinte e cinco', 30: 'trinta',
      };
      const dd = String(dias).padStart(2, '0');
      const label = extensoDias[dias] ? `${dd} (${extensoDias[dias]})` : dd;
      return label;
    })(),

    // ── Aliases e variáveis faltantes ─────────────────────────────────────
    // Prazo em meses (número simples)
    prazo_vigencia_meses: String(vigenciaMeses || ''),
    duracao_meses:        String(vigenciaMeses || ''),

    // Endereço do cliente
    endereco_cliente: clientAddress,
    endereco:         clientAddress,

    // Responsável (primeiro representante legal ou nome do cliente)
    responsavel_cliente: (() => {
      const rep = client.representatives?.find(r => r.tipo_representacao === 'legal');
      return rep?.nome ?? client.responsible_name ?? client.name ?? '';
    })(),
    cpf_responsavel_cliente: (() => {
      const rep = client.representatives?.find(r => r.tipo_representacao === 'legal');
      const d = (rep?.cpf ?? '').replace(/\D/g, '');
      if (d.length !== 11) return rep?.cpf ?? '';
      return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    })(),
  };

  // ---------------------------------------------------------------------------
  // Step 5 — Build clause tree and render recursively
  // ---------------------------------------------------------------------------

  // Collect all clauses (including children) for tree building.
  // filteredClauses contains only nodes that pass evaluateCondition — but we
  // need ALL clauses to build children lists, so children are evaluated lazily.
  const allClausesById = new Map<string, ContractClause>(
    clauses.map((c) => [c.id, c])
  );

  // Index children by parent_id (using the full, unfiltered clause list)
  const childrenByParent = new Map<string, ContractClause[]>();
  for (const c of clauses) {
    const pid = (c as ContractClause & { parent_id?: string | null }).parent_id;
    if (pid) {
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid)!.push(c);
    }
  }
  // Sort children by display_order
  for (const [, children] of childrenByParent) {
    children.sort((a, b) => a.display_order - b.display_order);
  }

  // ── Marker helpers ──────────────────────────────────────────────────────────
  /** Converts a 1-based counter to the appropriate marker string */
  function makeMarker(
    markerType: string | null | undefined,
    counter: number,
    clauseIdx: number,
    depth: number,
    parentPrefix: string
  ): string {
    switch (markerType) {
      case 'bullet': return '•';
      case 'letter': return `${String.fromCharCode(96 + counter)})`;
      case 'none':   return '';
      case 'number':
      default: {
        // Build numeric prefix: clauseIdx.counter at depth 1,
        // parentPrefix.counter at deeper levels
        if (depth === 1) return `${clauseIdx}.${counter}`;
        return `${parentPrefix}.${counter}`;
      }
    }
  }

  // ── Recursive node renderer ─────────────────────────────────────────────────
  /**
   * Renders a single clause node and its surviving children.
   * Returns '' if this node is filtered out by evaluateCondition.
   */
  function renderNode(
    clause: ContractClause,
    depth: number,
    clauseIdx: number,  // top-level clause number (1-based)
    counter: number,    // sibling counter at this depth (1-based)
    parentPrefix: string,
    varMap: Record<string, string>,
    unresolved: string[]
  ): string {
    // Evaluate condition for this node
    if (!evaluateCondition(clause, contract, client)) return '';

    // Resolve variables in this node's content
    const rawHtml = clause.html_content?.trim()
      ? clause.html_content
      : jsonContentToHtml((clause as ContractClause & { content?: JSONContent }).content!);

    // Inject numeric/letter counters into the content
    const numPrefix = depth === 0
      ? String(clauseIdx)
      : makeMarker('number', counter, clauseIdx, depth, parentPrefix);

    const localVarMap = {
      ...varMap,
      num_item:    depth <= 1 ? `${clauseIdx}.${counter}` : varMap.num_item,
      num_subitem: depth === 2 ? `${parentPrefix}.${counter}` : varMap.num_subitem,
      num_detalhe: depth === 3 ? `${parentPrefix}.${counter}` : varMap.num_detalhe,
    };

    const { output: resolvedHtml, unresolved: u } = resolveVariables(rawHtml, localVarMap);
    unresolved.push(...u);

    const markerType = (clause as ContractClause & { marker_type?: string }).marker_type ?? 'number';
    const markerStr  = depth === 0
      ? ''  // depth-0 title is rendered by the clause wrapper
      : makeMarker(markerType, counter, clauseIdx, depth, parentPrefix);

    // Render children recursively
    const children = (childrenByParent.get(clause.id) ?? []).filter(
      (ch) => (ch as ContractClause & { is_active?: boolean }).is_active !== false
    );

    let childrenHtml = '';
    let childCounter = 0;
    const myPrefix = depth === 0 ? String(clauseIdx) : numPrefix;
    for (const child of children) {
      childCounter++;
      const childHtml = renderNode(child, depth + 1, clauseIdx, childCounter, myPrefix, varMap, unresolved);
      if (childHtml) childrenHtml += childHtml;
    }

    // Assemble this node's HTML
    const depthClass = `clause-depth-${depth}`;
    const markerHtml = markerStr
      ? `<span class="clause-marker">${markerStr}</span>`
      : '';

    return (
      `<div data-clause-id="${clause.id}" class="contract-node ${depthClass}">` +
      (markerHtml
        ? `<div class="clause-node-row">${markerHtml}<div class="clause-node-content">${resolvedHtml}</div></div>`
        : `<div class="clause-node-content">${resolvedHtml}</div>`
      ) +
      (childrenHtml ? `<div class="clause-children">${childrenHtml}</div>` : '') +
      `</div>`
    );
  }

  const allUnresolved: string[] = [];
  const clauseHtmlParts: string[] = [];
  // Mapa direto: category_key → HTML renderizado (para substituição de {{clausula_*}})
  const categoryHtmlMap = new Map<string, string>();

  // ── Root alíneas grouped by category_key ──────────────────────────────────
  // Only depth-0 nodes (parent_id IS NULL) are roots.
  // IMPORTANT: Do NOT pre-sort by global display_order. Instead, group by category first
  // and sort within each category independently. This avoids cross-category display_order
  // collisions (all categories start at 0 after reorderClauses runs).
  const rootClauses = filteredClauses.filter(
    (c) => !(c as ContractClause & { parent_id?: string | null }).parent_id
  );

  const categoryMap = new Map<string, ContractClause[]>();
  for (const clause of rootClauses) {
    const key = clause.category_key?.trim();
    if (key) {
      if (!categoryMap.has(key)) categoryMap.set(key, []);
      categoryMap.get(key)!.push(clause);
    } else {
      const uniqueKey = `__flat__${clause.id}`;
      categoryMap.set(uniqueKey, [clause]);
    }
  }

  // Sort alíneas within each category by their display_order independently.
  // This mirrors exactly what the UI does (ClauseTree filters by category_key then sorts).
  for (const [, clauses] of categoryMap) {
    clauses.sort((a, b) => a.display_order - b.display_order);
  }

  // ── Reorder categoryMap to match the order of {{clausula_*}} in the template ──
  // The template defines the canonical clause order via its placeholder positions.
  // Without this reorder, clauses would be numbered in DB insertion order instead.
  {
    const fullTemplateText =
      (structure.header ?? '') +
      (structure.parties_block ?? '') +
      (structure.clauses_block ?? '') +
      (structure.signature_block ?? '') +
      (structure.footer ?? '');
    const templateOrderRegex = /\{\{clausula_([^}]+)\}\}/g;
    const templateOrder: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = templateOrderRegex.exec(fullTemplateText)) !== null) {
      const k = m[1].trim();
      if (!templateOrder.includes(k)) templateOrder.push(k);
    }
    if (templateOrder.length > 0) {
      // Build a sorted copy: first the keys found in the template (in template order),
      // then any remaining keys not mentioned in the template (appended at the end).
      const sortedEntries: [string, ContractClause[]][] = [];
      for (const k of templateOrder) {
        if (categoryMap.has(k)) sortedEntries.push([k, categoryMap.get(k)!]);
      }
      for (const [k, v] of categoryMap) {
        if (!templateOrder.includes(k)) sortedEntries.push([k, v]);
      }
      categoryMap.clear();
      for (const [k, v] of sortedEntries) categoryMap.set(k, v);
    }
  }

  // ── Render each category ──────────────────────────────────────────────────
  let clauseIndex = 0;

  for (const [categoryKey, rootAlíneas] of categoryMap) {
    if (rootAlíneas.length === 0) continue;

    // Check if at least one root node (or its children) would render
    // We render speculatively and skip if result is empty
    clauseIndex += 1;
    const clauseNumber = ordinal(clauseIndex);

    let rootCounter = 0;
    const renderedRoots: string[] = [];
    for (const root of rootAlíneas) {
      rootCounter++;
      const html = renderNode(root, 0, clauseIndex, rootCounter, String(clauseIndex), varMap, allUnresolved);
      if (html) renderedRoots.push(html);
    }

    if (renderedRoots.length === 0) {
      clauseIndex--; // skip empty category
      continue;
    }

    // Use first root's title as clause heading, or derive from category
    const blockTitle = rootAlíneas[0]?.title ?? '';

    clauseHtmlParts.push(
      `<div class="contract-clause">` +
      `<h4 class="clause-title">Cláusula ${clauseNumber}${blockTitle ? ` — ${blockTitle}` : ''}</h4>` +
      `<div class="clause-content">${renderedRoots.join('')}</div>` +
      `</div>`
    );

    // Registra no mapa direto para substituição de {{clausula_*}}
    if (!categoryKey.startsWith('__flat__')) {
      categoryHtmlMap.set(categoryKey, clauseHtmlParts[clauseHtmlParts.length - 1]);
    }
  }
  void allClausesById; // suppress unused warning

  // Step 6b — Popula varMap com o HTML de cada categoria (substituição de {{clausula_*}})
  // Usa o mapa direto construído acima — sem risco de dessincronização por índice.
  for (const [categoryKey, html] of categoryHtmlMap) {
    varMap[`clausula_${categoryKey}`] = html;
  }

  // Step 6c — Pré-popula com "" todas as variáveis {{clausula_*}} que aparecem no template
  // mas não foram geradas (cláusulas condicionais que não se aplicam a este contrato).
  // Isso evita que apareçam como "variáveis não resolvidas" no aviso ao usuário.
  const templateHtmlForScan = structure.parties_block + structure.clauses_block
    + structure.header + structure.footer + structure.signature_block;
  const clausulaVarRegex = /\{\{(clausula_[^}]+)\}\}/g;
  let clausulaMatch: RegExpExecArray | null;
  while ((clausulaMatch = clausulaVarRegex.exec(templateHtmlForScan)) !== null) {
    const varKey = clausulaMatch[1];
    if (!(varKey in varMap)) {
      varMap[varKey] = ''; // cláusula condicional não aplicável = bloco vazio, sem warning
    }
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
  // Prepend contract number identifier before the content if available
  const contractNumberHtml = contract.contract_number
    ? `<p class="contract-number" style="text-align:right;font-size:9pt;color:#666;margin:0 0 4pt;font-family:Calibri,sans-serif;">Contrato nº <strong>${contract.contract_number}</strong></p>`
    : '';

  const combinedHtml =
    structure.header +
    contractNumberHtml +
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
    // clauseCount = número de blocos de cláusula renderizados (categorias não-vazias).
    // Quando todas as alíneas não têm category_key, cada alínea é tratada como
    // categoria própria (__flat__), portanto clauseCount === número de alíneas
    // incluídas — comportamento idêntico ao anterior para retrocompatibilidade.
    clauseCount: clauseIndex,
  };
}

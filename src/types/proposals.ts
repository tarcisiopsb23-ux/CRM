// src/types/proposals.ts

export type ProposalStatus =
  | 'rascunho'
  | 'enviada'
  | 'visualizada'
  | 'aprovada'
  | 'recusada'
  | 'expirada';

export type EventType =
  | 'visualizacao'
  | 'scroll_parcial'
  | 'scroll_completo'
  | 'clique_whatsapp'
  | 'clique_aprovar'
  | 'aprovacao_confirmada';

export type SectionKey =
  | 'apresentacao'
  | 'diagnostico'
  | 'objetivos'
  | 'estrategia'
  | 'solucao'
  | 'escopo'
  | 'cronograma'
  | 'metodologia'
  | 'diferenciais'
  | 'cases'
  | 'depoimentos'
  | 'faq'
  | 'garantias'
  | 'consideracoes_finais';

export const SECTION_LABELS: Record<SectionKey, string> = {
  apresentacao: 'Apresentação',
  diagnostico: 'Diagnóstico',
  objetivos: 'Objetivos',
  estrategia: 'Estratégia',
  solucao: 'Solução',
  escopo: 'Escopo',
  cronograma: 'Cronograma',
  metodologia: 'Metodologia',
  diferenciais: 'Diferenciais',
  cases: 'Cases',
  depoimentos: 'Depoimentos',
  faq: 'FAQ',
  garantias: 'Garantias',
  consideracoes_finais: 'Considerações Finais',
};

export const SECTION_ORDER: SectionKey[] = [
  'apresentacao', 'diagnostico', 'objetivos', 'estrategia', 'solucao',
  'escopo', 'cronograma', 'metodologia', 'diferenciais', 'cases',
  'depoimentos', 'faq', 'garantias', 'consideracoes_finais',
];

export interface Proposal {
  id: string;
  organization_id: string;
  client_id: string;
  lead_id: string | null;
  closer_id: string | null;
  title: string;
  public_slug: string;
  hero_logo_url: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_message: string | null;
  hero_video_url: string | null;
  hero_image_url: string | null;
  hero_whatsapp_text: string;
  hero_whatsapp_number: string | null;
  hero_cta_text: string;
  hero_cta_color: string;
  plan_value: number;
  schedule: ScheduleConfig | null;
  status: ProposalStatus;
  total_views: number;
  total_accesses: number;
  avg_session_secs: number;
  first_accessed_at: string | null;
  last_accessed_at: string | null;
  tags: string[];
  campaign_origin: string | null;
  lead_origin: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Modalidades de cobrança disponíveis na proposta.
 *
 * - integral         → pagamento único à vista
 * - mensal           → mensalidades fixas (sem setup)
 * - setup_mensal     → setup na assinatura + mensalidades recorrentes
 * - meio_meio        → 50% na assinatura + 50% na conclusão / após N meses
 * - entrada_parcelado→ entrada definida + restante parcelado
 * - evolutivo        → mensalidades crescentes por fase (ex: mês 1-3: R$X, mês 4+: R$Y)
 * - carencia         → mensalidade reduzida nos primeiros meses, depois valor pleno
 */
export type ScheduleMode =
  | 'integral'
  | 'mensal'
  | 'setup_mensal'
  | 'meio_meio'
  | 'entrada_parcelado'
  | 'evolutivo'
  | 'carencia';

/** Fatia de um cronograma evolutivo ou de carência */
export interface ScheduleSlice {
  label: string;       // ex: "Meses 1–3", "A partir do mês 4"
  value: number;       // valor da parcela neste período
  installments: number | null; // null = indefinido (recorrente)
  firstDate?: string;  // data de vencimento desta fatia (ISO date)
}

export interface ScheduleConfig {
  // ── Campo obrigatório — define qual modalidade está ativa ──────────────────
  mode: ScheduleMode;

  // ── Campos comuns a todas as modalidades ──────────────────────────────────
  /** Data do primeiro pagamento / assinatura (ISO date 'yyyy-MM-dd') */
  firstDate: string;
  /** Dia de vencimento das parcelas recorrentes (1-28) */
  dueDay: number;
  /** Método de pagamento preferencial */
  paymentMethod?: 'pix' | 'boleto' | 'cartao' | 'transferencia';
  /** Observação livre exibida ao cliente */
  notes?: string;

  // ── integral ──────────────────────────────────────────────────────────────
  /** Valor total à vista (mode = 'integral') */
  integralValue?: number;

  // ── mensal ────────────────────────────────────────────────────────────────
  /** Valor fixo da mensalidade */
  firstValue: number;
  /** Recorrência */
  recurrence: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  /** Número de parcelas (máx 360) */
  installments: number;
  /** Ajustes individuais de valor por índice de parcela {0: 1500, 3: 2000, ...} */
  adjustments?: Record<number, number>;

  // ── setup como add-on (combinável com qualquer modo) ──────────────────────
  /**
   * Quando true, exibe bloco de setup NA FRENTE de qualquer outra modalidade.
   * Permite combinar: setup + mensal, setup + evolutivo, setup + carência, etc.
   * O modo 'setup_mensal' mantém comportamento legado; hasSetup = true é a
   * forma nova de adicionar setup a qualquer modalidade.
   */
  hasSetup?: boolean;
  /** Valor do setup / implementação cobrado na assinatura */
  setupValue?: number;
  /** Número de parcelas do setup (geralmente 1, mas pode ser 2-3) */
  setupInstallments?: number;
  /** Carência em meses antes de iniciar a mensalidade após o setup (0 = sem carência) */
  graceMonths?: number;

  // ── meio_meio ─────────────────────────────────────────────────────────────
  /** % da entrada (padrão 50). O restante = planValue - entrada */
  entryPercent?: number;
  /** Quando o segundo pagamento ocorre: 'conclusao' ou número de meses após o primeiro */
  secondPaymentTrigger?: 'conclusao' | number;

  // ── entrada_parcelado ─────────────────────────────────────────────────────
  /** Valor da entrada */
  entryValue?: number;
  /** Valor de cada parcela do restante */
  remainderInstallmentValue?: number;
  /** Número de parcelas do restante */
  remainderInstallments?: number;

  // ── evolutivo / carencia ──────────────────────────────────────────────────
  /** Fatias de valor para cronograma evolutivo ou de carência */
  slices?: ScheduleSlice[];
}

export interface ProposalService {
  id: string;
  proposal_id: string;
  organization_id: string;
  name: string;
  description: string | null;
  value: number;
  is_bonus: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProposalSection {
  id: string;
  proposal_id: string;
  organization_id: string;
  section_key: SectionKey;
  title: string;
  content: string;
  is_visible: boolean;
  section_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalEvent {
  id: string;
  proposal_id: string;
  organization_id: string;
  event_type: EventType;
  session_id: string;
  ip: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  user_agent: string | null;
  occurred_at: string;
}

export interface ProposalAcceptance {
  id: string;
  proposal_id: string;
  organization_id: string;
  approver_name: string;
  approver_cpf: string;
  ip_address: string;
  user_agent: string | null;
  accepted_at: string;
  proposal_snapshot: Record<string, unknown>;
  snapshot_hash: string;
}

export interface ContractTemplate {
  id: string;
  organization_id: string;
  name: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProposalFilters {
  status?: ProposalStatus;
  closer_id?: string;
  date_from?: string;
  date_to?: string;
  company?: string;
  campaign_origin?: string;
  lead_origin?: string;
  tags?: string[];
}

export interface ProposalSummary {
  total: number;
  sent: number;
  approved: number;
  approvalRate: number | null;
  totalApprovedValue: number;
}

// ─── Tipos estruturados de conteúdo das seções especiais ─────────────────────
// Armazenados como JSON em proposal_sections.content

/**
 * Resumo Executivo (section_key: 'apresentacao') — novo formato estruturado.
 * O título "Entendemos o seu cenário" é fixo no viewer.
 * Os 4 cards são obrigatórios no wizard.
 */
export interface ResumoExecutivoContent {
  /** Card 1 — "O contexto" */
  contexto: string;
  /** Card 2 — "Principais desafios" */
  desafios: string;
  /** Card 3 — "Oportunidades" */
  oportunidades: string;
  /** Card 4 — "Objetivo deste plano" */
  objetivo_plano: string;
}

/**
 * Uma coluna do Diagnóstico.
 */
export interface DiagnosticoColuna {
  problema: string;
  impacto: string;
  oportunidade: string;
}

/**
 * Diagnóstico (section_key: 'diagnostico') — novo formato estruturado.
 * Sempre 3 colunas, cada uma com problema + impacto + oportunidade.
 */
export interface DiagnosticoContent {
  /** Título opcional exibido acima das colunas (ex: "Gargalos que limitam seu crescimento") */
  titulo?: string;
  colunas: [DiagnosticoColuna, DiagnosticoColuna, DiagnosticoColuna];
}

/**
 * Um card de objetivo.
 */
export interface ObjetivoCard {
  titulo: string;
  descricao: string;
}

/**
 * Objetivos (section_key: 'objetivos') — novo formato estruturado.
 * 3 a 6 cards. Layout se adapta à quantidade: 3→3×1, 4→2×2, 5→3+2, 6→3×2.
 */
export interface ObjetivosContent {
  /** Título opcional exibido acima dos cards (ex: "Onde queremos chegar") */
  titulo?: string;
  cards: ObjetivoCard[];
}

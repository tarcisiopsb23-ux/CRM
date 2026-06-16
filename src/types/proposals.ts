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

export interface ScheduleConfig {
  firstValue: number;
  firstDate: string;
  dueDay: number;
  recurrence: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  installments: number;
  adjustments?: Record<number, number>;
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

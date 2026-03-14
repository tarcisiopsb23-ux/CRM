export type EtapaKanban =
  | 'leads_recebidos'
  | 'qualificados'
  | 'reuniao_agendada'
  | 'emissao_contrato'
  | 'efetivados'
  | 'desqualificado'
  | 'reuniao_sem_sucesso';

export type PrioridadeLead = 'baixa' | 'media' | 'alta' | 'urgente';

export type LeadProductService =
  | 'assessoria'
  | 'consultoria'
  | 'gmn'
  | 'site'
  | 'agente_ia'
  | 'outros';

export type LeadContactOrigin =
  | 'indicacao'
  | 'prospeccao'
  | 'campanha_google'
  | 'campanha_meta'
  | 'organico'
  | 'outras';

export type LeadGmnStatus =
  | 'nao_possui'
  | 'desatualizado_desativado'
  | 'desatualizado'
  | 'incompleto'
  | 'completo';

export type LeadAdsLevel = 'sem_anuncios' | 'poucos_anuncios' | 'muitos_anuncios';

export type LeadSocialMediaStatus =
  | 'sem_frequencia'
  | 'parado_inexistente'
  | 'frequente_sem_estrategia'
  | 'frequente_estruturado';

export type LeadLostReason =
  | 'capacidade_produtiva'
  | 'orcamento'
  | 'desqualificado'
  | 'barrado_pelo_sa'
  | 'sem_contato'
  | 'limite_da_franquia'
  | 'concorrencia'
  | 'perda_de_contato'
  | 'cadencia_excedida'
  | 'outros';

export interface Lead {
  id: string;
  organization_id: string;
  pipeline_id: string | null;
  stage_id: string;
  etapa_kanban: EtapaKanban;
  assigned_to: string | null;
  source: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  value: number;
  notes: string | null;
  nicho: string | null;
  prioridade: PrioridadeLead | null;
  first_contact_date?: string | null;
  last_contact_date?: string | null;
  product_service?: LeadProductService | null;
  cpf_cnpj?: string | number | null;
  contact_origin?: LeadContactOrigin | null;
  decision_maker?: boolean | null;
  decision_maker_name?: string | null;
  decision_maker_phone?: string | number | null;
  gbp_url?: string | null;
  instagram_url?: string | null;
  website_url?: string | null;
  gmn_status?: LeadGmnStatus | null;
  google_ads_level?: LeadAdsLevel | null;
  meta_ads_level?: LeadAdsLevel | null;
  social_media_status?: LeadSocialMediaStatus | null;
  lost_reason?: LeadLostReason | null;
  cadence?: string | null;
  temperature?: number | null;
  campaign_id?: string | null;
  metadata: Record<string, unknown>;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface LeadWithResponsavel extends Lead {
  responsavel?: { full_name: string } | null;
}

export const ETAPAS_KANBAN: { id: EtapaKanban; label: string }[] = [
  { id: 'leads_recebidos', label: 'Leads Recebidos' },
  { id: 'qualificados', label: 'Qualificados' },
  { id: 'reuniao_agendada', label: 'Reunião Agendada' },
  { id: 'emissao_contrato', label: 'Negociações' },
  { id: 'efetivados', label: 'Efetivados' },
  { id: 'desqualificado', label: 'Desqualificado' },
  { id: 'reuniao_sem_sucesso', label: 'Sem Sucesso' },
];

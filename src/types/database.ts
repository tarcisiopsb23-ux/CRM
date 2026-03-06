export type EtapaKanban =
  | 'leads_recebidos'
  | 'qualificados'
  | 'reuniao_agendada'
  | 'emissao_contrato'
  | 'efetivados'
  | 'desqualificado'
  | 'reuniao_sem_sucesso';

export type PrioridadeLead = 'baixa' | 'media' | 'alta' | 'urgente';

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
  { id: 'emissao_contrato', label: 'Emissão Contrato' },
  { id: 'efetivados', label: 'Efetivados' },
  { id: 'desqualificado', label: 'Desqualificado' },
  { id: 'reuniao_sem_sucesso', label: 'Reunião sem Sucesso' },
];

// Módulos disponíveis no C8 Control (CRM externo)
export const CRM_MODULES = [
  { id: 'leads',      label: 'Leads / Kanban' },
  { id: 'financial',  label: 'Financeiro' },
  { id: 'agenda',     label: 'Agenda' },
  { id: 'projects',   label: 'Projetos' },
  { id: 'reports',    label: 'Relatórios' },
  { id: 'whatsapp',   label: 'WhatsApp' },
  { id: 'campaigns',  label: 'Campanhas' },
] as const;

export type CrmModuleId = typeof CRM_MODULES[number]['id'];

export type SubscriptionStatus = 'ativo' | 'inadimplente' | 'bloqueado' | 'suspenso' | 'cancelado';

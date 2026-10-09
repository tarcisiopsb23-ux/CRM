// ─── Pipeline e Stages ────────────────────────────────────────────────────────

export interface CrmPipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

export interface CrmStage {
  id: string;
  pipeline_id: string;
  name: string;
  order: number;
  color: string;
}

// ─── Campos Personalizados ────────────────────────────────────────────────────

export type CustomFieldType = "text" | "number" | "date" | "select" | "boolean";

export interface CrmCustomField {
  id: string;
  name: string;
  field_key: string;
  field_type: CustomFieldType;
  options: string[] | null;   // apenas para field_type = 'select'
  required: boolean;
  order: number;
}

export interface CrmCustomValue {
  field_id: string;
  value: string;
}

// ─── Lead ─────────────────────────────────────────────────────────────────────

export type LeadTemperature = "quente" | "morno" | "frio";

export interface Lead {
  id: string;
  // Identificação
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  address: string | null;
  // Qualificação
  origin: string | null;
  temperature: LeadTemperature | null;
  tags: string | null;
  // Pipeline dinâmico
  pipeline_id: string | null;
  stage_id: string | null;
  status: string;             // mantido para compatibilidade legada
  // Negócio
  proposal_value: number | null;
  potential_value: number | null;
  product_id: string | null;
  product_name: string | null;
  whatsapp_link: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
  // Valores dos campos personalizados (carregados separadamente)
  custom_values?: CrmCustomValue[];
}

// ─── Dados do CRM (resposta da RPC get_crm_data) ──────────────────────────────

export interface CrmData {
  pipelines: CrmPipeline[];
  stages: CrmStage[];
  custom_fields: CrmCustomField[];
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

export type LeadTemperatureOption = { value: LeadTemperature; label: string; color: string };

export const TEMPERATURE_OPTIONS: LeadTemperatureOption[] = [
  { value: "quente", label: "🔥 Quente", color: "text-red-400" },
  { value: "morno",  label: "🌡️ Morno",  color: "text-yellow-400" },
  { value: "frio",   label: "❄️ Frio",   color: "text-blue-400" },
];

export const ORIGIN_OPTIONS = [
  "WhatsApp", "Instagram", "Facebook", "Google", "Indicação",
  "Site", "LinkedIn", "Email", "Telefone", "Outro",
];

// Paleta de cores para etapas do pipeline
export const STAGE_COLOR_OPTIONS = [
  { label: "Roxo",    value: "#6366f1" },
  { label: "Azul",    value: "#3b82f6" },
  { label: "Ciano",   value: "#06b6d4" },
  { label: "Âmbar",   value: "#f59e0b" },
  { label: "Laranja", value: "#f97316" },
  { label: "Rosa",    value: "#ec4899" },
  { label: "Verde",   value: "#10b981" },
  { label: "Vermelho",value: "#ef4444" },
  { label: "Cinza",   value: "#64748b" },
  { label: "Lima",    value: "#84cc16" },
];

// EMPTY_FORM para uso no LeadForm
export const EMPTY_LEAD_FORM: Omit<Lead, "id" | "created_at"> = {
  name: "",
  phone: null,
  email: null,
  company: null,
  address: null,
  origin: null,
  temperature: null,
  tags: null,
  pipeline_id: null,
  stage_id: null,
  status: "novo",
  proposal_value: null,
  potential_value: null,
  product_id: null,
  product_name: null,
  whatsapp_link: null,
  last_contact_at: null,
  next_followup_at: null,
  lost_reason: null,
  notes: null,
  custom_values: [],
};

// ─── Tipos legados mantidos para retrocompatibilidade ─────────────────────────
// Algumas partes do código ainda referenciam LeadStatus e COLUMNS.
// Serão removidos após migração completa do Kanban para pipeline dinâmico.

/** @deprecated Use CrmStage carregada do banco */
export type LeadStatus =
  | "novo" | "contato" | "proposta" | "negociacao"
  | "fechado" | "follow_up" | "perdido";

/** @deprecated Use stages carregadas da RPC get_crm_data */
export const COLUMNS: { id: LeadStatus; label: string; color: string }[] = [
  { id: "novo",       label: "Novo",       color: "border-t-slate-400" },
  { id: "contato",    label: "Contato",    color: "border-t-blue-400" },
  { id: "proposta",   label: "Proposta",   color: "border-t-yellow-400" },
  { id: "negociacao", label: "Negociação", color: "border-t-orange-400" },
  { id: "fechado",    label: "Fechado",    color: "border-t-emerald-400" },
  { id: "follow_up",  label: "Follow-up",  color: "border-t-cyan-400" },
  { id: "perdido",    label: "Perdido",    color: "border-t-red-400" },
];

/** @deprecated */
export const EMPTY_FORM = EMPTY_LEAD_FORM;

export type LeadStatus =
  | "novo"
  | "contato"
  | "proposta"
  | "negociacao"
  | "fechado"
  | "perdido";

export type LeadTemperature = "quente" | "morno" | "frio";

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  address: string | null;
  origin: string | null;
  temperature: LeadTemperature | null;
  proposal_value: number | null;
  potential_value: number | null;
  product_id: string | null;
  product_name: string | null;
  whatsapp_link: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  lost_reason: string | null;
  tags: string | null;
  notes: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at?: string | null;
}

export const COLUMNS: { id: LeadStatus; label: string; color: string }[] = [
  { id: "novo",       label: "Novo",        color: "border-t-slate-400" },
  { id: "contato",    label: "Contato",     color: "border-t-blue-400" },
  { id: "proposta",   label: "Proposta",    color: "border-t-yellow-400" },
  { id: "negociacao", label: "Negociação",  color: "border-t-orange-400" },
  { id: "fechado",    label: "Fechado",     color: "border-t-emerald-400" },
  { id: "perdido",    label: "Perdido",     color: "border-t-red-400" },
];

export const TEMPERATURE_OPTIONS: { value: LeadTemperature; label: string; color: string }[] = [
  { value: "quente", label: "🔥 Quente", color: "text-red-400" },
  { value: "morno",  label: "🌡️ Morno",  color: "text-yellow-400" },
  { value: "frio",   label: "❄️ Frio",   color: "text-blue-400" },
];

export const ORIGIN_OPTIONS = [
  "WhatsApp", "Instagram", "Facebook", "Google", "Indicação",
  "Site", "LinkedIn", "Email", "Telefone", "Outro",
];

export const EMPTY_FORM: Omit<Lead, "id" | "created_at"> = {
  name: "",
  phone: null,
  email: null,
  company: null,
  address: null,
  origin: null,
  temperature: null,
  proposal_value: null,
  potential_value: null,
  product_id: null,
  product_name: null,
  whatsapp_link: null,
  last_contact_at: null,
  next_followup_at: null,
  lost_reason: null,
  tags: null,
  notes: null,
  status: "novo",
};

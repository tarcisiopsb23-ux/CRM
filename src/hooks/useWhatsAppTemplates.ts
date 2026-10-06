/**
 * useWhatsAppTemplates
 *
 * Hook para gerenciar templates WhatsApp Business via whatsapp-template-service.
 * Nunca expõe tokens ao frontend — toda credencial resolvida no backend.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type TemplateStatus =
  | "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "DELETED";

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export interface TemplateComponent {
  type:    "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?:   string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

export interface WhatsAppTemplate {
  id:                string;
  organization_id:   string;
  meta_template_id:  string | null;
  waba_id:           string;
  connection_id:     string | null;
  name:              string;
  category:          TemplateCategory;
  language:          string;
  status:            TemplateStatus;
  status_meta:       string | null;
  rejection_reason:  string | null;
  components:        TemplateComponent[];
  variable_mapping:  Record<string, string>;   // { "1": "customer.name", ... }
  variable_examples: Record<string, string>;   // { "1": "João Silva", ... }
  meta_payload:      Record<string, unknown> | null;
  last_synced_at:    string | null;
  created_at:        string;
  updated_at:        string;
}

export interface CreateTemplateInput {
  connection_id:      string;
  name:               string;
  category:           TemplateCategory;
  language:           string;
  components:         TemplateComponent[];
  variable_mapping?:  Record<string, string>;
  variable_examples?: Record<string, string>;
}

export interface UpdateMappingInput {
  template_id:        string;
  connection_id:      string;
  variable_mapping:   Record<string, string>;
  variable_examples?: Record<string, string>;
}

// ── Helper: chama a Edge Function ─────────────────────────────────────────────

async function callTemplateService<T>(
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Não autenticado");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-template-service`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey":        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as string) ?? `HTTP ${res.status}`);
  }
  return json as T;
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useWhatsAppTemplates(connectionId?: string) {
  const organizationId = useOrganization();
  const qc             = useQueryClient();
  const queryKey       = ["whatsapp_templates", organizationId, connectionId];

  // ── Listagem (lê do banco local — sincronizado pela EF) ──────────────────
  const query = useQuery<WhatsAppTemplate[]>({
    queryKey,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as WhatsAppTemplate[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  // ── Sincronizar com Meta (atualiza status) ────────────────────────────────
  const sync = useMutation({
    mutationFn: async () => {
      if (!connectionId || !organizationId) throw new Error("connection_id e organization_id obrigatórios");
      return callTemplateService<{ synced: number; total: number }>("sync", {
        connection_id:   connectionId,
        organization_id: organizationId,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Listar e sincronizar da Meta ──────────────────────────────────────────
  const listFromMeta = useMutation({
    mutationFn: async () => {
      if (!connectionId || !organizationId) throw new Error("connection_id obrigatório");
      return callTemplateService<{ templates: WhatsAppTemplate[]; synced: number }>("list", {
        connection_id:   connectionId,
        organization_id: organizationId,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Criar template ────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      if (!organizationId) throw new Error("organization_id obrigatório");
      return callTemplateService<{ template: WhatsAppTemplate }>("create", {
        organization_id:   organizationId,
        connection_id:     input.connection_id,
        name:              input.name,
        category:          input.category,
        language:          input.language,
        components:        input.components,
        variable_mapping:  input.variable_mapping,
        variable_examples: input.variable_examples,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Atualizar mapeamento de variáveis ─────────────────────────────────────
  const updateMapping = useMutation({
    mutationFn: async (input: UpdateMappingInput) => {
      if (!organizationId) throw new Error("organization_id obrigatório");
      return callTemplateService<{ template: WhatsAppTemplate }>("update_mapping", {
        organization_id:   organizationId,
        connection_id:     input.connection_id,
        template_id:       input.template_id,
        variable_mapping:  input.variable_mapping,
        variable_examples: input.variable_examples,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Deletar template ──────────────────────────────────────────────────────
  const remove = useMutation({
    mutationFn: async ({ templateId }: { templateId: string }) => {
      if (!connectionId || !organizationId) throw new Error("connection_id obrigatório");
      return callTemplateService<{ deleted: boolean }>("delete", {
        organization_id: organizationId,
        connection_id:   connectionId,
        template_id:     templateId,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Retorna apenas templates com status aprovado (aptos para automações) */
  const approvedTemplates = (query.data ?? []).filter(t => t.status === "APPROVED");

  /** Retorna label legível do status */
  const statusLabel = (status: TemplateStatus): string => {
    const labels: Record<TemplateStatus, string> = {
      APPROVED:  "Aprovado",
      PENDING:   "Em análise",
      REJECTED:  "Rejeitado",
      PAUSED:    "Pausado",
      DISABLED:  "Desabilitado",
      IN_APPEAL: "Em recurso",
      DELETED:   "Excluído",
    };
    return labels[status] ?? status;
  };

  /** Retorna classe de cor do badge por status */
  const statusColor = (status: TemplateStatus): string => {
    const colors: Record<TemplateStatus, string> = {
      APPROVED:  "bg-emerald-100 text-emerald-700 border-emerald-200",
      PENDING:   "bg-amber-100 text-amber-700 border-amber-200",
      REJECTED:  "bg-red-100 text-red-700 border-red-200",
      PAUSED:    "bg-yellow-100 text-yellow-700 border-yellow-200",
      DISABLED:  "bg-slate-100 text-slate-600 border-slate-200",
      IN_APPEAL: "bg-blue-100 text-blue-700 border-blue-200",
      DELETED:   "bg-red-50 text-red-400 border-red-100",
    };
    return colors[status] ?? "bg-slate-100 text-slate-600";
  };

  /** Extrai variáveis de um template (ex: {{1}}, {{2}}) */
  const extractVariables = useCallback((template: WhatsAppTemplate): string[] => {
    const body = template.components.find(c => c.type === "BODY");
    if (!body?.text) return [];
    const matches = body.text.match(/\{\{(\d+)\}\}/g) ?? [];
    return [...new Set(matches)].sort();
  }, []);

  return {
    // Data
    templates:         query.data ?? [],
    approvedTemplates,
    isLoading:         query.isLoading,
    error:             query.error,

    // Mutations
    sync,
    listFromMeta,
    create,
    updateMapping,
    remove,

    // Helpers
    statusLabel,
    statusColor,
    extractVariables,
  };
}

// ── Campos disponíveis para mapeamento de variáveis ───────────────────────────

export const TEMPLATE_VARIABLE_FIELDS = [
  { value: "customer.name",          label: "Nome do cliente" },
  { value: "customer.phone",         label: "Telefone do cliente" },
  { value: "appointment.date",       label: "Data do agendamento" },
  { value: "appointment.time",       label: "Horário do agendamento" },
  { value: "appointment.weekday",    label: "Dia da semana" },
  { value: "appointment.service",    label: "Nome do serviço" },
  { value: "appointment.professional", label: "Nome do profissional" },
  { value: "company.name",           label: "Nome do estabelecimento" },
] as const;

export type TemplateVariableField = typeof TEMPLATE_VARIABLE_FIELDS[number]["value"];

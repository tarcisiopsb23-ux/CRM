/**
 * useC8ControlConfig — Lê as configurações globais do C8 Control do banco.
 *
 * Busca organization_integrations com integration_type = 'c8control'.
 * Usado por hooks do dashboard público (useAppointments, etc.) para obter
 * webhooks e configurações globais da agência sem depender de variáveis
 * de ambiente no frontend.
 *
 * Hierarquia de leitura para webhooks de Agenda:
 *   1. Config global da agência (organization_integrations, este hook) — configurada no Maestria
 *   2. Fallback: variável de ambiente VITE_N8N_AGENDA_WEBHOOK_URL
 *   Nota: cliente NÃO configura webhooks — apenas autoriza OAuth2 Google Calendar.
 *
 * Pode ser usado tanto no contexto da agência (useOrganization) quanto
 * no contexto do cliente (useClientAuth → auth.organization_id).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { C8ControlConfig } from "@/types/settings";

const STALE_MS = 5 * 60 * 1000; // 5 minutos — config muda raramente

export function useC8ControlConfig(organizationId: string | undefined) {
  return useQuery<C8ControlConfig>({
    queryKey: ["c8_control_config", organizationId],
    queryFn: async () => {
      if (!organizationId) return {};
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", organizationId)
        .eq("integration_type", "c8control")
        .maybeSingle();
      if (error) throw error;
      return (data?.config as C8ControlConfig) ?? {};
    },
    enabled:   !!organizationId,
    staleTime: STALE_MS,
    gcTime:    10 * 60 * 1000,
  });
}

/**
 * Resolve a configuração do webhook de Agenda.
 * Usa a config global da agência (organization_integrations, integration_type='c8control')
 * com fallback para variáveis de ambiente.
 *
 * O cliente não configura webhooks — apenas autoriza OAuth2 Google Calendar.
 * Toda a configuração n8n é universal (agência → todos os clientes).
 */
export function resolveAgendaWebhookConfig(
  orgConfig: C8ControlConfig | undefined
): { webhookUrl: string; token: string; enabled: boolean } {
  // 1. Config global da agência (Maestria → Configurações → C8 Control)
  if (orgConfig?.agendaWebhookUrl?.trim()) {
    return {
      webhookUrl: orgConfig.agendaWebhookUrl.trim(),
      token:      orgConfig.agendaWebhookToken?.trim() ?? "",
      enabled:    true,
    };
  }

  // 2. Fallback: variável de ambiente
  const envUrl   = (import.meta.env.VITE_N8N_AGENDA_WEBHOOK_URL   as string | undefined)?.trim() ?? "";
  const envToken = (import.meta.env.VITE_N8N_AGENDA_WEBHOOK_TOKEN as string | undefined)?.trim() ?? "";

  return {
    webhookUrl: envUrl,
    token:      envToken,
    enabled:    !!envUrl,
  };
}

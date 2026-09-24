/**
 * useAppointments — Hook para gerenciar agendamentos do módulo Agenda.
 *
 * Acessa o Banco A (supabase) via RPCs SECURITY DEFINER.
 *
 * Integração n8n bidirecional — configuração universal da agência:
 *   • Webhooks configurados no Maestria (Configurações → C8 Control)
 *   • Valem para TODOS os clientes — configuração única da agência
 *   • Fallback: variável de ambiente VITE_N8N_AGENDA_WEBHOOK_URL
 *   • Cliente configura apenas autorização OAuth2 Google Calendar (ConfigIntegracoesPage)
 *
 * Eventos disparados:
 *   appointment.created   → upsert sem appointment_id
 *   appointment.updated   → upsert com appointment_id | confirm | complete
 *   appointment.cancelled → cancel
 */

import { useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { resolveAgendaWebhookConfig } from "@/hooks/useC8ControlConfig";
import { format, startOfMonth, endOfMonth, addDays } from "date-fns";
import type { C8ControlConfig } from "@/types/settings";

// ─── Webhook n8n ──────────────────────────────────────────────────────────────

async function notifyN8n(
  event: "appointment.created" | "appointment.updated" | "appointment.cancelled",
  appointmentId: string,
  clientId: string,
  _clientN8nConfig: null,  // não usado — webhooks são configurados globalmente pela agência
  orgConfig?: C8ControlConfig | null
) {
  const { webhookUrl, token, enabled } = resolveAgendaWebhookConfig(
    orgConfig ?? undefined
  );

  if (!webhookUrl || !enabled) return;

  try {
    await fetch(webhookUrl, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Webhook-Token": token } : {}),
      },
      body: JSON.stringify({
        event,
        appointment_id: appointmentId,
        client_id:      clientId,
        source:         "manual",
      }),
    });
  } catch (e) {
    console.warn("[useAppointments] Falha ao notificar n8n:", e);
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type AppointmentSource =
  | "manual"
  | "public_form"
  | "google_calendar"
  | "whatsapp";

export interface Appointment {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  service_id: string | null;
  service_name: string;
  professional_id: string | null;
  professional_name: string | null;
  start_at: string;
  end_at: string;
  duration_min: number;
  status: AppointmentStatus;
  cancelled_reason: string | null;
  source: AppointmentSource;
  google_event_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AppointmentInput {
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  service_id?: string | null;
  service_name: string;
  professional_id?: string | null;
  professional_name?: string | null;
  start_at: string;
  end_at: string;
  notes?: string | null;
  source?: AppointmentSource;
  appointment_id?: string;
}

export interface AvailableSlot {
  start_at: string;
  end_at: string;
  available: boolean;
  booked: number;
}

export interface SlotResult {
  date: string;
  slots: AvailableSlot[];
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useAppointments(options?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: AppointmentStatus;
}) {
  const { auth } = useClientAuth();
  const clientId     = auth?.id;
  const organizationId = auth?.organization_id;
  const qc = useQueryClient();

  const dateFrom = options?.dateFrom ?? startOfMonth(new Date());
  const dateTo   = options?.dateTo   ?? endOfMonth(addDays(new Date(), 60));
  const status   = options?.status;

  const qk = [
    "appointments",
    clientId,
    format(dateFrom, "yyyy-MM-dd"),
    format(dateTo,   "yyyy-MM-dd"),
    status ?? "all",
  ];

  // Configuração global da agência (universal para todos os clientes).
  // O cliente não configura webhooks — apenas autoriza OAuth2 Google Calendar.
  const orgConfigRef      = useRef<C8ControlConfig | null>(null);
  const configLoadedRef   = useRef(false);

  const loadWebhookConfigs = useCallback(async () => {
    if (!organizationId || configLoadedRef.current) return;
    configLoadedRef.current = true;

    try {
      const { data } = await supabase
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", organizationId)
        .eq("integration_type", "c8control")
        .maybeSingle();

      const orgCfg = data?.config as C8ControlConfig | null;
      if (orgCfg) orgConfigRef.current = orgCfg;
    } catch {
      // silencioso — fallback para env vars
    }
  }, [organizationId]);

  // ── Buscar agendamentos ───────────────────────────────────────────────────
  const query = useQuery<Appointment[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("get_appointments", {
        p_client_id:  clientId,
        p_date_from:  format(dateFrom, "yyyy-MM-dd"),
        p_date_to:    format(dateTo,   "yyyy-MM-dd"),
        p_status:     status ?? null,
        p_limit:      500,
        p_offset:     0,
      });
      if (error) throw error;
      return (data?.data ?? []) as Appointment[];
    },
    enabled:   !!clientId,
    staleTime: 30_000,
  });

  // ── Criar / atualizar agendamento ─────────────────────────────────────────
  const upsert = useMutation({
    mutationFn: async (input: AppointmentInput) => {
      if (!clientId) throw new Error("Sem client_id");
      const { data, error } = await supabase.rpc("upsert_appointment", {
        p_client_id:        clientId,
        p_customer_name:    input.customer_name,
        p_customer_phone:   input.customer_phone    ?? null,
        p_customer_email:   input.customer_email    ?? null,
        p_service_id:       input.service_id        ?? null,
        p_service_name:     input.service_name,
        p_start_at:         input.start_at,
        p_end_at:           input.end_at,
        p_notes:            input.notes             ?? null,
        p_source:           input.source            ?? "manual",
        p_metadata:         {},
        p_appointment_id:   input.appointment_id    ?? null,
        p_professional_id:  input.professional_id   ?? null,
        p_professional_name: input.professional_name ?? null,
      });
      if (error) throw error;
      return data as { success: boolean; id: string };
    },
    onSuccess: async (data, input) => {
      qc.invalidateQueries({ queryKey: ["appointments", clientId] });
      if (data?.id) {
        const event = input.appointment_id ? "appointment.updated" : "appointment.created";
        await loadWebhookConfigs();
        notifyN8n(event, data.id, clientId!, null, orgConfigRef.current);
      }
    },
  });

  // ── Cancelar agendamento ──────────────────────────────────────────────────
  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (!clientId) throw new Error("Sem client_id");
      const { data, error } = await supabase.rpc("cancel_appointment", {
        p_appointment_id: id,
        p_client_id:      clientId,
        p_reason:         reason ?? null,
      });
      if (error) throw error;
      return data as { success: boolean; google_event_id: string | null };
    },
    onSuccess: async (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["appointments", clientId] });
      await loadWebhookConfigs();
      notifyN8n("appointment.cancelled", vars.id, clientId!, null, orgConfigRef.current);
    },
  });

  // ── Confirmar agendamento ─────────────────────────────────────────────────
  const confirm = useMutation({
    mutationFn: async (id: string) => {
      if (!clientId) throw new Error("Sem client_id");
      const { error } = await supabase
        .from("client_appointments")
        .update({ status: "confirmed" })
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
      return id;
    },
    onSuccess: async (id) => {
      qc.invalidateQueries({ queryKey: ["appointments", clientId] });
      await loadWebhookConfigs();
      notifyN8n("appointment.updated", id, clientId!, null, orgConfigRef.current);
    },
  });

  // ── Marcar como concluído ─────────────────────────────────────────────────
  const complete = useMutation({
    mutationFn: async (id: string) => {
      if (!clientId) throw new Error("Sem client_id");
      const { error } = await supabase
        .from("client_appointments")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
      return id;
    },
    onSuccess: async (id) => {
      qc.invalidateQueries({ queryKey: ["appointments", clientId] });
      await loadWebhookConfigs();
      notifyN8n("appointment.updated", id, clientId!, null, orgConfigRef.current);
    },
  });

  return {
    appointments:  query.data ?? [],
    isLoading:     query.isLoading,
    error:         query.error,
    refetch:       query.refetch,
    upsert,
    cancel,
    confirm,
    complete,
  };
}

// ─── Hook de slots disponíveis ────────────────────────────────────────────────

export function useAvailableSlots(
  clientId: string | undefined,
  date: Date | null,
  serviceId?: string | null
) {
  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  return useQuery<SlotResult>({
    queryKey: ["available_slots", clientId, dateStr, serviceId],
    queryFn: async () => {
      if (!clientId || !dateStr) return { date: dateStr ?? "", slots: [] };
      const { data, error } = await supabase.rpc("get_available_slots", {
        p_client_id:  clientId,
        p_date:       dateStr,
        p_service_id: serviceId ?? null,
      });
      if (error) throw error;
      return data as SlotResult;
    },
    enabled:   !!clientId && !!dateStr,
    staleTime: 60_000,
  });
}

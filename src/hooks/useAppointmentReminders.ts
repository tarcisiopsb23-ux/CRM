/**
 * useAppointmentReminders
 *
 * Hook para gerenciar configurações e fila de lembretes de agendamento.
 * Cobre dois aspectos:
 *   1. appointment_reminder_settings — regras de lembrete por cliente
 *   2. appointment_reminders         — fila de lembretes gerados
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ReminderChannel  = "whatsapp" | "email";
export type ReminderTimingType = "previous_day" | "hours_before" | "same_day" | "custom";
export type ReminderStatus   = "pending" | "processing" | "sent" | "failed" | "cancelled";

export interface AppointmentReminderSetting {
  id:                    string;
  client_id:             string;
  organization_id:       string;
  channel:               ReminderChannel;
  enabled:               boolean;
  timing_type:           ReminderTimingType;
  days_before:           number;
  hours_before:          number | null;
  send_time:             string | null;    // HH:MM
  whatsapp_template_id:  string | null;
  email_subject:         string | null;
  email_body:            string | null;
  created_at:            string;
  updated_at:            string;
  // join opcional
  whatsapp_templates?: {
    id: string; name: string; status: string; language: string;
  } | null;
}

export interface AppointmentReminder {
  id:                  string;
  organization_id:     string;
  client_id:           string;
  appointment_id:      string;
  reminder_setting_id: string | null;
  channel:             ReminderChannel;
  scheduled_at:        string;
  status:              ReminderStatus;
  sent_at:             string | null;
  failed_at:           string | null;
  cancelled_at:        string | null;
  last_error:          string | null;
  error_retryable:     boolean | null;
  provider_message_id: string | null;
  attempts:            number;
  max_attempts:        number;
  payload:             Record<string, unknown>;
  created_at:          string;
  updated_at:          string;
  // join opcional
  appointment_reminder_settings?: Pick<
    AppointmentReminderSetting,
    "timing_type" | "send_time" | "days_before" | "hours_before"
  > | null;
}

export interface UpsertReminderSettingInput {
  client_id:            string;
  channel:              ReminderChannel;
  enabled:              boolean;
  timing_type:          ReminderTimingType;
  days_before?:         number;
  hours_before?:        number | null;
  send_time?:           string | null;
  whatsapp_template_id?: string | null;
  email_subject?:       string | null;
  email_body?:          string | null;
  id?:                  string;    // se informado, atualiza; senão cria
}

// ── Hook: configurações de lembrete ──────────────────────────────────────────

export function useReminderSettings(clientId?: string, externalOrganizationId?: string) {
  const hookOrganizationId = useOrganization();
  const organizationId     = externalOrganizationId ?? hookOrganizationId;
  const qc             = useQueryClient();
  const queryKey       = ["reminder_settings", organizationId, clientId];

  const query = useQuery<AppointmentReminderSetting[]>({
    queryKey,
    queryFn: async () => {
      if (!organizationId || !clientId) return [];
      const { data, error } = await supabase
        .from("appointment_reminder_settings")
        .select(`
          *,
          whatsapp_templates ( id, name, status, language )
        `)
        .eq("client_id", clientId)
        .eq("organization_id", organizationId)
        .order("channel")
        .order("timing_type");
      if (error) throw error;
      return (data ?? []) as AppointmentReminderSetting[];
    },
    enabled: !!organizationId && !!clientId,
    staleTime: 30_000,
  });

  const upsert = useMutation({
    mutationFn: async (input: UpsertReminderSettingInput) => {
      if (!organizationId) throw new Error("organization_id obrigatório");

      const payload = {
        client_id:            input.client_id,
        organization_id:      organizationId,
        channel:              input.channel,
        enabled:              input.enabled,
        timing_type:          input.timing_type,
        days_before:          input.days_before   ?? 1,
        hours_before:         input.hours_before  ?? null,
        send_time:            input.send_time     ?? null,
        whatsapp_template_id: input.whatsapp_template_id ?? null,
        email_subject:        input.email_subject ?? null,
        email_body:           input.email_body    ?? null,
      };

      if (input.id) {
        // Atualiza existente
        const { data, error } = await supabase
          .from("appointment_reminder_settings")
          .update(payload)
          .eq("id", input.id)
          .eq("organization_id", organizationId)
          .select()
          .single();
        if (error) throw error;
        return data as AppointmentReminderSetting;
      } else {
        // Cria nova regra
        const { data, error } = await supabase
          .from("appointment_reminder_settings")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as AppointmentReminderSetting;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (settingId: string) => {
      const { error } = await supabase
        .from("appointment_reminder_settings")
        .delete()
        .eq("id", settingId)
        .eq("organization_id", organizationId ?? "");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("appointment_reminder_settings")
        .update({ enabled })
        .eq("id", id)
        .eq("organization_id", organizationId ?? "");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // Shortcuts: regras por canal
  const whatsappSettings = (query.data ?? []).filter(s => s.channel === "whatsapp");
  const emailSettings    = (query.data ?? []).filter(s => s.channel === "email");

  return {
    settings:           query.data ?? [],
    whatsappSettings,
    emailSettings,
    isLoading:          query.isLoading,
    error:              query.error,
    upsert,
    remove,
    toggleEnabled,
  };
}

// ── Hook: fila de lembretes de um agendamento ─────────────────────────────────

export function useAppointmentReminders(appointmentId?: string, externalOrganizationId?: string) {
  const hookOrganizationId = useOrganization();
  const organizationId     = externalOrganizationId ?? hookOrganizationId;
  const qc             = useQueryClient();
  const queryKey       = ["appointment_reminders", appointmentId];

  const query = useQuery<AppointmentReminder[]>({
    queryKey,
    queryFn: async () => {
      if (!appointmentId) return [];
      const { data, error } = await supabase
        .from("appointment_reminders")
        .select(`
          *,
          appointment_reminder_settings (
            timing_type, send_time, days_before, hours_before
          )
        `)
        .eq("appointment_id", appointmentId)
        .order("scheduled_at");
      if (error) throw error;
      return (data ?? []) as AppointmentReminder[];
    },
    enabled: !!appointmentId,
    staleTime: 15_000,
  });

  // Label legível do status
  const statusLabel = (status: ReminderStatus): string => ({
    pending:    "Agendado",
    processing: "Processando",
    sent:       "Enviado",
    failed:     "Falhou",
    cancelled:  "Cancelado",
  }[status] ?? status);

  // Cor do badge por status
  const statusColor = (status: ReminderStatus): string => ({
    pending:    "bg-amber-100 text-amber-700",
    processing: "bg-blue-100 text-blue-700",
    sent:       "bg-emerald-100 text-emerald-700",
    failed:     "bg-red-100 text-red-700",
    cancelled:  "bg-slate-100 text-slate-500",
  }[status] ?? "bg-slate-100 text-slate-600");

  // Label do timing
  const timingLabel = (s: AppointmentReminderSetting): string => {
    if (s.timing_type === "hours_before") {
      return `${s.hours_before}h antes`;
    }
    if (s.timing_type === "previous_day") {
      return `Dia anterior às ${s.send_time ?? "18:00"}`;
    }
    if (s.timing_type === "same_day") {
      return `Mesmo dia às ${s.send_time ?? "08:00"}`;
    }
    return `${s.days_before}d antes às ${s.send_time ?? ""}`;
  };

  return {
    reminders:    query.data ?? [],
    isLoading:    query.isLoading,
    error:        query.error,
    statusLabel,
    statusColor,
    timingLabel,
    refetch:      query.refetch,
  };
}

// ── Hook: contadores para o dashboard ────────────────────────────────────────

export function useReminderStats(clientId?: string, externalOrganizationId?: string) {
  const hookOrganizationId = useOrganization();
  const organizationId     = externalOrganizationId ?? hookOrganizationId;

  return useQuery({
    queryKey: ["reminder_stats", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId) return null;
      let query = supabase
        .from("appointment_reminders")
        .select("status", { count: "exact", head: false })
        .eq("organization_id", organizationId);
      if (clientId) query = query.eq("client_id", clientId);

      const { data } = await query;
      const counts = (data ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});

      return {
        pending:    counts.pending    ?? 0,
        processing: counts.processing ?? 0,
        sent:       counts.sent       ?? 0,
        failed:     counts.failed     ?? 0,
        cancelled:  counts.cancelled  ?? 0,
        total:      Object.values(counts).reduce((a, b) => a + b, 0),
      };
    },
    enabled:   !!organizationId,
    staleTime: 60_000,
  });
}

/**
 * useScheduleConfig — Configuração de disponibilidade, serviços e profissionais da Agenda.
 *
 * Serviços de agenda vinculam opcionalmente a um produto do CRM (crm_product_id).
 * Quando vinculado, name/description/price são herdados do produto —
 * apenas duration_min e color são configurados aqui.
 *
 * Configurações de exibição (show_services, show_professionals) controlam
 * o que aparece no formulário público /booking/:slug.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ScheduleConfigDay {
  id?: string;
  client_id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
  slot_duration_min: number;
  max_per_slot: number;
  active: boolean;
  show_services?: boolean;
  show_professionals?: boolean;
}

/** Serviço de agenda — vincula opcionalmente a um produto do CRM */
export interface ScheduleService {
  id: string;
  client_id: string;
  /** crm_product_id: preenchido quando herdado de produto CRM */
  crm_product_id: string | null;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  color: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleServiceInput {
  crm_product_id?: string | null;
  name: string;
  description?: string | null;
  duration_min: number;
  price?: number;
  color: string;
  active: boolean;
}

/** Configurações de exibição do formulário público */
export interface AgendaDisplayConfig {
  show_services: boolean;
  show_professionals: boolean;
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultDayConfig(weekday: number): ScheduleConfigDay {
  return {
    weekday,
    start_time:         "08:00",
    end_time:           "18:00",
    break_start:        null,
    break_end:          null,
    slot_duration_min:  60,
    max_per_slot:       1,
    active:             weekday >= 1 && weekday <= 5,
    show_services:      true,
    show_professionals: false,
  };
}

export function getDefaultSchedule(): ScheduleConfigDay[] {
  return Array.from({ length: 7 }, (_, i) => defaultDayConfig(i));
}

// ─── useScheduleConfig ────────────────────────────────────────────────────────

export function useScheduleConfig() {
  const { auth } = useClientAuth();
  const dc       = useDynamicClient();
  const clientId = auth?.id;
  const qc = useQueryClient();

  const configQk   = ["schedule_config",   clientId];
  const servicesQk = ["schedule_services", clientId];
  const displayQk  = ["agenda_display",    clientId];

  // ── Configuração de dias ──────────────────────────────────────────────────
  const configQuery = useQuery<ScheduleConfigDay[]>({
    queryKey: configQk,
    queryFn: async () => {
      if (!clientId || !dc) return getDefaultSchedule();
      const { data, error } = await dc
        .from("client_schedule_config")
        .select("*")
        .eq("client_id", clientId)
        .order("weekday");
      if (error) throw error;
      const saved = (data ?? []) as ScheduleConfigDay[];
      return Array.from({ length: 7 }, (_, weekday) =>
        saved.find((d) => d.weekday === weekday) ?? defaultDayConfig(weekday)
      );
    },
    enabled:   !!clientId && !!dc,
    staleTime: 60_000,
  });

  // ── Configurações de exibição ─────────────────────────────────────────────
  const displayQuery = useQuery<AgendaDisplayConfig>({
    queryKey: displayQk,
    queryFn: async () => {
      if (!clientId) return { show_services: true, show_professionals: false };
      const { data } = await supabase.rpc("get_agenda_display_config", {
        p_client_id: clientId,
      });
      const row = Array.isArray(data) ? data[0] : data;
      return {
        show_services:      row?.show_services      ?? true,
        show_professionals: row?.show_professionals ?? false,
      };
    },
    enabled:   !!clientId,
    staleTime: 60_000,
  });

  // ── Salvar todos os dias ──────────────────────────────────────────────────
  const saveAllDays = useMutation({
    mutationFn: async (days: ScheduleConfigDay[]) => {
      if (!clientId || !dc) throw new Error("Sem client_id ou sessão");
      const payload = days.map((d) => ({ ...d, client_id: clientId }));
      const { error } = await dc
        .from("client_schedule_config")
        .upsert(payload, { onConflict: "client_id,weekday" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: configQk });
      qc.invalidateQueries({ queryKey: displayQk });
    },
  });

  // ── Salvar configurações de exibição ─────────────────────────────────────
  const saveDisplayConfig = useMutation({
    mutationFn: async (config: AgendaDisplayConfig) => {
      if (!clientId || !dc) throw new Error("Sem client_id ou sessão");
      const { error } = await dc
        .from("client_schedule_config")
        .update({
          show_services:      config.show_services,
          show_professionals: config.show_professionals,
        })
        .eq("client_id", clientId);
      if (error) throw error;
      // Se não tem nenhuma linha ainda, cria com os defaults para todos os dias
      const { count } = await dc
        .from("client_schedule_config")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId);
      if ((count ?? 0) === 0) {
        const rows = getDefaultSchedule().map((d) => ({
          ...d,
          client_id:          clientId,
          show_services:      config.show_services,
          show_professionals: config.show_professionals,
        }));
        await dc.from("client_schedule_config").insert(rows);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: displayQk }),
  });

  // ── Serviços ──────────────────────────────────────────────────────────────
  const servicesQuery = useQuery<ScheduleService[]>({
    queryKey: servicesQk,
    queryFn: async () => {
      if (!clientId || !dc) return [];
      const { data, error } = await dc
        .from("client_schedule_services")
        .select("*")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ScheduleService[];
    },
    enabled:   !!clientId && !!dc,
    staleTime: 60_000,
  });

  const upsertService = useMutation({
    mutationFn: async (input: ScheduleServiceInput & { id?: string }) => {
      if (!clientId || !dc) throw new Error("Sem client_id ou sessão");
      const payload = { ...input, client_id: clientId };
      if (input.id) {
        const { error } = await dc
          .from("client_schedule_services")
          .update(payload)
          .eq("id", input.id)
          .eq("client_id", clientId);
        if (error) throw error;
      } else {
        const { error } = await dc
          .from("client_schedule_services")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesQk }),
  });

  const removeService = useMutation({
    mutationFn: async (id: string) => {
      if (!clientId || !dc) throw new Error("Sem client_id ou sessão");
      const { error } = await dc
        .from("client_schedule_services")
        .delete()
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesQk }),
  });

  const toggleService = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!clientId || !dc) throw new Error("Sem client_id ou sessão");
      const { error } = await dc
        .from("client_schedule_services")
        .update({ active })
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesQk }),
  });

  return {
    schedule:         configQuery.data ?? getDefaultSchedule(),
    scheduleLoading:  configQuery.isLoading,
    saveAllDays,

    displayConfig:    displayQuery.data ?? { show_services: true, show_professionals: false },
    displayLoading:   displayQuery.isLoading,
    saveDisplayConfig,

    services:         servicesQuery.data ?? [],
    servicesLoading:  servicesQuery.isLoading,
    upsertService,
    removeService,
    toggleService,
  };
}

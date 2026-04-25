import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Database } from "@/types/supabase";
import type { N8nConfig } from "@/types/settings";

type EventType = Database["public"]["Enums"]["event_type"];
const VALID_EVENT_TYPES: EventType[] = [
  "reuniao", "ligacao", "entrega", "lembrete", "outro",
  "captacao", "reuniao_integracao", "reuniao_planejamento", "reuniao_periodica", "apresentacao_proposta",
];
const asEventType = (s: string): EventType => (VALID_EVENT_TYPES.includes(s as EventType) ? (s as EventType) : "outro");

/** Dispara webhook do Google Calendar no n8n (fire-and-forget) */
async function fireCalendarWebhook(
  config: N8nConfig | undefined,
  action: "create" | "update" | "delete",
  event: Partial<EventRow> & { id?: string },
  extra?: Record<string, unknown>
) {
  const url = config?.calendarWebhookUrl?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config?.apiKey ? { "x-api-key": config.apiKey, Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ action, event, ...extra }),
    });
  } catch {
    // fire-and-forget — não bloqueia o fluxo principal
  }
}

/** Evento compatível com o schema events do DB. `type` é alias de `event_type` para compatibilidade com Agenda */
export interface EventRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  team_id?: string | null;
  assigned_to?: string | null;
  title: string;
  description: string | null;
  type: string;
  event_type?: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  is_freelancer?: boolean;
  supplier_id?: string | null;
  clickup_task_id?: string | null;
  gcal_event_id?: string | null;
  recurrence_group_id?: string | null;
  meeting_url?: string | null;
  all_day?: boolean | null;
}

export function useEvents(organizationId: string | undefined, start?: Date, end?: Date) {
  const qc = useQueryClient();

  // Busca config do n8n para disparar webhook do Google Calendar
  const n8nQuery = useQuery({
    queryKey: ["settings", organizationId, "n8n"],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data } = await supabase
        .from("organization_integrations")
        .select("config")
        .eq("organization_id", organizationId)
        .eq("integration_type", "n8n")
        .maybeSingle();
      return (data?.config ?? null) as N8nConfig | null;
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["events", organizationId, start?.toISOString(), end?.toISOString()],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("events")
        .select("*")
        .eq("organization_id", organizationId)
        .order("start_at");
      if (start) q = q.gte("start_at", start.toISOString());
      if (end) q = q.lte("start_at", end.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...r, type: r.event_type ?? r.type })) as EventRow[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<EventRow> & { title: string; start_at: string; end_at: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { type, metadata, ...rest } = input;
      const payload = {
        ...rest,
        organization_id: organizationId,
        event_type: asEventType((type ?? rest.event_type) ?? "outro"),
        ...(metadata !== undefined && { metadata: toJson(metadata as Record<string, unknown>) }),
      };
      const { data, error } = await supabase.from("events").insert(payload).select().single();
      if (error) throw error;
      const result = { ...data, type: (data as { event_type?: string }).event_type ?? (data as { type?: string }).type } as EventRow;
      void fireCalendarWebhook(n8nQuery.data ?? undefined, "create", result);
      // Fire ClickUp/agenda sync webhook
      const agendaWebhook = import.meta.env.VITE_N8N_WEBHOOK_AGENDA_SYNC;
      if (agendaWebhook) {
        fetch(agendaWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", event: result }),
        }).catch(() => {});
      }
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<EventRow> & { id: string }) => {
      const { type, metadata, ...rest } = input;
      const payload = {
        ...rest,
        ...(type !== undefined && { event_type: asEventType(type) }),
        ...(metadata !== undefined && { metadata: toJson(metadata as Record<string, unknown>) }),
      };
      const { data, error } = await supabase.from("events").update(payload).eq("id", id).select().single();
      if (error) throw error;
      const result = { ...data, type: (data as { event_type?: string }).event_type ?? (data as { type?: string }).type } as EventRow;
      void fireCalendarWebhook(n8nQuery.data ?? undefined, "update", result);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
      void fireCalendarWebhook(n8nQuery.data ?? undefined, "delete", { id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", organizationId] }),
  });

  /** Remove com escopo de série — dispara webhook com gcal_scope */
  const removeWithScope = async (
    id: string,
    gcalEventId: string | null | undefined,
    scope: "this_only" | "this_and_following" | "all",
    parentGcalEventId?: string | null,
    startAt?: string | null
  ) => {
    const webhookGcalId = scope === "this_only"
      ? (parentGcalEventId ?? gcalEventId)
      : (gcalEventId ?? parentGcalEventId);

    if (scope === "all") {
      // Para "all": filhos já foram deletados antes de chamar esta função
      // Só dispara o webhook — não tenta deletar nem buscar o evento
      void fireCalendarWebhook(
        n8nQuery.data ?? undefined,
        "delete",
        { id, gcal_event_id: webhookGcalId },
        { gcal_scope: scope }
      );
      qc.invalidateQueries({ queryKey: ["events", organizationId] });
      return;
    }

    // Para this_only e this_and_following: busca start_at e deleta o evento
    let eventStartAt = startAt;
    if (!eventStartAt && scope === "this_only") {
      const { data } = await supabase.from("events").select("start_at").eq("id", id).single();
      eventStartAt = data?.start_at ?? null;
    }
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw error;
    void fireCalendarWebhook(
      n8nQuery.data ?? undefined,
      "delete",
      { id, gcal_event_id: webhookGcalId, start_at: eventStartAt },
      { gcal_scope: scope }
    );
    qc.invalidateQueries({ queryKey: ["events", organizationId] });
  };

  /** Atualiza com escopo de série — dispara webhook com gcal_scope */
  const updateWithScope = async (
    input: Partial<EventRow> & { id: string },
    scope: "this_only" | "this_and_following" | "all",
    parentGcalEventId?: string | null
  ) => {
    const { id, type, metadata, ...rest } = input;
    const payload = {
      ...rest,
      ...(type !== undefined && { event_type: asEventType(type) }),
      ...(metadata !== undefined && { metadata: toJson(metadata as Record<string, unknown>) }),
    };
    const { data, error } = await supabase.from("events").update(payload).eq("id", id).select().single();
    if (error) throw error;
    const result = { ...data, type: (data as { event_type?: string }).event_type ?? (data as { type?: string }).type } as EventRow;
    void fireCalendarWebhook(
      n8nQuery.data ?? undefined,
      "update",
      { ...result, gcal_event_id: result.gcal_event_id ?? parentGcalEventId },
      { gcal_scope: scope }
    );
    qc.invalidateQueries({ queryKey: ["events", organizationId] });
    return result;
  };

  return { ...query, create, update, remove, removeWithScope, updateWithScope };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Database } from "@/types/supabase";

type EventType = Database["public"]["Enums"]["event_type"];
const VALID_EVENT_TYPES: EventType[] = ["reuniao", "ligacao", "entrega", "lembrete", "outro"];
const asEventType = (s: string): EventType => (VALID_EVENT_TYPES.includes(s as EventType) ? (s as EventType) : "outro");

/** Evento compatível com o schema events do DB. `type` é alias de `event_type` para compatibilidade com Agenda */
export interface EventRow {
  id: string;
  organization_id: string;
  created_by: string | null;
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
}

export function useEvents(organizationId: string | undefined, start?: Date, end?: Date) {
  const qc = useQueryClient();

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
      if (end) q = q.lte("end_at", end.toISOString());
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
      return { ...data, type: (data as { event_type?: string }).event_type ?? (data as { type?: string }).type } as EventRow;
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
      return { ...data, type: (data as { event_type?: string }).event_type ?? (data as { type?: string }).type } as EventRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", organizationId] }),
  });

  return { ...query, create, update, remove };
}

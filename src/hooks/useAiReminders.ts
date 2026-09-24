import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface AiReminder {
  id: string;
  client_id: string;
  text: string;
  due_date: string | null;
  completed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useAiReminders(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["ai_reminders", clientId];

  const query = useQuery<AiReminder[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("ai_reminders")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AiReminder[];
    },
    enabled: !!dc && !!clientId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: {
      client_id: string;
      text: string;
      due_date?: string | null;
      created_by?: string | null;
    }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("ai_reminders")
        .insert({ ...input, completed: false })
        .select()
        .single();
      if (error) throw error;
      return data as AiReminder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const toggleComplete = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("ai_reminders").update({ completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("ai_reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { ...query, create, toggleComplete, remove };
}

/**
 * useContentBriefs
 * CRUD de briefings de conteúdo (content_briefs).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type BriefStatus = "rascunho" | "enviado" | "aceito" | "revisao";

export interface ClientTask {
  id:       string;
  task:     string;
  status:   "pendente" | "concluido";
  due_date: string | null;
}

export interface ContentBrief {
  id:              string;
  organization_id: string;
  client_id:       string;
  campaign_id:     string | null;
  content_item_id: string | null;
  title:           string;
  objective:       string | null;
  target_audience: string | null;
  key_messages:    string[];
  tone_of_voice:   string | null;
  references:      string[];
  restrictions:    string | null;
  deadline:        string | null;
  notes:           string | null;
  status:          BriefStatus;
  client_tasks:    ClientTask[];
  created_by:      string | null;
  created_at:      string;
  updated_at:      string;
  // Joins
  client_name?:    string;
}

export type ContentBriefInsert = Omit<
  ContentBrief,
  "id" | "organization_id" | "created_at" | "updated_at"
> & { organization_id?: string };

export function useContentBriefs(
  organizationId: string | undefined,
  clientId?: string,
) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ["content-briefs", organizationId, clientId],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<ContentBrief[]> => {
      if (!organizationId) return [];

      let q = supabase
        .from("content_briefs")
        .select("*, clients:client_id ( name )")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (clientId) q = q.eq("client_id", clientId);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as ContentBrief),
        client_name: (row.clients as { name: string } | null)?.name ?? null,
      }));
    },
  });

  const create = useMutation({
    mutationFn: async (input: Omit<ContentBriefInsert, "organization_id">) => {
      if (!organizationId) throw new Error("organization_id ausente");
      const { data, error } = await supabase
        .from("content_briefs")
        .insert({ ...input, organization_id: organizationId, created_by: profile?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ContentBrief;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-briefs", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ContentBriefInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("content_briefs")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select()
        .single();
      if (error) throw error;
      return data as ContentBrief;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-briefs", organizationId] }),
  });

  // Enviar briefing para o cliente (muda status para 'enviado')
  const send = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("content_briefs")
        .update({ status: "enviado" })
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select()
        .single();
      if (error) throw error;
      return data as ContentBrief;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-briefs", organizationId] }),
  });

  return {
    briefs:    query.data ?? [],
    loading:   query.isLoading,
    error:     query.error,
    create:    create.mutateAsync,
    update:    update.mutateAsync,
    send:      send.mutateAsync,
    isCreating: create.isPending,
  };
}

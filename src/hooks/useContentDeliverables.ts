/**
 * useContentDeliverables
 * CRUD de entregáveis de conteúdo (content_deliverables).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface ContentDeliverable {
  id:                   string;
  organization_id:      string;
  client_id:            string;
  campaign_id:          string | null;
  title:                string;
  description:          string | null;
  period_start:         string | null;
  period_end:           string | null;
  items_count:          number;
  reach_total:          number;
  engagement_total:     number;
  summary_notes:        string | null;
  is_visible_to_client: boolean;
  created_by:           string | null;
  created_at:           string;
  updated_at:           string;
  // Joins
  client_name?:         string;
  campaign_title?:      string;
}

export type ContentDeliverableInsert = Omit<
  ContentDeliverable,
  "id" | "organization_id" | "created_at" | "updated_at"
> & { organization_id?: string };

export function useContentDeliverables(
  organizationId: string | undefined,
  clientId?: string,
) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ["content-deliverables", organizationId, clientId],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<ContentDeliverable[]> => {
      if (!organizationId) return [];

      let q = supabase
        .from("content_deliverables")
        .select(`
          *,
          clients:client_id ( name ),
          content_campaigns:campaign_id ( title )
        `)
        .eq("organization_id", organizationId)
        .order("period_end", { ascending: false, nullsFirst: true });

      if (clientId) q = q.eq("client_id", clientId);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as ContentDeliverable),
        client_name:    (row.clients as { name: string } | null)?.name   ?? null,
        campaign_title: (row.content_campaigns as { title: string } | null)?.title ?? null,
      }));
    },
  });

  const create = useMutation({
    mutationFn: async (input: Omit<ContentDeliverableInsert, "organization_id">) => {
      if (!organizationId) throw new Error("organization_id ausente");
      const { data, error } = await supabase
        .from("content_deliverables")
        .insert({ ...input, organization_id: organizationId, created_by: profile?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ContentDeliverable;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-deliverables", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ContentDeliverableInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("content_deliverables")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select()
        .single();
      if (error) throw error;
      return data as ContentDeliverable;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-deliverables", organizationId] }),
  });

  return {
    deliverables: query.data ?? [],
    loading:      query.isLoading,
    error:        query.error,
    create:       create.mutateAsync,
    update:       update.mutateAsync,
    isCreating:   create.isPending,
  };
}

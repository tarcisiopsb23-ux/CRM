/**
 * useContentCampaigns
 * CRUD de campanhas de conteúdo (content_campaigns).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type CampaignStatus = "rascunho" | "ativa" | "concluida" | "arquivada";
export type CampaignObjective =
  | "brand_awareness" | "lead_gen" | "engagement"
  | "retention" | "lancamento" | "outro";

export interface ContentCampaign {
  id:              string;
  organization_id: string;
  client_id:       string;
  title:           string;
  description:     string | null;
  objective:       CampaignObjective | null;
  status:          CampaignStatus;
  start_date:      string | null;
  end_date:        string | null;
  metadata:        Record<string, unknown>;
  created_by:      string | null;
  created_at:      string;
  updated_at:      string;
  // Joins
  client_name?:    string;
  items_count?:    number;
}

export type ContentCampaignInsert = Omit<
  ContentCampaign,
  "id" | "organization_id" | "created_at" | "updated_at"
> & { organization_id?: string };

export function useContentCampaigns(
  organizationId: string | undefined,
  clientId?: string,
) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ["content-campaigns", organizationId, clientId],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<ContentCampaign[]> => {
      if (!organizationId) return [];

      let q = supabase
        .from("content_campaigns")
        .select(`
          *,
          clients:client_id ( name ),
          items_count:content_items(count)
        `)
        .eq("organization_id", organizationId)
        .neq("status", "arquivada")
        .order("start_date", { ascending: false, nullsFirst: true });

      if (clientId) q = q.eq("client_id", clientId);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as ContentCampaign),
        client_name:  (row.clients as { name: string } | null)?.name ?? null,
        items_count:  (Array.isArray(row.items_count) ? row.items_count[0]?.count : 0) ?? 0,
      }));
    },
  });

  const create = useMutation({
    mutationFn: async (input: Omit<ContentCampaignInsert, "organization_id">) => {
      if (!organizationId) throw new Error("organization_id ausente");
      const { data, error } = await supabase
        .from("content_campaigns")
        .insert({ ...input, organization_id: organizationId, created_by: profile?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ContentCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-campaigns", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ContentCampaignInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from("content_campaigns")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select()
        .single();
      if (error) throw error;
      return data as ContentCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-campaigns", organizationId] }),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("content_campaigns")
        .update({ status: "arquivada" })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-campaigns", organizationId] }),
  });

  return {
    campaigns: query.data ?? [],
    loading:   query.isLoading,
    error:     query.error,
    create:    create.mutateAsync,
    update:    update.mutateAsync,
    archive:   archive.mutateAsync,
    isCreating: create.isPending,
  };
}

/**
 * useContentItems
 *
 * CRUD de itens de conteúdo (content_items) para o Maestr.IA.
 * Inclui mutations para:
 *   - Criar / atualizar / arquivar itens
 *   - Enviar para aprovação (RPC send_content_item_for_approval)
 *   - Marcar como publicado (RPC mark_content_item_published)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ContentStatus =
  | "briefing"
  | "producao"
  | "revisao_interna"
  | "aguardando_aprovacao"
  | "aprovado"
  | "reprovado"
  | "publicado"
  | "arquivado";

export type ContentApprovalStatus =
  | "pendente"
  | "aprovado"
  | "reprovado"
  | "alteracao_solicitada";

export type ContentPriority = "baixa" | "media" | "alta" | "urgente";
export type ContentType = "post" | "reels" | "story" | "carousel" | "email" | "roteiro" | "banner" | "video" | "outro";
export type ContentPlatform = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "google" | "email" | "outro";

export interface ContentItem {
  id:                   string;
  organization_id:      string;
  client_id:            string;
  campaign_id:          string | null;
  task_id:              string | null;
  content_type:         ContentType | null;
  platform:             ContentPlatform | null;
  format:               string | null;
  title:                string;
  copy_text:            string | null;
  hashtags:             string[];
  description:          string | null;
  status:               ContentStatus;
  priority:             ContentPriority;
  assigned_to:          string | null;
  assigned_to_type:     "agency" | "partner";
  reviewer_id:          string | null;
  production_deadline:  string | null;
  scheduled_date:       string | null;
  scheduled_time:       string | null;
  published_at:         string | null;
  publication_url:      string | null;
  publication_notes:    string | null;
  approval_status:      ContentApprovalStatus;
  approved_by:          string | null;
  approved_at:          string | null;
  approval_notes:       string | null;
  version:              number;
  is_visible_to_client: boolean;
  metadata:             Record<string, unknown>;
  created_by:           string | null;
  created_at:           string;
  updated_at:           string;
  // Joins opcionais
  client_name?:         string;
  campaign_title?:      string;
  assignee_name?:       string;
}

export type ContentItemInsert = Omit<
  ContentItem,
  "id" | "organization_id" | "version" | "approval_status" | "approved_by" |
  "approved_at" | "is_visible_to_client" | "created_at" | "updated_at" | "task_id"
> & { organization_id?: string };

export type ContentItemUpdate = Partial<ContentItemInsert> & { id: string };

// ── Hook principal ─────────────────────────────────────────────────────────────

export function useContentItems(
  organizationId: string | undefined,
  options: {
    clientId?:   string;
    campaignId?: string;
    status?:     ContentStatus | ContentStatus[];
  } = {},
) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ["content-items", organizationId, options],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<ContentItem[]> => {
      if (!organizationId) return [];

      let q = supabase
        .from("content_items")
        .select(`
          *,
          clients:client_id ( name ),
          content_campaigns:campaign_id ( title )
        `)
        .eq("organization_id", organizationId)
        .neq("status", "arquivado")
        .order("updated_at", { ascending: false });

      if (options.clientId)   q = q.eq("client_id", options.clientId);
      if (options.campaignId) q = q.eq("campaign_id", options.campaignId);

      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        q = q.in("status", statuses);
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as ContentItem),
        client_name:    (row.clients   as { name: string } | null)?.name   ?? null,
        campaign_title: (row.content_campaigns as { title: string } | null)?.title ?? null,
      }));
    },
  });

  // ── Create ────────────────────────────────────────────────────────────────
  const create = useMutation({
    mutationFn: async (input: Omit<ContentItemInsert, "organization_id">) => {
      if (!organizationId) throw new Error("organization_id ausente");
      const { data, error } = await supabase
        .from("content_items")
        .insert({ ...input, organization_id: organizationId, created_by: profile?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ContentItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items", organizationId] });
      qc.invalidateQueries({ queryKey: ["content-calendar", organizationId] });
    },
  });

  // ── Update ────────────────────────────────────────────────────────────────
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: ContentItemUpdate) => {
      const { data, error } = await supabase
        .from("content_items")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .select()
        .single();
      if (error) throw error;
      return data as ContentItem;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["content-items", organizationId] });
      qc.invalidateQueries({ queryKey: ["content-item", updated.id] });
      qc.invalidateQueries({ queryKey: ["content-calendar", organizationId] });
    },
  });

  // ── Archive ───────────────────────────────────────────────────────────────
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("content_items")
        .update({ status: "arquivado" })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-items", organizationId] });
    },
  });

  // ── Send for approval ─────────────────────────────────────────────────────
  const sendForApproval = useMutation({
    mutationFn: async (itemId: string) => {
      if (!profile?.id) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .rpc("send_content_item_for_approval", {
          p_item_id:   itemId,
          p_sender_id: profile.id,
        });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Falha ao enviar para aprovação");
      return data;
    },
    onSuccess: (_, itemId) => {
      qc.invalidateQueries({ queryKey: ["content-items", organizationId] });
      qc.invalidateQueries({ queryKey: ["content-item", itemId] });
    },
  });

  // ── Mark as published ─────────────────────────────────────────────────────
  const markPublished = useMutation({
    mutationFn: async ({
      itemId,
      url,
      publishedAt,
    }: {
      itemId:       string;
      url?:         string;
      publishedAt?: string;
    }) => {
      if (!profile?.id) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .rpc("mark_content_item_published", {
          p_item_id:      itemId,
          p_publisher_id: profile.id,
          p_url:          url        ?? null,
          p_published_at: publishedAt ?? new Date().toISOString(),
        });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Falha ao marcar como publicado");
      return data;
    },
    onSuccess: (_, { itemId }) => {
      qc.invalidateQueries({ queryKey: ["content-items", organizationId] });
      qc.invalidateQueries({ queryKey: ["content-item", itemId] });
    },
  });

  return {
    items:          query.data ?? [],
    loading:        query.isLoading,
    error:          query.error,
    create:         create.mutateAsync,
    update:         update.mutateAsync,
    archive:        archive.mutateAsync,
    sendForApproval: sendForApproval.mutateAsync,
    markPublished:  markPublished.mutateAsync,
    isCreating:     create.isPending,
    isUpdating:     update.isPending,
  };
}

// ── Hook de item único ─────────────────────────────────────────────────────────

export function useContentItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ["content-item", itemId],
    enabled:  !!itemId,
    queryFn:  async (): Promise<ContentItem | null> => {
      if (!itemId) return null;
      const { data, error } = await supabase
        .from("content_items")
        .select(`
          *,
          clients:client_id ( name ),
          content_campaigns:campaign_id ( title )
        `)
        .eq("id", itemId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as ContentItem),
        client_name:    (data.clients   as { name: string } | null)?.name   ?? null,
        campaign_title: (data.content_campaigns as { title: string } | null)?.title ?? null,
      };
    },
  });
}

// ── Hook de calendário editorial ──────────────────────────────────────────────

export function useContentCalendar(
  organizationId: string | undefined,
  start: string,
  end: string,
  clientId?: string,
) {
  return useQuery({
    queryKey: ["content-calendar", organizationId, start, end, clientId],
    enabled:  !!organizationId && !!start && !!end,
    queryFn:  async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .rpc("get_content_calendar", {
          p_organization_id: organizationId,
          p_start:           start,
          p_end:             end,
          p_client_id:       clientId ?? null,
        });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Hook de sumário do dashboard ──────────────────────────────────────────────

export function useContentDashboardSummary(
  organizationId: string | undefined,
  clientId?: string,
) {
  return useQuery({
    queryKey: ["content-summary", organizationId, clientId],
    enabled:  !!organizationId,
    staleTime: 30_000,
    queryFn:  async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .rpc("get_content_dashboard_summary", {
          p_organization_id: organizationId,
          p_client_id:       clientId ?? null,
        });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

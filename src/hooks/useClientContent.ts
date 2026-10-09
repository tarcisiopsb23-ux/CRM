/**
 * useClientContent — hook de conteúdo para o portal do cliente (C8 Control).
 *
 * Usa useDynamicClient() (Banco A autenticado com JWT do cliente) para:
 *   - Buscar itens de conteúdo visíveis (via RPC get_content_items_for_client)
 *   - Buscar campanhas do cliente
 *   - Buscar briefings enviados
 *   - Buscar entregáveis visíveis
 *   - Aprovar/reprovar via Edge Function content-approve
 *   - Adicionar comentários (direto no banco via RLS)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";

const CONTENT_APPROVE_URL =
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-approve`;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ClientApprovalDecision =
  | "aprovado"
  | "reprovado"
  | "alteracao_solicitada";

export interface ClientContentItem {
  id:             string;
  campaign_id:    string | null;
  campaign_title: string | null;
  title:          string;
  content_type:   string | null;
  platform:       string | null;
  format:         string | null;
  copy_text:      string | null;
  hashtags:       string[];
  status:         string;
  approval_status: string;
  approval_notes: string | null;
  version:        number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  published_at:   string | null;
  publication_url: string | null;
  asset_count:    number;
  comment_count:  number;
  created_at:     string;
  updated_at:     string;
}

export interface ClientContentBrief {
  id:              string;
  title:           string;
  objective:       string | null;
  target_audience: string | null;
  key_messages:    string[];
  tone_of_voice:   string | null;
  restrictions:    string | null;
  deadline:        string | null;
  notes:           string | null;
  status:          string;
  client_tasks:    Array<{
    id:       string;
    task:     string;
    status:   "pendente" | "concluido";
    due_date: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export interface ClientContentDeliverable {
  id:                   string;
  campaign_id:          string | null;
  campaign_title:       string | null;
  title:                string;
  description:          string | null;
  period_start:         string | null;
  period_end:           string | null;
  items_count:          number;
  reach_total:          number;
  engagement_total:     number;
  summary_notes:        string | null;
  is_visible_to_client: boolean;
  created_at:           string;
}

// ── Itens de conteúdo ─────────────────────────────────────────────────────────

export function useClientContentItems(
  clientId: string | undefined,
  options: { status?: string; campaignId?: string } = {},
) {
  const dc = useDynamicClient();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["client-content-items", clientId, options],
    enabled:  !!clientId && !!dc,
    queryFn:  async (): Promise<ClientContentItem[]> => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc.rpc("get_content_items_for_client", {
        p_client_id:   clientId,
        p_status:      options.status    ?? null,
        p_campaign_id: options.campaignId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as ClientContentItem[];
    },
  });

  // Aprovação via Edge Function
  const approve = useMutation({
    mutationFn: async ({
      itemId,
      decision,
      notes,
      accessToken,
    }: {
      itemId:      string;
      decision:    ClientApprovalDecision;
      notes?:      string;
      accessToken: string;
    }) => {
      const res = await fetch(CONTENT_APPROVE_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content_item_id: itemId,
          decision,
          notes: notes ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao registrar aprovação");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-content-items", clientId] });
      qc.invalidateQueries({ queryKey: ["client-content-calendar", clientId] });
    },
  });

  return {
    items:    query.data ?? [],
    loading:  query.isLoading,
    error:    query.error,
    approve:  approve.mutateAsync,
    isApproving: approve.isPending,
  };
}

// ── Calendário editorial ──────────────────────────────────────────────────────

export function useClientContentCalendar(
  clientId:       string | undefined,
  organizationId: string | undefined,
  start:          string,
  end:            string,
) {
  const dc = useDynamicClient();

  return useQuery({
    queryKey: ["client-content-calendar", clientId, start, end],
    enabled:  !!clientId && !!organizationId && !!dc,
    queryFn:  async () => {
      if (!dc || !clientId || !organizationId) return [];
      const { data, error } = await dc.rpc("get_content_calendar", {
        p_organization_id: organizationId,
        p_start:           start,
        p_end:             end,
        p_client_id:       clientId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Briefings ─────────────────────────────────────────────────────────────────

export function useClientContentBriefs(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["client-content-briefs", clientId],
    enabled:  !!clientId && !!dc,
    queryFn:  async (): Promise<ClientContentBrief[]> => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("content_briefs")
        .select("*")
        .eq("client_id", clientId)
        .neq("status", "rascunho")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientContentBrief[];
    },
  });

  // Atualiza checklist de tarefas do cliente
  const updateTask = useMutation({
    mutationFn: async ({
      briefId,
      taskId,
      taskStatus,
    }: {
      briefId:    string;
      taskId:     string;
      taskStatus: "pendente" | "concluido";
    }) => {
      if (!dc) throw new Error("Cliente não autenticado");
      const brief = query.data?.find(b => b.id === briefId);
      if (!brief) throw new Error("Briefing não encontrado");

      const updatedTasks = brief.client_tasks.map(t =>
        t.id === taskId ? { ...t, status: taskStatus } : t,
      );

      const { error } = await dc
        .from("content_briefs")
        .update({ client_tasks: updatedTasks })
        .eq("id", briefId)
        .eq("client_id", clientId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-content-briefs", clientId] }),
  });

  return {
    briefs:     query.data ?? [],
    loading:    query.isLoading,
    updateTask: updateTask.mutateAsync,
  };
}

// ── Entregáveis ───────────────────────────────────────────────────────────────

export function useClientContentDeliverables(clientId: string | undefined) {
  const dc = useDynamicClient();

  return useQuery({
    queryKey: ["client-content-deliverables", clientId],
    enabled:  !!clientId && !!dc,
    queryFn:  async (): Promise<ClientContentDeliverable[]> => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("content_deliverables")
        .select(`
          *,
          content_campaigns:campaign_id ( title )
        `)
        .eq("client_id", clientId)
        .eq("is_visible_to_client", true)
        .order("period_end", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as ClientContentDeliverable),
        campaign_title: (row.content_campaigns as { title: string } | null)?.title ?? null,
      }));
    },
  });
}

// ── Comentários ───────────────────────────────────────────────────────────────

export function useClientContentComments(itemId: string | undefined) {
  const dc  = useDynamicClient();
  const qc  = useQueryClient();
  const { auth } = useClientAuth();

  const queryKey = ["client-content-comments", itemId];

  const query = useQuery({
    queryKey,
    enabled:  !!itemId && !!dc,
    queryFn:  async () => {
      if (!dc || !itemId) return [];
      const { data, error } = await dc
        .from("content_comments")
        .select("*")
        .eq("content_item_id", itemId)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string }) => {
      if (!dc || !itemId || !auth) throw new Error("Não autenticado");

      // Busca organization_id do item para a constraint de RLS
      const { data: item } = await dc
        .from("content_items")
        .select("organization_id")
        .eq("id", itemId)
        .maybeSingle();

      if (!item) throw new Error("Item não encontrado");

      const { error } = await dc
        .from("content_comments")
        .insert({
          organization_id: item.organization_id,
          content_item_id: itemId,
          parent_id:       parentId ?? null,
          body,
          author_id:       auth.user.id,
          author_type:     "client",
          author_name:     auth.user.full_name ?? auth.name,
          is_internal:     false,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    comments: query.data ?? [],
    loading:  query.isLoading,
    add:      add.mutateAsync,
    isAdding: add.isPending,
  };
}

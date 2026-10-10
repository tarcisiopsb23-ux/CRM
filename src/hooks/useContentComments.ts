/**
 * useContentComments
 *
 * Comentários threaded em itens de conteúdo com Realtime.
 * O canal Supabase Realtime (`content-comments:{itemId}`) é subscrito
 * enquanto o hook estiver montado — invalida o cache ao receber mudanças.
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface ContentComment {
  id:              string;
  organization_id: string;
  content_item_id: string;
  parent_id:       string | null;
  body:            string;
  author_id:       string;
  author_type:     "agency" | "client" | "partner";
  author_name:     string | null;
  is_internal:     boolean;
  resolved:        boolean;
  resolved_by:     string | null;
  resolved_at:     string | null;
  created_at:      string;
  updated_at:      string;
}

export function useContentComments(itemId: string | undefined) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const queryKey = ["content-comments", itemId];

  const query = useQuery({
    queryKey,
    enabled:  !!itemId,
    queryFn:  async (): Promise<ContentComment[]> => {
      if (!itemId) return [];
      const { data, error } = await supabase
        .from("content_comments")
        .select("*")
        .eq("content_item_id", itemId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContentComment[];
    },
  });

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!itemId) return;

    const channel = supabase
      .channel(`content-comments:${itemId}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "content_comments",
          filter: `content_item_id=eq.${itemId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add comment ───────────────────────────────────────────────────────────
  const add = useMutation({
    mutationFn: async ({
      body,
      parentId,
      isInternal = false,
    }: {
      body:        string;
      parentId?:   string;
      isInternal?: boolean;
    }) => {
      if (!itemId)  throw new Error("itemId ausente");
      if (!profile) throw new Error("Usuário não autenticado");

      // Busca organization_id do item
      const { data: item } = await supabase
        .from("content_items")
        .select("organization_id")
        .eq("id", itemId)
        .maybeSingle();

      if (!item) throw new Error("Item não encontrado");

      const { data, error } = await supabase
        .from("content_comments")
        .insert({
          organization_id: item.organization_id,
          content_item_id: itemId,
          parent_id:       parentId ?? null,
          body,
          author_id:       profile.id,
          author_type:     "agency",
          author_name:     profile.full_name ?? user?.email ?? "Agência",
          is_internal:     isInternal,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ContentComment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Resolve / unresolve ───────────────────────────────────────────────────
  const resolve = useMutation({
    mutationFn: async ({ commentId, resolved }: { commentId: string; resolved: boolean }) => {
      const { error } = await supabase
        .from("content_comments")
        .update({
          resolved,
          resolved_by: resolved ? profile?.id : null,
          resolved_at: resolved ? new Date().toISOString() : null,
        })
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // ── Agrupar em threads ────────────────────────────────────────────────────
  const threads = (query.data ?? []).reduce(
    (acc, comment) => {
      if (!comment.parent_id) {
        acc[comment.id] = acc[comment.id] ?? [];
        acc[comment.id].unshift(comment); // raiz no início
      } else {
        acc[comment.parent_id] = acc[comment.parent_id] ?? [];
        acc[comment.parent_id].push(comment);
      }
      return acc;
    },
    {} as Record<string, ContentComment[]>,
  );

  const rootComments = (query.data ?? []).filter(c => !c.parent_id);

  return {
    comments:     query.data ?? [],
    rootComments,
    threads,
    loading:      query.isLoading,
    add:          add.mutateAsync,
    resolve:      resolve.mutateAsync,
    isAdding:     add.isPending,
  };
}

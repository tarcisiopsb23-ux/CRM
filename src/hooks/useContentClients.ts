/**
 * useContentClients
 *
 * Gerencia quais clientes da agência estão vinculados ao módulo de
 * Gestão de Conteúdo (tabela content_clients).
 *
 * Usa query direta com join em vez de RPC para funcionar assim que
 * a migration 127 for aplicada, sem dependência de função extra.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ContentClient {
  content_client_id: string;
  client_id:         string;
  client_name:       string;
  client_company:    string | null;
  client_slug:       string | null;
  favicon_url:       string | null;
  responsible_id:    string | null;
  responsible_name:  string | null;
  linked_at:         string;
  active:            boolean;
  notes:             string | null;
}

export interface LinkClientInput {
  client_id:       string;
  responsible_id?: string;
  notes?:          string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useContentClients(organizationId: string | undefined) {
  const qc           = useQueryClient();
  const { profile }  = useAuth();

  // ── Listagem via query direta com join ────────────────────────────────────
  const query = useQuery({
    queryKey: ["content-clients", organizationId],
    enabled:  !!organizationId,
    queryFn:  async (): Promise<ContentClient[]> => {
      if (!organizationId) return [];

      // Query simplificada — sem joins aninhados para evitar ambiguidade de FK no PostgREST
      const { data: ccData, error } = await supabase
        .from("content_clients")
        .select("id, client_id, responsible_id, linked_at, active, notes")
        .eq("organization_id", organizationId)
        .order("linked_at", { ascending: false });

      // Tabela ainda não existe (migration pendente) — retorna vazio silenciosamente
      if (error) {
        if (error.code === "42P01" || (error as any).status === 400) return [];
        throw error;
      }

      if (!ccData || ccData.length === 0) return [];

      // Busca dados dos clientes e responsáveis em queries separadas (evita ambiguidade de FK)
      const clientIds      = [...new Set(ccData.map((r: any) => r.client_id))];
      const responsibleIds = [...new Set(ccData.map((r: any) => r.responsible_id).filter(Boolean))];

      const [clientsRes, profilesRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, company, address_city, address_state")
          .in("id", clientIds)
          .eq("organization_id", organizationId),   // garante RLS explícita
        responsibleIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", responsibleIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      const clientMap  = new Map((clientsRes.data  ?? []).map((c: any) => [c.id, c]));
      const profileMap = new Map((profilesRes.data  ?? []).map((p: any) => [p.id, p]));

      return ccData.map((row: any) => {
        const client  = clientMap.get(row.client_id)       ?? {};
        const profile = profileMap.get(row.responsible_id) ?? {};
        return {
          content_client_id: row.id,
          client_id:         row.client_id,
          client_name:       client.name          ?? "",
          client_company:    client.company       ?? null,
          client_slug:       null,                  // não existe na tabela clients do CRM
          favicon_url:       null,                  // não existe na tabela clients do CRM
          responsible_id:    row.responsible_id    ?? null,
          responsible_name:  profile.full_name     ?? null,
          linked_at:         row.linked_at,
          active:            row.active,
          notes:             row.notes             ?? null,
        };
      });
    },
  });

  // ── Conjunto de IDs vinculados para lookup O(1) ───────────────────────────
  const linkedIds = new Set((query.data ?? []).map(cc => cc.client_id));

  // ── Vincular cliente ───────────────────────────────────────────────────────
  const link = useMutation({
    mutationFn: async (input: LinkClientInput) => {
      if (!organizationId) throw new Error("organization_id ausente");

      // Verifica se já existe (mesmo inativo) — upsert reativa
      const { data: existing, error: checkErr } = await supabase
        .from("content_clients")
        .select("id, active")
        .eq("organization_id", organizationId)
        .eq("client_id", input.client_id)
        .maybeSingle();

      if (checkErr) {
        if (checkErr.code === "42P01" || (checkErr as any).status === 400) {
          throw new Error("A tabela content_clients ainda não existe. Execute a migration 127 no Supabase SQL Editor.");
        }
        throw checkErr;
      }

      if (existing) {
        // Reativa se estava inativo
        const { error } = await supabase
          .from("content_clients")
          .update({
            active:         true,
            responsible_id: input.responsible_id ?? null,
            notes:          input.notes          ?? null,
          })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("content_clients")
        .insert({
          organization_id: organizationId,
          client_id:       input.client_id,
          responsible_id:  input.responsible_id ?? null,
          notes:           input.notes          ?? null,
          linked_by:       profile?.id          ?? null,
          active:          true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-clients", organizationId] });
    },
  });

  // ── Desvincular (soft — active = false) ───────────────────────────────────
  const unlink = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("content_clients")
        .update({ active: false })
        .eq("organization_id", organizationId!)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-clients", organizationId] });
    },
  });

  // ── Reativar vínculo ───────────────────────────────────────────────────────
  const relink = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("content_clients")
        .update({ active: true })
        .eq("organization_id", organizationId!)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-clients", organizationId] });
    },
  });

  // ── Atualizar responsável ──────────────────────────────────────────────────
  const updateResponsible = useMutation({
    mutationFn: async ({
      clientId,
      responsibleId,
    }: {
      clientId:      string;
      responsibleId: string | null;
    }) => {
      const { error } = await supabase
        .from("content_clients")
        .update({ responsible_id: responsibleId })
        .eq("organization_id", organizationId!)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-clients", organizationId] });
    },
  });

  return {
    contentClients:    query.data ?? [],
    activeClients:     (query.data ?? []).filter(cc => cc.active),
    linkedIds,
    loading:           query.isLoading,
    error:             query.error,
    link:              link.mutateAsync,
    unlink:            unlink.mutateAsync,
    relink:            relink.mutateAsync,
    updateResponsible: updateResponsible.mutateAsync,
    isLinking:         link.isPending,
  };
}

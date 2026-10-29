/**
 * useChatbotFlows — CRUD de chatbot_flows (Banco A) via RPCs SECURITY DEFINER.
 *
 * RPCs (migration 158):
 *   list_chatbot_flows(p_client_id)           -> SETOF chatbot_flows
 *   get_chatbot_flow(p_flow_id, p_client_id)  -> SETOF chatbot_flows
 *   upsert_chatbot_flow(...)                   -> UUID
 *   set_flow_status(p_flow_id, p_client_id, p_status) -> VOID
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ChatbotFlow, FlowDefinition, FlowStatus } from "@/pages/public-dashboard/flow-builder/flowTypes";

// ── list ──────────────────────────────────────────────────────────────────────

export function useFlowList(clientId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery<ChatbotFlow[]>({
    queryKey: ["chatbot_flows", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.rpc("list_chatbot_flows", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ChatbotFlow[];
    },
    enabled: !!clientId,
    staleTime: 10_000,
  });

  const refetch = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["chatbot_flows", clientId] });
  }, [qc, clientId]);

  return {
    flows: query.data ?? [],
    loading: query.isLoading,
    refetch,
  };
}

// ── detail ────────────────────────────────────────────────────────────────────

export function useFlowDetail(flowId: string | undefined, clientId: string | undefined) {
  const query = useQuery<ChatbotFlow | null>({
    queryKey: ["chatbot_flow", flowId, clientId],
    queryFn: async () => {
      if (!flowId || !clientId) return null;
      const { data, error } = await supabase.rpc("get_chatbot_flow", {
        p_flow_id: flowId,
        p_client_id: clientId,
      });
      if (error) throw error;
      return ((data as unknown as ChatbotFlow[])?.[0] ?? null);
    },
    enabled: !!flowId && !!clientId,
    staleTime: 0,
  });

  return {
    flow: query.data ?? null,
    loading: query.isLoading,
  };
}

// ── upsert ────────────────────────────────────────────────────────────────────

export interface UpsertFlowParams {
  id: string | null;
  organization_id: string;
  client_id: string;
  name: string;
  description?: string | null;
  scope?: "general" | "channel";
  channel_type?: string | null;
  definition?: FlowDefinition;
  default_timeout_hours?: number;
}

/** Cria (id=null) ou atualiza um flow. Retorna o UUID ou null em caso de erro. */
export function useUpsertFlow() {
  return useCallback(async (params: UpsertFlowParams): Promise<string | null> => {
    const { data, error } = await supabase.rpc("upsert_chatbot_flow", {
      p_id: params.id,
      p_organization_id: params.organization_id,
      p_client_id: params.client_id,
      p_name: params.name,
      p_description: params.description ?? null,
      p_scope: params.scope ?? "general",
      p_channel_type: params.channel_type ?? null,
      p_definition: params.definition ?? { nodes: [], edges: [] },
      p_default_timeout_hours: params.default_timeout_hours ?? 24,
    });
    if (error) throw error;
    return (data as unknown as string) ?? null;
  }, []);
}

// ── set status ──────────────────────────────────────────────────────────────────

export function useSetFlowStatus() {
  return useCallback(
    async (flowId: string, clientId: string, status: FlowStatus): Promise<void> => {
      const { error } = await supabase.rpc("set_flow_status", {
        p_flow_id: flowId,
        p_client_id: clientId,
        p_status: status,
      });
      if (error) throw error;
    },
    [],
  );
}

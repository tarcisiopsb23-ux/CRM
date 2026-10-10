/**
 * useWhatsAppSession — T-2.8
 *
 * Hook para status e controle da sessão WhatsApp no Banco B.
 * O token de sessão real permanece no VPS (Evolution API).
 * Este hook gerencia apenas os metadados: status, número, timestamps.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export type WhatsAppSessionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "qr_pending";

export interface WhatsAppSession {
  id: string;
  client_id: string;
  phone_number: string | null;
  session_status: WhatsAppSessionStatus;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useWhatsAppSession(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["crm_whatsapp_session", clientId];

  // Poll a cada 5s quando em estado transitório (connecting / qr_pending)
  const query = useQuery<WhatsAppSession | null>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !clientId) return null;
      const { data, error } = await dc
        .from("crm_whatsapp_sessions")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WhatsAppSession | null;
    },
    enabled: !!dc && !!clientId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const s = (query.state.data as WhatsAppSession | null)?.session_status;
      return s === "connecting" || s === "qr_pending" ? 5_000 : false;
    },
  });

  /** Solicita QR Code — atualiza status para qr_pending no Banco B */
  const requestQr = useMutation({
    mutationFn: async () => {
      if (!dc || !clientId) throw new Error("Banco não conectado");
      const existing = query.data;
      const payload = {
        client_id: clientId,
        session_status: "qr_pending" as const,
        disconnected_at: null,
      };
      if (existing?.id) {
        const { error } = await dc
          .from("crm_whatsapp_sessions")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await dc
          .from("crm_whatsapp_sessions")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  /** Desconecta — atualiza status para disconnected */
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!dc || !query.data?.id) throw new Error("Sessão não encontrada");
      const { error } = await dc
        .from("crm_whatsapp_sessions")
        .update({
          session_status: "disconnected" as const,
          disconnected_at: new Date().toISOString(),
        })
        .eq("id", query.data.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const status: WhatsAppSessionStatus =
    query.data?.session_status ?? "disconnected";

  return {
    ...query,
    session: query.data,
    status,
    requestQr,
    disconnect,
  };
}

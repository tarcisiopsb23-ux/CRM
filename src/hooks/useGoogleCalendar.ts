/**
 * useGoogleCalendar — Hook para gerenciar integração com Google Calendar.
 *
 * Responsabilidades:
 *   - Consultar status da conexão (sem expor tokens)
 *   - Iniciar fluxo OAuth2 via popup
 *   - Desconectar Google Calendar
 *   - Escutar mensagem postMessage do popup para detectar conclusão do OAuth
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GoogleCalendarStatus {
  connected: boolean;
  calendar_id: string | null;
  calendar_name: string | null;
  connected_at: string | null;
  watch_expiry: string | null;
  scope: string | null;
}

// ─── URL da Edge Function ─────────────────────────────────────────────────────

function getOAuthAuthorizeUrl(clientId: string, slug: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const base = `${supabaseUrl}/functions/v1/google-calendar-oauth/authorize`;
  const params = new URLSearchParams({ client_id: clientId, slug });
  return `${base}?${params.toString()}`;
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useGoogleCalendar() {
  const { auth, slug } = useClientAuth();
  const clientId = auth?.id;
  const qc = useQueryClient();
  const qk = ["google_calendar_status", clientId];

  const [oauthPending, setOauthPending] = useState(false);

  // ── Status da conexão ────────────────────────────────────────────────────
  const statusQuery = useQuery<GoogleCalendarStatus>({
    queryKey: qk,
    queryFn: async () => {
      if (!clientId) {
        return { connected: false, calendar_id: null, calendar_name: null,
                 connected_at: null, watch_expiry: null, scope: null };
      }
      const { data, error } = await supabase.rpc("get_google_calendar_status", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return data as GoogleCalendarStatus;
    },
    enabled:        !!clientId,
    staleTime:      60_000,
    refetchOnFocus: true,
  });

  // ── Desconectar ───────────────────────────────────────────────────────────
  const disconnect = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Sem client_id");
      const { data, error } = await supabase.rpc("disconnect_google_calendar", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  // ── Iniciar OAuth via popup ───────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!clientId || !slug) return;

    const authorizeUrl = getOAuthAuthorizeUrl(clientId, slug);
    const width  = 520;
    const height = 640;
    const left   = Math.round(window.screenX + (window.outerWidth  - width)  / 2);
    const top    = Math.round(window.screenY + (window.outerHeight - height) / 2);

    const popup = window.open(
      authorizeUrl,
      "google_calendar_oauth",
      `width=${width},height=${height},left=${left},top=${top},` +
      `scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      alert("Popup bloqueado. Permita popups para este site e tente novamente.");
      return;
    }

    setOauthPending(true);

    // Monitora se o popup foi fechado manualmente
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        setOauthPending(false);
        // Refetch para capturar conexão bem-sucedida
        qc.invalidateQueries({ queryKey: qk });
      }
    }, 500);
  }, [clientId, slug, qc, qk]);

  // ── Escutar postMessage do popup ──────────────────────────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Valida origem (aceita qualquer origem pois o popup é do Supabase)
      if (
        event.data?.type === "GOOGLE_CALENDAR_AUTH" &&
        event.data?.clientId === clientId
      ) {
        setOauthPending(false);
        if (event.data.success) {
          // Aguarda um momento para o banco propagar antes de refetch
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: qk });
          }, 800);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clientId, qc, qk]);

  return {
    status:       statusQuery.data ?? {
      connected: false, calendar_id: null, calendar_name: null,
      connected_at: null, watch_expiry: null, scope: null,
    },
    isLoading:    statusQuery.isLoading,
    oauthPending,
    connect,
    disconnect,
  };
}

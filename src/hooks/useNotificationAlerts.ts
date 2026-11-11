/**
 * useNotificationAlerts
 *
 * Subscreve mensagens inbound nas conversas atribuídas ao agente atual
 * e mantém a lista de alertas com badge de não-lidos + alerta sonoro.
 *
 * Também exporta a estrutura AppAlert para alertas gerais da aplicação
 * (a ser populada por features futuras).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Interfaces públicas ───────────────────────────────────────────────────────

export interface NotificationAlert {
  id: string;
  conversationId: string;
  contactName: string;
  preview: string;
  timestamp: string; // ISO
  read: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface AppAlert {
  id: string;
  title: string;
  message: string;
  timestamp: string; // ISO
  read: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseNotificationAlertsOptions {
  conversationIds: string[];
  clientId: string | null;
}

interface UseNotificationAlertsReturn {
  alerts: NotificationAlert[];
  unreadAlerts: number;
  clearAlerts: () => void;
  markAllRead: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

const SOUND_KEY = "notification_sound_enabled";
const MAX_ALERTS = 50;

function playAlertTone(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch {
    // AudioContext não disponível (SSR, permissão negada, etc.)
  }
}

export function useNotificationAlerts({
  conversationIds,
  clientId,
}: UseNotificationAlertsOptions): UseNotificationAlertsReturn {
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    const stored = localStorage.getItem(SOUND_KEY);
    return stored === null ? true : stored === "true";
  });

  // Stable ref to avoid stale closure in Realtime callback
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // Persist sound preference to localStorage
  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    soundEnabledRef.current = v;
    localStorage.setItem(SOUND_KEY, String(v));
  }, []);

  // Subscribe to inbound messages on assigned conversations
  // Re-subscribes when conversationIds list changes
  const convIdsKey = JSON.stringify(conversationIds);
  useEffect(() => {
    if (!clientId || conversationIds.length === 0) return;

    // Build an `in` filter value for Realtime: (id1,id2,...)
    const inFilter = `conversation_id=in.(${conversationIds.join(",")})`;

    const channel = supabase
      .channel(`notification-alerts-${clientId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_channel_messages",
          filter: inFilter,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            direction: string;
            content: string | null;
            created_at: string;
          };

          if (row.direction !== "inbound") return;

          // Client-side guard: ensure the message belongs to a tracked conversation.
          // The Realtime `in` filter works in PostgREST but its server-side behavior
          // in postgres_changes is not guaranteed — this prevents spurious alerts if
          // the filter is silently dropped and the subscription becomes unfiltered.
          if (!conversationIds.includes(row.conversation_id)) return;

          const alert: NotificationAlert = {
            id: row.id,
            conversationId: row.conversation_id,
            contactName: "Nova mensagem",
            preview: row.content ?? "…",
            timestamp: row.created_at,
            read: false,
          };

          setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));
          setUnreadAlerts((n) => n + 1);

          if (soundEnabledRef.current) {
            playAlertTone();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, convIdsKey]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setUnreadAlerts(0);
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnreadAlerts(0);
  }, []);

  return {
    alerts,
    unreadAlerts,
    clearAlerts,
    markAllRead,
    soundEnabled,
    setSoundEnabled,
  };
}

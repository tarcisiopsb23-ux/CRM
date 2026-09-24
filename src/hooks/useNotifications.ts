import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";

export type NotificationType =
  | "lead_ultra_quente"
  | "lead_quente"
  | "lead_morno"
  | "lead_frio"
  | "sistema";

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const POLL_INTERVAL = 30_000; // 30s — menos agressivo que o chat

export function useNotifications() {
  const { profile } = useAuth();
  const organizationId = useOrganization();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  // ── Busca notificações ────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!profile?.id || !organizationId) return;
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("organization_id", organizationId)
        .or(`user_id.is.null,user_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications((data ?? []) as Notification[]);
    } catch {
      // silent — não bloqueia a UI
    }
  }, [profile?.id, organizationId]);

  // ── Carrega na montagem ───────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id || !organizationId) return;
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));
  }, [fetchNotifications, profile?.id, organizationId]);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id || !organizationId) return;
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications, profile?.id, organizationId]);

  // ── Marcar uma notificação como lida ─────────────────────────────────────
  const markRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
    },
    []
  );

  // ── Marcar todas como lidas ───────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!profile?.id || !organizationId) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (!n.read_at ? { ...n, read_at: now } : n))
    );
    try {
      await supabase.rpc("mark_notifications_read", {
        p_organization_id: organizationId,
        p_user_id: profile.id,
      });
    } catch {
      // silent
    }
  }, [profile?.id, organizationId]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refetch: fetchNotifications,
  };
}

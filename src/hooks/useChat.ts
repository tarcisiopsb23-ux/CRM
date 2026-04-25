import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import type { ChatConversation, ChatMessage, ChatParticipant } from "@/types/chat";

const POLL_INTERVAL = 10_000;
const PAGE_SIZE = 50;

export interface UseChatReturn {
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;

  conversations: ChatConversation[];
  activeConversation: ChatConversation | null;
  openConversation: (conv: ChatConversation) => void;
  openConversationById: (id: string) => void;
  backToList: () => void;

  messages: ChatMessage[];
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;

  sendMessage: (content: string) => Promise<void>;
  openOrCreateDirect: (targetUserId: string) => Promise<void>;
  createGroup: (name: string, memberIds: string[]) => Promise<void>;
  addGroupMember: (convId: string, userId: string) => Promise<void>;
  removeGroupMember: (convId: string, userId: string) => Promise<void>;
  deleteGroup: (convId: string) => Promise<void>;

  archiveConversation: (convId: string) => Promise<void>;
  unarchiveConversation: (convId: string) => Promise<void>;

  totalUnread: number;
  loading: boolean;
  error: string | null;
}

export function useChat(): UseChatReturn {
  const { profile } = useAuth();
  const organizationId = useOrganization();

  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);

  const lastMessageTimestampRef = useRef<string | null>(null);
  const oldestMessageTimestampRef = useRef<string | null>(null);

  // ── Fetch conversations ──────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error: err } = await supabase
        .from("chat_conversations")
        .select(`
          *,
          participants:chat_participants(
            user_id, role, joined_at,
            profile:profiles(full_name, avatar_url, role)
          )
        `)
        .order("updated_at", { ascending: false });

      if (err) throw err;

      const convs = (data ?? []) as unknown as ChatConversation[];
      // unread_count will be filled by fetchUnreadCounts
      setConversations(convs.map((c) => ({ ...c, unread_count: 0 })));
    } catch (e) {
      setError(String(e));
    }
  }, [profile?.id]);

  // ── Fetch unread counts ──────────────────────────────────────────────────

  const fetchUnreadCounts = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data } = await supabase.rpc("get_unread_counts");
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { conversation_id: string; unread_count: number }[]) {
        counts[row.conversation_id] = row.unread_count;
      }
      setConversations((prev) =>
        prev.map((c) => ({ ...c, unread_count: counts[c.id] ?? 0 }))
      );
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      setTotalUnread(total);
    } catch {
      // silent — badge update is best-effort
    }
  }, [profile?.id]);

  // ── Open panel ───────────────────────────────────────────────────────────

  const openPanel = useCallback(async () => {
    setIsOpen(true);
    if (!organizationId) return;
    try {
      await supabase.rpc("provision_general_channel", { p_org_id: organizationId });
    } catch {
      // ignore — channel may already exist
    }
    await fetchConversations();
    await fetchUnreadCounts();
  }, [organizationId, fetchConversations, fetchUnreadCounts]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setActiveConversation(null);
    setMessages([]);
    lastMessageTimestampRef.current = null;
    oldestMessageTimestampRef.current = null;
  }, []);

  // ── Open conversation ────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (convId: string, before?: string) => {
    let query = supabase
      .from("chat_messages")
      .select("*, sender:profiles(full_name, avatar_url)")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error: err } = await query;
    if (err) throw err;
    return ((data ?? []) as unknown as ChatMessage[]).reverse();
  }, []);

  const openConversation = useCallback(
    async (conv: ChatConversation) => {
      setActiveConversation(conv);
      setMessages([]);
      lastMessageTimestampRef.current = null;
      oldestMessageTimestampRef.current = null;
      setLoading(true);
      try {
        const msgs = await fetchMessages(conv.id);
        setMessages(msgs);
        setHasMoreMessages(msgs.length === PAGE_SIZE);
        if (msgs.length > 0) {
          lastMessageTimestampRef.current = msgs[msgs.length - 1].created_at;
          oldestMessageTimestampRef.current = msgs[0].created_at;
        }
        // mark as read
        if (profile?.id) {
          await supabase.from("chat_read_receipts").upsert(
            { conversation_id: conv.id, user_id: profile.id, last_read_at: new Date().toISOString() },
            { onConflict: "conversation_id,user_id" }
          );
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [fetchMessages, profile?.id]
  );

  const openConversationById = useCallback(
    async (id: string) => {
      // Garante que o painel está aberto e as conversas carregadas
      if (!isOpen) {
        setIsOpen(true);
        if (organizationId) {
          try {
            await supabase.rpc("provision_general_channel", { p_org_id: organizationId });
          } catch { /* ignore */ }
        }
        await fetchConversations();
        await fetchUnreadCounts();
      }

      // Tenta encontrar na lista já carregada
      const existing = conversations.find((c) => c.id === id);
      if (existing) {
        await openConversation(existing);
        return;
      }

      // Busca diretamente do banco (recém-criada, ainda não na lista)
      const { data } = await supabase
        .from("chat_conversations")
        .select("*, participants:chat_participants(user_id, role, joined_at, profile:profiles(full_name, avatar_url, role))")
        .eq("id", id)
        .single();

      if (data) {
        const conv = { ...(data as unknown as ChatConversation), unread_count: 0 };
        setConversations((prev) => {
          if (prev.find((c) => c.id === id)) return prev;
          return [conv, ...prev];
        });
        await openConversation(conv);
      }
    },
    [isOpen, organizationId, conversations, openConversation, fetchConversations, fetchUnreadCounts]
  );

  const backToList = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    lastMessageTimestampRef.current = null;
    oldestMessageTimestampRef.current = null;
  }, []);

  // ── Load more messages (pagination) ─────────────────────────────────────

  const loadMoreMessages = useCallback(async () => {
    if (!activeConversation || !oldestMessageTimestampRef.current) return;
    try {
      const older = await fetchMessages(activeConversation.id, oldestMessageTimestampRef.current);
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
        oldestMessageTimestampRef.current = older[0].created_at;
        setHasMoreMessages(older.length === PAGE_SIZE);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [activeConversation, fetchMessages]);

  // ── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeConversation || !profile?.id) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: activeConversation.id,
        sender_id: profile.id,
        content: trimmed,
        created_at: new Date().toISOString(),
        sender: { full_name: profile.full_name ?? "", avatar_url: profile.avatar_url ?? null },
      };
      setMessages((prev) => [...prev, optimistic]);
      lastMessageTimestampRef.current = optimistic.created_at;

      try {
        const { data, error: err } = await supabase
          .from("chat_messages")
          .insert({ conversation_id: activeConversation.id, sender_id: profile.id, content: trimmed })
          .select("*, sender:profiles(full_name, avatar_url)")
          .single();
        if (err) throw err;
        const saved = data as unknown as ChatMessage;
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? saved : m))
        );
        lastMessageTimestampRef.current = saved.created_at;
      } catch (e) {
        // remove optimistic on error
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setError(String(e));
      }
    },
    [activeConversation, profile]
  );

  // ── Direct conversation ──────────────────────────────────────────────────

  const openOrCreateDirect = useCallback(
    async (targetUserId: string) => {
      if (!profile?.id) return;
      // Check if direct conversation already exists
      const existing = conversations.find(
        (c) =>
          c.type === "direct" &&
          c.participants?.some((p) => p.user_id === targetUserId) &&
          c.participants?.some((p) => p.user_id === profile.id)
      );
      if (existing) {
        await openConversation(existing);
        return;
      }
      // Create new direct conversation
      const { data: conv, error: convErr } = await supabase
        .from("chat_conversations")
        .insert({ organization_id: organizationId, type: "direct", created_by: profile.id })
        .select()
        .single();
      if (convErr) throw convErr;
      const convId = (conv as { id: string }).id;
      await supabase.from("chat_participants").insert([
        { conversation_id: convId, user_id: profile.id, role: "owner" },
        { conversation_id: convId, user_id: targetUserId, role: "member" },
      ]);
      await fetchConversations();
      const newConv = conversations.find((c) => c.id === convId);
      if (newConv) await openConversation(newConv);
    },
    [profile, conversations, organizationId, openConversation, fetchConversations]
  );

  // ── Group operations ─────────────────────────────────────────────────────

  const createGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      if (!profile?.id || !organizationId) return;
      const { data: conv, error: convErr } = await supabase
        .from("chat_conversations")
        .insert({ organization_id: organizationId, type: "group", name, created_by: profile.id })
        .select()
        .single();
      if (convErr) throw convErr;
      const convId = (conv as { id: string }).id;
      const participants = [
        { conversation_id: convId, user_id: profile.id, role: "owner" },
        ...memberIds.map((uid) => ({ conversation_id: convId, user_id: uid, role: "member" })),
      ];
      await supabase.from("chat_participants").insert(participants);
      await fetchConversations();
    },
    [profile, organizationId, fetchConversations]
  );

  const addGroupMember = useCallback(async (convId: string, userId: string) => {
    await supabase
      .from("chat_participants")
      .insert({ conversation_id: convId, user_id: userId, role: "member" });
    await fetchConversations();
  }, [fetchConversations]);

  const removeGroupMember = useCallback(async (convId: string, userId: string) => {
    await supabase
      .from("chat_participants")
      .delete()
      .eq("conversation_id", convId)
      .eq("user_id", userId);
    await fetchConversations();
  }, [fetchConversations]);

  const deleteGroup = useCallback(async (convId: string) => {
    const { error } = await supabase.rpc("delete_chat_conversation", { p_conv_id: convId });
    if (error) throw error;
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConversation?.id === convId) backToList();
  }, [activeConversation, backToList]);

  const archiveConversation = useCallback(async (convId: string) => {
    await supabase.rpc("archive_chat_conversation", { p_conv_id: convId });
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, is_archived: true, archived_at: new Date().toISOString() } : c)
    );
    if (activeConversation?.id === convId) backToList();
  }, [activeConversation, backToList]);

  const unarchiveConversation = useCallback(async (convId: string) => {
    await supabase.rpc("unarchive_chat_conversation", { p_conv_id: convId });
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, is_archived: false, archived_at: null } : c)
    );
  }, []);

  // ── Polling — active conversation ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !activeConversation || !profile?.id) return;

    const poll = async () => {
      try {
        const since = lastMessageTimestampRef.current;
        let query = supabase
          .from("chat_messages")
          .select("*, sender:profiles(full_name, avatar_url)")
          .eq("conversation_id", activeConversation.id)
          .order("created_at", { ascending: true });

        if (since) {
          query = query.gt("created_at", since);
        }

        const { data } = await query;
        const newMsgs = (data ?? []) as unknown as ChatMessage[];
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
          lastMessageTimestampRef.current = newMsgs[newMsgs.length - 1].created_at;
          // mark as read
          await supabase.from("chat_read_receipts").upsert(
            { conversation_id: activeConversation.id, user_id: profile.id, last_read_at: new Date().toISOString() },
            { onConflict: "conversation_id,user_id" }
          );
        }
      } catch {
        // silent
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isOpen, activeConversation?.id, profile?.id]);

  // ── Polling — badge (all conversations) ─────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchUnreadCounts, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isOpen, fetchUnreadCounts]);

  return {
    isOpen,
    openPanel,
    closePanel,
    conversations,
    activeConversation,
    openConversation,
    openConversationById,
    backToList,
    messages,
    loadMoreMessages,
    hasMoreMessages,
    sendMessage,
    openOrCreateDirect,
    createGroup,
    addGroupMember,
    removeGroupMember,
    deleteGroup,
    archiveConversation,
    unarchiveConversation,
    totalUnread,
    loading,
    error,
  };
}

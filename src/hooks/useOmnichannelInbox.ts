/**
 * useOmnichannelInbox
 *
 * Hook principal do módulo de chat omnichannel do C8 Control.
 * Substitui o mock useOmnichannelChat.ts e conecta ao Banco A real.
 *
 * Responsabilidades:
 *   • Carrega conversas com filtros (canal, status, busca, minhas conversas)
 *   • Escuta Realtime em client_channel_conversations e client_channel_messages
 *   • Carrega mensagens da conversa ativa com paginação por cursor
 *   • Envia mensagens via Edge Function send-message
 *   • Gerencia status do agente via set_agent_status RPC
 *   • Atribui, transfere e resolve conversas via assign_client_conversation RPC
 *
 * Banco: APENAS Banco A (supabase de @/lib/supabase). Não usa useDynamicClient.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type AgentStatus = "online" | "busy" | "away" | "offline";

export interface InboxFilters {
  channel?: "whatsapp" | "instagram_dm" | "facebook_dm" | "instagram_comment" | "facebook_comment" | null;
  status?: "open" | "bot_active" | "waiting_human" | "human_active" | "resolved" | "closed" | null;
  assignedToMe?: boolean;
  search?: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  organization_id: string;
  channel_type: string;
  meta_connection_id: string | null;
  contact_id: string | null;
  /** Preenchido futuramente quando client_channel_conversations tiver a coluna omni_contact_id.
   *  Por ora fica undefined para que o ContactSheet use contact_id como fallback. */
  omni_contact_id?: string | null;
  status: string;
  priority: string;
  bot_active: boolean;
  assigned_agent_id: string | null;
  last_message_at: string | null;
  // JOIN com client_channel_contacts
  contact_name: string | null;
  contact_phone: string | null;
  contact_avatar: string | null;
  // Preview calculado pelo frontend (último conteúdo disponível)
  last_message_preview: string | null;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  sender_name: string | null;
  channel_type: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  media_caption: string | null;
  delivery_status: string;
  created_at: string;
  is_internal: boolean;
}

export interface SendMessageParams {
  conversationId: string;
  content: string;
  messageType?: "text" | "image" | "audio" | "document" | "template";
  mediaUrl?: string;
  mediaType?: string;
  mediaCaption?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  isInternal?: boolean;
}

export interface UseOmnichannelInboxReturn {
  conversations: Conversation[];
  conversationsLoading: boolean;
  filters: InboxFilters;
  setFilters: (f: InboxFilters) => void;
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  activeConversation: Conversation | null;
  messages: Message[];
  messagesLoading: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;
  sendMessage: (params: SendMessageParams) => Promise<void>;
  sendingMessage: boolean;
  myStatus: AgentStatus;
  setMyStatus: (status: AgentStatus) => void;
  assignConversation: (conversationId: string, agentId: string) => Promise<void>;
  transferConversation: (conversationId: string, agentId: string, reason?: string) => Promise<void>;
  resolveConversation: (conversationId: string) => Promise<void>;
  toggleBotForConversation: (conversationId: string, botActive: boolean) => Promise<void>;
  unreadCount: number;
  waitingCount: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

// ─── Helper: lê token JWT da sessão do cliente C8 Control ─────────────────────

function getSessionToken(slug: string): string {
  try {
    const raw = sessionStorage.getItem(`client_auth_v2_${slug}`);
    if (!raw) throw new Error("Sem sessão");
    const parsed = JSON.parse(raw);
    return parsed?.session?.access_token ?? "";
  } catch {
    return "";
  }
}

// ─── Helper: mapeia linha raw do banco para Conversation ────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConversation(row: any): Conversation {
  const contact = row.contact ?? {};
  return {
    id: row.id,
    client_id: row.client_id,
    organization_id: row.organization_id,
    channel_type: row.channel_type,
    meta_connection_id: row.meta_connection_id ?? null,
    contact_id: row.contact_id ?? null,
    status: row.status,
    priority: row.priority,
    bot_active: row.bot_active ?? true,
    assigned_agent_id: row.assigned_agent_id ?? null,
    last_message_at: row.last_message_at ?? null,
    contact_name: contact.display_name ?? null,
    contact_phone: contact.phone ?? null,
    contact_avatar: contact.metadata?.avatar_url ?? null,
    last_message_preview: null, // preenchido em busca separada quando necessário
    unread_count: 0,
  };
}

// ─── Helper: mapeia linha raw do banco para Message ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessage(row: any): Message {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    sender_type: row.sender_type,
    sender_name: row.sender_name ?? null,
    channel_type: row.channel_type,
    message_type: row.message_type,
    content: row.content ?? null,
    media_url: row.media_url ?? null,
    media_type: row.media_type ?? null,
    media_caption: row.media_caption ?? null,
    delivery_status: row.delivery_status,
    created_at: row.created_at,
    is_internal: row.sender_type === "system" || !!(row.metadata?.is_internal),
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useOmnichannelInbox(): UseOmnichannelInboxReturn {
  const { auth, slug } = useClientAuth();
  const clientId = auth?.id ?? null;
  const orgId = auth?.organization_id ?? null;
  const userId = auth?.user?.id ?? null;

  // ── Estado ─────────────────────────────────────────────────────────────────

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [filters, setFiltersState] = useState<InboxFilters>({});
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMore] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [myStatus, setMyStatusState] = useState<AgentStatus>("offline");

  // Ref para cursor de paginação de mensagens (created_at da mensagem mais antiga)
  const oldestMessageTimestampRef = useRef<string | null>(null);

  // ── Carregar conversas ─────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!clientId) return;
    setConversationsLoading(true);
    try {
      let query = supabase
        .from("client_channel_conversations")
        .select(`
          id, client_id, organization_id, channel_type, meta_connection_id,
          contact_id, status, priority, bot_active, assigned_agent_id,
          last_message_at,
          contact:client_channel_contacts!contact_id(
            display_name, phone, metadata
          )
        `)
        .eq("client_id", clientId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (filters.channel) {
        query = query.eq("channel_type", filters.channel);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.assignedToMe && userId) {
        query = query.eq("assigned_agent_id", userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[useOmnichannelInbox] fetchConversations error:", error);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mapped = (data ?? []).map((row: any) => mapConversation(row));

      // Filtro de busca por nome/telefone (client-side pois ILIKE em join não é trivial via PostgREST)
      if (filters.search) {
        const search = filters.search.toLowerCase();
        mapped = mapped.filter(
          (c) =>
            c.contact_name?.toLowerCase().includes(search) ||
            c.contact_phone?.toLowerCase().includes(search)
        );
      }

      setConversations(mapped);
    } finally {
      setConversationsLoading(false);
    }
  }, [clientId, userId, filters]);

  // Fetch inicial e ao mudar filtros
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // ── Realtime: conversas ────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`conversations-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_channel_conversations",
          filter: `client_id=eq.${clientId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const newConv = mapConversation(payload.new);
            setConversations((prev) => [newConv, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.new.id
                  ? { ...c, ...mapConversation({ ...payload.new, contact: null }) }
                  : c
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  // ── Carregar mensagens da conversa ativa ───────────────────────────────────

  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    oldestMessageTimestampRef.current = null;
    try {
      const { data, error } = await supabase
        .from("client_channel_messages")
        .select(
          "id, conversation_id, direction, sender_type, sender_name, channel_type, message_type, content, media_url, media_type, media_caption, delivery_status, created_at, metadata"
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        console.error("[useOmnichannelInbox] fetchMessages error:", error);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ordered = (data ?? []).map((r: any) => mapMessage(r)).reverse();
      setMessages(ordered);
      setHasMore((data?.length ?? 0) === PAGE_SIZE);
      if (ordered.length > 0) {
        oldestMessageTimestampRef.current = ordered[0].created_at;
      }
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setHasMore(false);
      oldestMessageTimestampRef.current = null;
      return;
    }
    fetchMessages(activeConversationId);
  }, [activeConversationId, fetchMessages]);

  // ── Realtime: mensagens da conversa ativa ─────────────────────────────────

  useEffect(() => {
    if (!activeConversationId) return;

    const msgChannel = supabase
      .channel(`messages-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "client_channel_messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newMsg = mapMessage(payload.new);
          setMessages((prev) => {
            // Evitar duplicatas (mensagem própria já pode ter sido adicionada otimisticamente)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
    };
  }, [activeConversationId]);

  // ── Paginação: carregar mais mensagens (mais antigas) ─────────────────────

  const loadMoreMessages = useCallback(async () => {
    if (!activeConversationId || !oldestMessageTimestampRef.current) return;

    const { data, error } = await supabase
      .from("client_channel_messages")
      .select(
        "id, conversation_id, direction, sender_type, sender_name, channel_type, message_type, content, media_url, media_type, media_caption, delivery_status, created_at, metadata"
      )
      .eq("conversation_id", activeConversationId)
      .lt("created_at", oldestMessageTimestampRef.current)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error("[useOmnichannelInbox] loadMoreMessages error:", error);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const older = (data ?? []).map((r: any) => mapMessage(r)).reverse();
    setMessages((prev) => [...older, ...prev]);
    setHasMore((data?.length ?? 0) === PAGE_SIZE);
    if (older.length > 0) {
      oldestMessageTimestampRef.current = older[0].created_at;
    }
  }, [activeConversationId]);

  // ── Envio de mensagem ──────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (params: SendMessageParams) => {
      const activeConv = conversations.find((c) => c.id === params.conversationId);
      if (!activeConv || !clientId || !orgId) return;

      setSendingMessage(true);
      try {
        // Buscar recipient_id (external_user_id da identidade do contato no canal)
        const { data: identity, error: identityError } = await supabase
          .from("client_contact_identities")
          .select("external_user_id")
          .eq("client_id", clientId)
          .eq("contact_id", activeConv.contact_id)
          .eq("channel_type", activeConv.channel_type)
          .maybeSingle();

        if (identityError || !identity) {
          throw new Error("Identidade do contato não encontrada");
        }

        const token = getSessionToken(slug);
        if (!token) throw new Error("Token de sessão não disponível");

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              connection_id: activeConv.meta_connection_id,
              organization_id: orgId,
              channel_type: activeConv.channel_type,
              recipient_id: identity.external_user_id,
              message_type: params.messageType ?? "text",
              content: params.mediaUrl ?? params.content,
              conversation_id: params.conversationId,
              client_id: clientId,
              template_name: params.templateName,
              template_params: params.templateParams,
            }),
          }
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error((err as { error?: string }).error ?? "Erro ao enviar mensagem");
        }
        // O Realtime adicionará a mensagem à thread automaticamente após persistência
      } finally {
        setSendingMessage(false);
      }
    },
    [conversations, clientId, orgId, slug]
  );

  // ── Status do agente ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;

    // Registrar como online ao montar
    supabase
      .rpc("set_agent_status", {
        p_agent_id: userId,
        p_status: "online",
      })
      .then(({ error }) => {
        if (!error) setMyStatusState("online");
      });

    return () => {
      // Setar offline ao desmontar (fire-and-forget)
      supabase.rpc("set_agent_status", {
        p_agent_id: userId,
        p_status: "offline",
      });
    };
  }, [userId]);

  const setMyStatus = useCallback(
    async (status: AgentStatus) => {
      if (!userId) return;
      const { error } = await supabase.rpc("set_agent_status", {
        p_agent_id: userId,
        p_status: status,
      });
      if (!error) setMyStatusState(status);
    },
    [userId]
  );

  // ── Ações de conversa ──────────────────────────────────────────────────────

  const assignConversation = useCallback(
    async (conversationId: string, agentId: string) => {
      const { error } = await supabase.rpc("assign_client_conversation", {
        p_conversation_id: conversationId,
        p_agent_id: agentId,
      });
      if (error) {
        console.error("[useOmnichannelInbox] assignConversation error:", error);
      }
    },
    []
  );

  const transferConversation = useCallback(
    async (conversationId: string, agentId: string, reason?: string) => {
      // assign_client_conversation aceita: p_conversation_id, p_agent_id, p_from_bot, p_reason, p_summary
      const { error } = await supabase.rpc("assign_client_conversation", {
        p_conversation_id: conversationId,
        p_agent_id: agentId,
        p_from_bot: false,
        p_reason: reason ?? null,
      });
      if (error) {
        console.error("[useOmnichannelInbox] transferConversation error:", error);
      }
    },
    []
  );

  const resolveConversation = useCallback(
    async (conversationId: string) => {
      if (!clientId) return;
      // Usa RPC resolve_conversation — encerra a conversa, reseta bot_active=true
      // para que a próxima mensagem do mesmo contato seja atendida pelo bot.
      // Não afeta outras conversas.
      const { data, error } = await supabase.rpc("resolve_conversation", {
        p_conversation_id: conversationId,
        p_source:          "client",
        p_resolved_by:     userId ?? null,
      });
      if (error) {
        console.error("[useOmnichannelInbox] resolveConversation error:", error);
        return;
      }
      const result = data as { success: boolean; reason?: string } | null;
      if (result && !result.success) {
        console.warn("[useOmnichannelInbox] resolveConversation:", result.reason);
      }
    },
    [clientId, userId]
  );

  const toggleBotForConversation = useCallback(
    async (conversationId: string, botActive: boolean) => {
      if (!clientId) return;
      const { error } = await supabase
        .from("client_channel_conversations")
        .update({ bot_active: botActive })
        .eq("id", conversationId)
        .eq("client_id", clientId);
      if (error) {
        console.error("[useOmnichannelInbox] toggleBotForConversation error:", error);
      }
    },
    [clientId]
  );

  // ── Filtros ─────────────────────────────────────────────────────────────────

  const setFilters = useCallback((f: InboxFilters) => {
    setFiltersState(f);
  }, []);

  // ── Conversa ativa ─────────────────────────────────────────────────────────

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveConversationIdState(id);
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  // ── Badges de contagem ─────────────────────────────────────────────────────

  const unreadCount = conversations.filter(
    (c) => c.status !== "resolved" && c.status !== "closed"
  ).length;

  const waitingCount = conversations.filter((c) => c.status === "waiting_human").length;

  // ── Guard: sem clientId retorna estado vazio ─────────────────────────────

  if (!clientId) {
    return {
      conversations: [],
      conversationsLoading: false,
      filters,
      setFilters,
      activeConversationId: null,
      setActiveConversation,
      activeConversation: null,
      messages: [],
      messagesLoading: false,
      hasMoreMessages: false,
      loadMoreMessages: async () => {},
      sendMessage: async () => {},
      sendingMessage: false,
      myStatus: "offline",
      setMyStatus: async () => {},
      assignConversation: async () => {},
      transferConversation: async () => {},
      resolveConversation: async () => {},
      toggleBotForConversation: async () => {},
      unreadCount: 0,
      waitingCount: 0,
    };
  }

  return {
    conversations,
    conversationsLoading,
    filters,
    setFilters,
    activeConversationId,
    setActiveConversation,
    activeConversation,
    messages,
    messagesLoading,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    sendingMessage,
    myStatus,
    setMyStatus,
    assignConversation,
    transferConversation,
    resolveConversation,
    toggleBotForConversation,
    unreadCount,
    waitingCount,
  };
}

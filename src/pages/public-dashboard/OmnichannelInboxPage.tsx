/**
 * OmnichannelInboxPage
 *
 * Caixa de entrada omnichannel — layout tipo WhatsApp Web com 3 colunas.
 * Substitui MensagensPage.tsx (placeholder Fase 1).
 *
 * Colunas:
 *   Esquerda  — lista de conversas + filtros
 *   Central   — thread de mensagens + input
 *   Direita   — painel de info do contato (colapsável)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle, Search, ChevronLeft, ChevronRight,
  Send, Paperclip, PenLine, Check, CheckCheck, Clock,
  FileText, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isYesterday, formatDistanceStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  useOmnichannelInbox,
  Conversation,
  Message,
} from "@/hooks/useOmnichannelInbox";
import { AgentStatusToggle } from "@/components/omnichannel/AgentStatusToggle";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase } from "@/lib/supabase";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatConvTimestamp(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return "ontem";
    return format(d, "dd/MM");
  } catch {
    return "";
  }
}

function formatMsgTimestamp(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "";
  }
}

/** Retorna true se a última mensagem inbound foi há mais de 24h */
function isWindow24hExpired(conv: Conversation, messages: Message[]): boolean {
  if (conv.channel_type !== "whatsapp") return false;
  const inbounds = messages.filter((m) => m.direction === "inbound");
  if (inbounds.length === 0) return false;
  const last = inbounds[inbounds.length - 1];
  try {
    const diff = Date.now() - parseISO(last.created_at).getTime();
    return diff > 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// ─── Canal config ──────────────────────────────────────────────────────────────

type ChannelKey = "whatsapp" | "instagram_dm" | "facebook_dm";

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp:        "text-emerald-400",
  instagram_dm:    "text-pink-400",
  facebook_dm:     "text-blue-400",
  instagram_comment: "text-pink-300",
  facebook_comment:  "text-blue-300",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp:          "WhatsApp",
  instagram_dm:      "Instagram",
  facebook_dm:       "Facebook",
  instagram_comment: "Instagram",
  facebook_comment:  "Facebook",
};

function ChannelDot({ channel }: { channel: string }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        channel === "whatsapp"     ? "bg-emerald-400" :
        channel.startsWith("instagram") ? "bg-pink-400" : "bg-blue-400"
      )}
    />
  );
}

function ChannelBadge({ channel, small = false }: { channel: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        channel === "whatsapp"
          ? "bg-emerald-500/10 text-emerald-400"
          : channel.startsWith("instagram")
          ? "bg-pink-500/10 text-pink-400"
          : "bg-blue-500/10 text-blue-400"
      )}
    >
      <ChannelDot channel={channel} />
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  );
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  bot_active:     { label: "Bot",        className: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  waiting_human:  { label: "Aguardando", className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  human_active:   { label: "Humano",     className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  resolved:       { label: "Resolvido",  className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
  open:           { label: "Aberta",     className: "bg-slate-600/15 text-slate-400 border-slate-600/20" },
  closed:         { label: "Encerrada",  className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
};

function StatusBadgeSmall({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, className: "bg-secondary text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function ConvAvatar({ conv }: { conv: Conversation }) {
  const initials = conv.contact_name
    ? conv.contact_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : null;

  if (initials) {
    return (
      <div className="h-9 w-9 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
        {initials}
      </div>
    );
  }

  return (
    <div className={cn(
      "h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[10px]",
      CHANNEL_COLORS[conv.channel_type] ?? "text-muted-foreground",
      "bg-secondary/60"
    )}>
      {CHANNEL_LABELS[conv.channel_type]?.[0] ?? "?"}
    </div>
  );
}

// ─── Item de conversa ──────────────────────────────────────────────────────────

function ConversationItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/30",
        isActive && "bg-secondary/40"
      )}
      onClick={onClick}
    >
      <ConvAvatar conv={conv} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-foreground truncate">
            {conv.contact_name ?? conv.contact_phone ?? "Desconhecido"}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatConvTimestamp(conv.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-[11px] text-muted-foreground truncate flex-1">
            {conv.last_message_preview ?? "—"}
          </span>
          {conv.unread_count > 0 && (
            <span className="h-4 w-4 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white">
              {conv.unread_count > 9 ? "9+" : conv.unread_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <ChannelBadge channel={conv.channel_type} small />
          <StatusBadgeSmall status={conv.status} />
        </div>
      </div>
    </button>
  );
}

// ─── Delivery icon ─────────────────────────────────────────────────────────────

function DeliveryIcon({ status }: { status: string }) {
  if (status === "pending")   return <Clock className="h-3 w-3 text-muted-foreground" />;
  if (status === "sent")      return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "read")      return <CheckCheck className="h-3 w-3 text-blue-400" />;
  return null;
}

// ─── Bolha de mensagem ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  // Eventos de sistema — centralizado, sem balão
  if (msg.message_type === "event" || msg.sender_type === "system") {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] italic text-muted-foreground">
          {msg.content}
        </span>
      </div>
    );
  }

  const isInbound = msg.direction === "inbound";
  const isBot = msg.sender_type === "bot";
  const isInternal = msg.is_internal;

  const bubbleClass = cn(
    "max-w-xs md:max-w-sm lg:max-w-md px-3 py-2 text-sm break-words",
    isInternal
      ? "bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-foreground"
      : isInbound
      ? "bg-secondary/40 rounded-2xl rounded-tl-sm text-foreground"
      : isBot
      ? "bg-violet-500/15 text-violet-300 rounded-2xl rounded-tr-sm"
      : "bg-blue-500/15 text-blue-300 rounded-2xl rounded-tr-sm"
  );

  const renderContent = () => {
    if (msg.message_type === "image" && msg.media_url) {
      return (
        <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
          <img
            src={msg.media_url}
            alt={msg.media_caption ?? "Imagem"}
            className="max-w-[200px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          />
          {msg.media_caption && (
            <p className="text-xs mt-1 opacity-80">{msg.media_caption}</p>
          )}
        </a>
      );
    }
    if (msg.message_type === "audio" && msg.media_url) {
      return <audio controls className="w-48" src={msg.media_url} />;
    }
    if (msg.message_type === "document" && msg.media_url) {
      return (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="text-xs">{msg.media_caption ?? "Documento"}</span>
        </a>
      );
    }
    return <p>{msg.content}</p>;
  };

  return (
    <div className={cn("flex", isInbound ? "justify-start" : "justify-end", "my-0.5")}>
      <div className="flex flex-col">
        {isInternal && (
          <span className="text-[9px] font-semibold text-yellow-500 mb-0.5 self-end">
            Nota interna
          </span>
        )}
        <div className={bubbleClass}>
          {renderContent()}
        </div>
        <div className={cn("flex items-center gap-1 mt-0.5", isInbound ? "justify-start" : "justify-end")}>
          <span className="text-[10px] text-muted-foreground">
            {formatMsgTimestamp(msg.created_at)}
          </span>
          {!isInbound && <DeliveryIcon status={msg.delivery_status} />}
        </div>
      </div>
    </div>
  );
}

// ─── Coluna esquerda ───────────────────────────────────────────────────────────

type ChannelFilter = ChannelKey | null;
type StatusFilter = "open" | "bot_active" | "waiting_human" | "human_active" | "resolved" | null;

interface LeftColumnProps {
  conversations: Conversation[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  unreadCount: number;
  filters: {
    search: string;
    channel: ChannelFilter;
    status: StatusFilter;
  };
  onFilterChange: (f: Partial<{ search: string; channel: ChannelFilter; status: StatusFilter }>) => void;
  myStatus: ReturnType<typeof useOmnichannelInbox>["myStatus"];
  setMyStatus: ReturnType<typeof useOmnichannelInbox>["setMyStatus"];
}

function LeftColumn({
  conversations,
  loading,
  activeId,
  onSelect,
  unreadCount,
  filters,
  onFilterChange,
  myStatus,
  setMyStatus,
}: LeftColumnProps) {
  const channelButtons: Array<{ key: ChannelFilter; label: string }> = [
    { key: null, label: "Todos" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "instagram_dm", label: "Instagram" },
    { key: "facebook_dm", label: "Facebook" },
  ];

  const statusButtons: Array<{ key: StatusFilter; label: string }> = [
    { key: null, label: "Todos" },
    { key: "waiting_human", label: "Aguardando" },
    { key: "human_active", label: "Em Atendimento" },
    { key: "bot_active", label: "Bot Ativo" },
  ];

  return (
    <div className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">Mensagens</span>
            {unreadCount > 0 && (
              <span className="h-5 min-w-5 px-1 rounded-full bg-blue-500 text-[10px] font-bold text-white flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <AgentStatusToggle status={myStatus} onStatusChange={setMyStatus} />
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            className="pl-7 h-7 text-xs bg-secondary/30 border-border"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
          />
        </div>

        {/* Filtro canal */}
        <div className="flex gap-1 flex-wrap">
          {channelButtons.map(({ key, label }) => (
            <button
              key={String(key)}
              onClick={() => onFilterChange({ channel: key })}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                filters.channel === key
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtro status */}
        <div className="flex gap-1 flex-wrap">
          {statusButtons.map(({ key, label }) => (
            <button
              key={String(key)}
              onClick={() => onFilterChange({ status: key })}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors font-medium",
                filters.status === key
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Nenhuma conversa</p>
          </div>
        )}
        {!loading &&
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeId}
              onClick={() => onSelect(conv.id)}
            />
          ))}
      </div>
    </div>
  );
}

// ─── Coluna central ────────────────────────────────────────────────────────────

interface CenterColumnProps {
  activeConversation: Conversation | null;
  messages: Message[];
  messagesLoading: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;
  sendingMessage: boolean;
  onSend: (content: string, isInternal: boolean) => void;
  onResolve: () => void;
  onToggleBot: (active: boolean) => void;
  onBack?: () => void;
}

function CenterColumn({
  activeConversation,
  messages,
  messagesLoading,
  hasMoreMessages,
  loadMoreMessages,
  sendingMessage,
  onSend,
  onResolve,
  onToggleBot,
  onBack,
}: CenterColumnProps) {
  const [inputText, setInputText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ao fim quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Auto-resize textarea
  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const expired24h = activeConversation ? isWindow24hExpired(activeConversation, messages) : false;

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || sendingMessage) return;
    onSend(text, isInternalNote);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsInternalNote(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Estado vazio
  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <MessageCircle className="h-12 w-12 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  const conv = activeConversation;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-2 flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="mr-1 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {conv.contact_name ?? conv.contact_phone ?? "Desconhecido"}
            </span>
            <ChannelBadge channel={conv.channel_type} />
            <StatusBadgeSmall status={conv.status} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle Bot */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {conv.bot_active ? "Bot" : "Humano"}
            </span>
            <Switch
              checked={conv.bot_active}
              onCheckedChange={(v) => onToggleBot(v)}
              className="scale-75"
            />
          </div>
          {/* Resolver */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => {
              onResolve();
              toast.success("Conversa marcada como resolvida");
            }}
          >
            Resolver
          </Button>
          {/* Transferir */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => toast.info("Transferência de conversa estará disponível em breve.")}
          >
            Transferir
          </Button>
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {/* Carregar mais */}
        {hasMoreMessages && (
          <div className="flex justify-center mb-3">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground h-7"
              onClick={loadMoreMessages}
            >
              Carregar mensagens anteriores
            </Button>
          </div>
        )}

        {/* Loader */}
        {messagesLoading && (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {/* Mensagens */}
        {!messagesLoading &&
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}

        <div ref={messagesEndRef} />
      </div>

      {/* Banner 24h */}
      {expired24h && (
        <div className="shrink-0 mx-4 mb-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-amber-400">
            Janela de 24h encerrada. Use um template para retomar a conversa.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] border-amber-500/30 text-amber-400"
            onClick={() => toast.info("Selecione um template em Mensagens → Templates")}
          >
            Usar Template
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border p-3">
        <div
          className={cn(
            "flex items-end gap-2 rounded-lg border bg-secondary/20 px-3 py-2",
            isInternalNote ? "border-yellow-500" : "border-border"
          )}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onInput={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={
              expired24h
                ? "Janela encerrada — use um template"
                : isInternalNote
                ? "Nota interna (não enviada ao cliente)..."
                : "Digite uma mensagem..."
            }
            disabled={expired24h || sendingMessage}
            rows={1}
            style={{ maxHeight: "6rem" }}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none overflow-y-auto"
          />
          <div className="flex items-center gap-1 shrink-0">
            {/* Mídia */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Enviar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,application/pdf"
              className="hidden"
              onChange={() => toast.info("Upload de mídia será disponível em breve.")}
            />

            {/* Nota interna */}
            <button
              type="button"
              onClick={() => setIsInternalNote((v) => !v)}
              className={cn(
                "p-1 transition-colors",
                isInternalNote ? "text-yellow-400" : "text-muted-foreground hover:text-foreground"
              )}
              title="Nota interna"
            >
              <PenLine className="h-4 w-4" />
            </button>

            {/* Enviar */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputText.trim() || sendingMessage}
              className={cn(
                "p-1 transition-colors",
                inputText.trim() && !sendingMessage
                  ? "text-primary hover:opacity-80"
                  : "text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              {sendingMessage ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Coluna direita ────────────────────────────────────────────────────────────

interface RightColumnProps {
  conv: Conversation | null;
  messages: Message[];
  onToggleBot: (active: boolean) => void;
}

function RightColumn({ conv, messages, onToggleBot }: RightColumnProps) {
  if (!conv) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground text-center px-4">
          Selecione uma conversa para ver detalhes
        </p>
      </div>
    );
  }

  // Timeline: últimas 5 mensagens de sistema
  const timeline = messages
    .filter((m) => m.sender_type === "system")
    .slice(-5);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Contato */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Contato
        </p>
        <p className="text-sm font-bold text-foreground">
          {conv.contact_name ?? "—"}
        </p>
        {conv.contact_phone && (
          <p className="text-xs text-muted-foreground mt-0.5">{conv.contact_phone}</p>
        )}
        <div className="mt-1">
          <ChannelBadge channel={conv.channel_type} />
        </div>
      </div>

      {/* Tags */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Tags
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          Tags editáveis — em breve
        </p>
      </div>

      {/* Conversa */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Conversa
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Status</span>
            <StatusBadgeSmall status={conv.status} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Agente</span>
            <span className="text-[11px] text-foreground">
              {conv.assigned_agent_id ?? "Não atribuído"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Bot</span>
            <Switch
              checked={conv.bot_active}
              onCheckedChange={onToggleBot}
              className="scale-75"
            />
          </div>
          {conv.last_message_at && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Última msg</span>
              <span className="text-[11px] text-foreground">
                {formatConvTimestamp(conv.last_message_at)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Ver no CRM */}
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs gap-1.5"
        onClick={() => toast.info("Abrindo contato no CRM...")}
      >
        <ExternalLink className="h-3 w-3" />
        Ver no CRM
      </Button>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Timeline
          </p>
          <div className="space-y-1.5">
            {timeline.map((m) => (
              <div key={m.id} className="text-[11px] text-muted-foreground italic">
                {m.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function OmnichannelInboxPage() {
  const { auth } = useClientAuth();
  const {
    conversations,
    conversationsLoading,
    filters: hookFilters,
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
    resolveConversation,
    toggleBotForConversation,
    unreadCount,
  } = useOmnichannelInbox();

  // Auto-registro do atendente ao montar a página (fire-and-forget)
  useEffect(() => {
    if (!auth?.id || !auth?.organization_id || !auth?.user?.id) return;
    supabase.rpc('ensure_client_agent', {
      p_client_id:       auth.id,
      p_organization_id: auth.organization_id,
      p_crm_user_id:     auth.user.id,
      p_display_name:    auth.user.full_name ?? auth.user.email ?? 'Agente',
      p_avatar_url:      (auth?.user as unknown as { avatar_url?: string })?.avatar_url ?? null,
    }).then(({ error }) => {
      if (error) console.warn('[OmnichannelInboxPage] ensure_client_agent:', error);
    });
  }, [auth?.id, auth?.organization_id, auth?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtros locais (UI) que traduzem para hookFilters
  const [localSearch, setLocalSearch] = useState(hookFilters.search ?? "");
  const [localChannel, setLocalChannel] = useState<ChannelFilter>(
    (hookFilters.channel as ChannelFilter) ?? null
  );
  const [localStatus, setLocalStatus] = useState<StatusFilter>(
    (hookFilters.status as StatusFilter) ?? null
  );

  // Estado de painel direito
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Responsividade: esconder lista quando conversa selecionada em mobile
  const showListOnMobile = !activeConversationId;

  // Sincronizar filtros com o hook
  useEffect(() => {
    setFilters({
      search: localSearch || undefined,
      channel: localChannel ?? undefined,
      status: localStatus ?? undefined,
    });
  }, [localSearch, localChannel, localStatus, setFilters]);

  const handleFilterChange = useCallback(
    (partial: Partial<{ search: string; channel: ChannelFilter; status: StatusFilter }>) => {
      if (partial.search !== undefined) setLocalSearch(partial.search);
      if (partial.channel !== undefined) setLocalChannel(partial.channel);
      if (partial.status !== undefined) setLocalStatus(partial.status);
    },
    []
  );

  const handleSend = useCallback(
    async (content: string, isInternal: boolean) => {
      if (!activeConversationId) return;
      try {
        await sendMessage({ conversationId: activeConversationId, content, isInternal });
      } catch (err) {
        toast.error("Erro ao enviar mensagem");
      }
    },
    [activeConversationId, sendMessage]
  );

  const handleResolve = useCallback(async () => {
    if (!activeConversationId) return;
    await resolveConversation(activeConversationId);
  }, [activeConversationId, resolveConversation]);

  const handleToggleBot = useCallback(
    async (active: boolean) => {
      if (!activeConversationId) return;
      await toggleBotForConversation(activeConversationId, active);
    },
    [activeConversationId, toggleBotForConversation]
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -mt-6 md:-mt-8 overflow-hidden">
      {/* Coluna esquerda — escondida em mobile quando conversa selecionada */}
      <div
        className={cn(
          "flex-col min-h-0",
          showListOnMobile ? "flex" : "hidden sm:flex"
        )}
      >
        <LeftColumn
          conversations={conversations}
          loading={conversationsLoading}
          activeId={activeConversationId}
          onSelect={setActiveConversation}
          unreadCount={unreadCount}
          filters={{ search: localSearch, channel: localChannel, status: localStatus }}
          onFilterChange={handleFilterChange}
          myStatus={myStatus}
          setMyStatus={setMyStatus}
        />
      </div>

      {/* Coluna central */}
      <div
        className={cn(
          "flex-col min-h-0 flex-1",
          !showListOnMobile ? "flex" : "hidden sm:flex"
        )}
      >
        <CenterColumn
          activeConversation={activeConversation}
          messages={messages}
          messagesLoading={messagesLoading}
          hasMoreMessages={hasMoreMessages}
          loadMoreMessages={loadMoreMessages}
          sendingMessage={sendingMessage}
          onSend={handleSend}
          onResolve={handleResolve}
          onToggleBot={handleToggleBot}
          onBack={activeConversationId ? () => setActiveConversation(null) : undefined}
        />
      </div>

      {/* Coluna direita — oculta em md e menor */}
      <div
        className={cn(
          "hidden lg:flex flex-col min-h-0 border-l border-border transition-all duration-200",
          rightPanelOpen ? "w-72" : "w-10"
        )}
      >
        {/* Botão colapso */}
        <div className="shrink-0 flex items-center justify-start border-b border-border px-2 py-2">
          <button
            onClick={() => setRightPanelOpen((v) => !v)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            {rightPanelOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {rightPanelOpen && (
          <RightColumn
            conv={activeConversation}
            messages={messages}
            onToggleBot={handleToggleBot}
          />
        )}
      </div>
    </div>
  );
}

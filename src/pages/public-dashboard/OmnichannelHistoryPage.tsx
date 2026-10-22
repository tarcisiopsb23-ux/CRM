/**
 * OmnichannelHistoryPage
 *
 * Histórico de conversas resolvidas com filtros por canal, período e busca.
 * Click em um item abre um Sheet lateral com a thread em modo read-only.
 *
 * Substitui MensagensHistoricoPage.tsx (placeholder).
 */

import { useState, useEffect, useCallback } from "react";
import { ArchiveX, Search } from "lucide-react";
import { parseISO, format, isValid, formatDistanceStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useOmnichannelInbox, Conversation, Message } from "@/hooks/useOmnichannelInbox";
import { PageHeader } from "./components/PageHeader";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
  } catch {
    return "—";
  }
}

function calcDuration(createdAt: string | undefined, lastAt: string | null): string {
  if (!createdAt || !lastAt) return "—";
  try {
    return formatDistanceStrict(parseISO(createdAt), parseISO(lastAt), { locale: ptBR });
  } catch {
    return "—";
  }
}

// ─── Canal / status labels ─────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp:          "WhatsApp",
  instagram_dm:      "Instagram",
  facebook_dm:       "Facebook",
  instagram_comment: "Instagram",
  facebook_comment:  "Facebook",
};

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        channel === "whatsapp"
          ? "bg-emerald-500/10 text-emerald-400"
          : channel.startsWith("instagram")
          ? "bg-pink-500/10 text-pink-400"
          : "bg-blue-500/10 text-blue-400"
      )}
    >
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  );
}

// ─── Mensagem (read-only) ──────────────────────────────────────────────────────

function ReadOnlyMessage({ msg }: { msg: Message }) {
  if (msg.message_type === "event" || msg.sender_type === "system") {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] italic text-muted-foreground">{msg.content}</span>
      </div>
    );
  }

  const isInbound = msg.direction === "inbound";
  const isBot = msg.sender_type === "bot";
  const isInternal = msg.is_internal;

  const bubbleClass = cn(
    "max-w-xs md:max-w-sm px-3 py-2 text-sm break-words rounded-2xl",
    isInternal
      ? "bg-yellow-500/10 border border-yellow-500/20 text-foreground"
      : isInbound
      ? "bg-secondary/40 rounded-tl-sm text-foreground"
      : isBot
      ? "bg-violet-500/15 text-violet-300 rounded-tr-sm"
      : "bg-blue-500/15 text-blue-300 rounded-tr-sm"
  );

  return (
    <div className={cn("flex my-0.5", isInbound ? "justify-start" : "justify-end")}>
      <div className="flex flex-col">
        {isInternal && (
          <span className="text-[9px] font-semibold text-yellow-500 mb-0.5 self-end">
            Nota interna
          </span>
        )}
        <div className={bubbleClass}>
          {msg.message_type === "image" && msg.media_url ? (
            <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
              <img
                src={msg.media_url}
                alt={msg.media_caption ?? "Imagem"}
                className="max-w-[200px] rounded-lg"
              />
            </a>
          ) : msg.message_type === "audio" && msg.media_url ? (
            <audio controls className="w-48" src={msg.media_url} />
          ) : (
            <p>{msg.content}</p>
          )}
        </div>
        <span className={cn("text-[10px] text-muted-foreground mt-0.5", isInbound ? "text-left" : "text-right")}>
          {format(parseISO(msg.created_at), "HH:mm")}
        </span>
      </div>
    </div>
  );
}

// ─── Item da lista ─────────────────────────────────────────────────────────────

interface HistoryItemProps {
  conv: Conversation;
  onClick: () => void;
}

function HistoryItem({ conv, onClick }: HistoryItemProps) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border hover:bg-secondary/20 transition-colors"
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="h-9 w-9 shrink-0 rounded-full bg-secondary/60 flex items-center justify-center text-xs font-semibold text-muted-foreground">
        {conv.contact_name
          ? conv.contact_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
          : "?"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">
            {conv.contact_name ?? conv.contact_phone ?? "Desconhecido"}
          </span>
          <ChannelBadge channel={conv.channel_type} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            Agente: {conv.assigned_agent_id ?? "N/A"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatTs(conv.last_message_at)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────────

export function OmnichannelHistoryPage() {
  const {
    conversations,
    conversationsLoading,
    setFilters,
    activeConversationId,
    setActiveConversation,
    activeConversation,
    messages,
    messagesLoading,
  } = useOmnichannelInbox();

  // Aplicar filtro de status=resolved ao montar
  useEffect(() => {
    setFilters({ status: "resolved" });
    return () => {
      setFilters({});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtros locais
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sheet aberto
  const [sheetOpen, setSheetOpen] = useState(false);

  const openConversation = useCallback(
    (id: string) => {
      setActiveConversation(id);
      setSheetOpen(true);
    },
    [setActiveConversation]
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setActiveConversation(null);
  }, [setActiveConversation]);

  // Filtrar client-side
  const filtered = conversations
    .filter((c) => c.status === "resolved" || c.status === "closed")
    .filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        return (
          c.contact_name?.toLowerCase().includes(s) ||
          c.contact_phone?.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .filter((c) => {
      if (channel !== "all") return c.channel_type === channel;
      return true;
    })
    .filter((c) => {
      if (!dateFrom && !dateTo) return true;
      const ts = c.last_message_at;
      if (!ts) return false;
      try {
        const d = parseISO(ts);
        if (dateFrom && d < parseISO(dateFrom)) return false;
        if (dateTo) {
          const end = parseISO(dateTo);
          end.setHours(23, 59, 59);
          if (d > end) return false;
        }
        return true;
      } catch {
        return false;
      }
    });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Histórico de Conversas"
        description="Consulte todas as conversas encerradas, com filtros por canal, período e contato."
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            className="pl-8 h-9 text-sm bg-secondary/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Canal */}
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="instagram_dm">Instagram</SelectItem>
            <SelectItem value="facebook_dm">Facebook</SelectItem>
          </SelectContent>
        </Select>

        {/* Data de */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">De</span>
          <Input
            type="date"
            className="h-9 text-xs w-32 [color-scheme:dark]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        {/* Data até */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Até</span>
          <Input
            type="date"
            className="h-9 text-xs w-32 [color-scheme:dark]"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <Badge variant="outline" className="text-xs text-muted-foreground h-9 px-3 rounded-md">
          {filtered.length} conversas
        </Badge>
      </div>

      {/* Loading */}
      {conversationsLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!conversationsLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/50">
            <ArchiveX className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum histórico ainda</p>
        </div>
      )}

      {/* Lista */}
      {!conversationsLoading && filtered.length > 0 && (
        <div className="card-surface rounded-xl overflow-hidden divide-y divide-border">
          {filtered.map((conv) => (
            <HistoryItem key={conv.id} conv={conv} onClick={() => openConversation(conv.id)} />
          ))}
        </div>
      )}

      {/* Sheet — thread read-only */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) closeSheet(); }}>
        <SheetContent side="right" className="w-[600px] max-w-full flex flex-col p-0">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-sm font-semibold">
                  {activeConversation?.contact_name ?? activeConversation?.contact_phone ?? "Conversa"}
                </SheetTitle>
                {activeConversation && (
                  <ChannelBadge channel={activeConversation.channel_type} />
                )}
              </div>
              <SheetClose asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={closeSheet}>
                  Fechar
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          {/* Thread read-only */}
          <div className="flex-1 overflow-y-auto p-4">
            {messagesLoading && (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {!messagesLoading && messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nenhuma mensagem registrada.
              </p>
            )}
            {!messagesLoading &&
              messages.map((msg) => <ReadOnlyMessage key={msg.id} msg={msg} />)}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

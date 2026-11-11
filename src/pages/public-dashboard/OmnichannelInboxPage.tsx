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

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircle, Search, ChevronLeft, ChevronRight,
  Send, Paperclip, PenLine, Check, CheckCheck, Clock,
  FileText, ExternalLink, User,
  GitMerge,
  Instagram, Facebook, Phone, AlertTriangle,
  MessageSquare, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

import {
  useOmnichannelInbox,
  Conversation,
  Message,
} from "@/hooks/useOmnichannelInbox";
import { AgentStatusToggle } from "@/components/omnichannel/AgentStatusToggle";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { supabase } from "@/lib/supabase";
import {
  canAssumeConversation,
  canFinalizeConversation,
  canTransferConversation,
  canSupervise,
} from "./omniConversationActions";

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

type ChannelKey = "whatsapp" | "instagram" | "facebook";

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp:        "text-muted-foreground",
  instagram:       "text-muted-foreground",
  instagram_dm:    "text-muted-foreground",
  facebook:        "text-muted-foreground",
  facebook_dm:     "text-muted-foreground",
  instagram_comment: "text-muted-foreground",
  facebook_comment:  "text-muted-foreground",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp:          "WhatsApp",
  instagram:         "Instagram",
  instagram_dm:      "Instagram",
  facebook:          "Facebook",
  facebook_dm:       "Facebook",
  instagram_comment: "Instagram",
  facebook_comment:  "Facebook",
};

function ChannelDot({ channel: _channel }: { channel: string }) {
  return (
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
  );
}

function ChannelBadge({ channel, small = false }: { channel: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium bg-muted/60 text-muted-foreground border border-border/40",
        small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
      )}
    >
      <ChannelDot channel={channel} />
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  );
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  bot_active:     { label: "Bot",        className: "bg-secondary/60 text-muted-foreground border-border/40" },
  waiting_human:  { label: "Aguardando", className: "bg-secondary/60 text-muted-foreground border-border/40" },
  human_active:   { label: "Humano",     className: "bg-secondary/60 text-muted-foreground border-border/40" },
  resolved:       { label: "Resolvido",  className: "bg-secondary/60 text-muted-foreground border-border/40" },
  open:           { label: "Aberta",     className: "bg-secondary/60 text-muted-foreground border-border/40" },
  closed:         { label: "Encerrada",  className: "bg-secondary/60 text-muted-foreground border-border/40" },
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
  onAssume,
  myAgentId,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
  onAssume?: (convId: string) => void;
  myAgentId?: string | null;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/30 cursor-pointer",
        isActive && "bg-secondary/40"
      )}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <ConvAvatar conv={conv} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-foreground truncate">
            {conv.contact_name ?? conv.contact_phone ?? "Desconhecido"}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {onAssume && canAssumeConversation(conv, myAgentId) && (
              <Button
                size="sm"
                variant="default"
                className="h-6 px-2.5 text-[10px] font-semibold"
                onClick={(e) => { e.stopPropagation(); onAssume(conv.id); }}
              >
                Assumir
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatConvTimestamp(conv.last_message_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-[11px] text-muted-foreground truncate flex-1 overflow-hidden whitespace-nowrap">
            {conv.last_message_preview ?? "—"}
          </span>
          {conv.unread_count > 0 && (
            <span className="h-4 w-4 shrink-0 rounded-full bg-primary flex items-center justify-center text-[9px] font-bold text-primary-foreground">
              {conv.unread_count > 9 ? "9+" : conv.unread_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <ChannelBadge channel={conv.channel_type} small />
          <StatusBadgeSmall status={conv.status} />
          {conv.bot_active ? (
            <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium bg-secondary/60 text-muted-foreground border-border/40">
              Bot On
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium bg-secondary/40 text-muted-foreground/60 border-border/30">
              Bot Off
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delivery icon ─────────────────────────────────────────────────────────────

function DeliveryIcon({ status }: { status: string }) {
  if (status === "pending")   return <Clock className="h-3 w-3 text-muted-foreground" />;
  if (status === "sent")      return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "read")      return <CheckCheck className="h-3 w-3 text-primary/60" />;
  return null;
}

// ─── Player de áudio ──────────────────────────────────────────────────────────

function AudioPlayer({ src, transcription }: { src: string; transcription?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]       = useState(false);
  const [progress, setProgress]     = useState(0);
  const [duration, setDuration]     = useState(0);
  const [speed, setSpeed]           = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);

  const speeds = [1, 1.5, 2];

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play(); }
    setPlaying(!playing);
  };

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setProgress((a.currentTime / a.duration) * 100);
  };

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration);
  };

  const onEnded = () => setPlaying(false);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * a.duration;
  };

  const cycleSpeed = () => {
    const a   = audioRef.current;
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (a) a.playbackRate = next;
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-[220px] max-w-[280px]">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        preload="metadata"
      />

      {/* Controles */}
      <div className="flex items-center gap-2">
        {/* Play/Pause */}
        <button
          type="button"
          onClick={toggle}
          className="h-8 w-8 shrink-0 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
        >
          {playing
            ? <span className="text-white text-xs font-bold">⏸</span>
            : <span className="text-white text-xs font-bold">▶</span>
          }
        </button>

        {/* Barra de progresso */}
        <div className="flex-1 flex flex-col gap-0.5">
          <div
            className="h-2 w-full bg-white/30 rounded-full cursor-pointer overflow-hidden"
            onClick={seek}
          >
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-white/70">
            <span>{fmt(audioRef.current?.currentTime ?? 0)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Velocidade */}
        <button
          type="button"
          onClick={cycleSpeed}
          className="shrink-0 text-[11px] font-bold text-white/80 hover:text-white w-10 h-7 rounded-md bg-white/10 hover:bg-white/20 text-center transition-colors"
          title="Velocidade de reprodução"
        >
          {speed}x
        </button>
      </div>

      {/* Transcrição */}
      {transcription && (
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-[10px] text-white/60 hover:text-white underline underline-offset-2 transition-colors"
          >
            {showTranscript ? "Ocultar transcrição" : "Ver transcrição"}
          </button>
          {showTranscript && (
            <p className="mt-1 text-xs text-white/70 italic leading-snug">
              "{transcription}"
            </p>
          )}
        </div>
      )}
    </div>
  );
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
      ? "bg-muted/60 border border-border/40 rounded-2xl text-foreground"
      : isInbound
      // Inbound (cliente): verde do indicador Bot Online
      ? "bg-emerald-500/15 text-foreground rounded-2xl rounded-tl-sm border border-emerald-500/25"
      : isBot
      // Bot outbound: cinza discreto
      ? "bg-muted/60 text-foreground rounded-2xl rounded-tr-sm"
      // Humano outbound: cinza um pouco mais escuro
      : "bg-secondary/25 text-foreground rounded-2xl rounded-tr-sm"
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
      return <AudioPlayer src={msg.media_url} transcription={msg.content ?? undefined} />;
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

// ─── ContactSheet modal ────────────────────────────────────────────────────────

interface OmniContact {
  id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  client_id: string | null;
  profile_pic_url: string | null;
  metadata?: {
    instagram?: {
      follower_count?: number;
      is_user_follow_business?: boolean;
      is_business_follow_user?: boolean;
    };
  } | null;
}

interface OmniIdentity {
  id: string;
  channel_type: string;
  external_user_id: string;
  username: string | null;
}

interface ContactComment {
  id: string;
  channel: string;
  post_id: string;
  post_url: string | null;
  comment_text: string | null;
  sender_username: string | null;
  commented_at: string;
  external_comment_id: string;
}

interface ContactSheetProps {
  contactId: string | null;
  channelType: string | null;
  clientId: string | null;
  organizationId: string | null;
  authUserId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onContactChanged?: () => void;
}

function ChannelIcon({ ch }: { ch: string }) {
  if (ch === "whatsapp")           return <Phone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
  if (ch.startsWith("instagram"))  return <Instagram className="h-3.5 w-3.5 text-pink-400 shrink-0" />;
  if (ch.startsWith("facebook"))   return <Facebook className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  return <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function ContactSheet({
  contactId,
  channelType,
  clientId,
  organizationId,
  authUserId,
  open,
  onOpenChange,
  onContactChanged,
}: ContactSheetProps) {
  const [loading, setLoading]         = useState(false);
  const [contact, setContact]         = useState<OmniContact | null>(null);
  const [identities, setIdentities]   = useState<OmniIdentity[]>([]);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [igMeta, setIgMeta] = useState<{
    follower_count?: number;
    is_user_follow_business?: boolean;
    is_business_follow_user?: boolean;
  } | null>(null);

  // Section 6 — comments
  const [comments, setComments] = useState<ContactComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Section 1 form
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone]             = useState("");
  const [email, setEmail]             = useState("");
  const [saving, setSaving]           = useState(false);

  // Section 3 — client link (removido)

  // Section 4 — converter para CRM
  const dc = useDynamicClient();
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertType, setConvertType]           = useState<"lead" | "client" | null>(null);
  const [convName, setConvName]   = useState("");
  const [convPhone, setConvPhone] = useState("");
  const [convEmail, setConvEmail] = useState("");
  const [convNotes, setConvNotes] = useState("");
  const [converting, setConverting] = useState(false);

  const openConvert = (type: "lead" | "client") => {
    setConvertType(type);
    setConvName(displayName);
    setConvPhone(phone);
    setConvEmail(email);
    setConvNotes("");
    setConvertModalOpen(true);
  };

  const handleConvertSubmit = async () => {
    if (!dc || !clientId || !convertType || !convName.trim()) {
      toast.error("Preencha pelo menos o nome.");
      return;
    }
    setConverting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (dc as any)
        .from("crm_contacts")
        .insert({
          name: convName.trim(),
          phone: convPhone.trim() || null,
          email: convEmail.trim() || null,
          source: "omnichannel",
          notes: convNotes.trim() || null,
          client_id: clientId,
          metadata: { type: convertType },
        });
      if (error) throw error;
      toast.success(convertType === "lead" ? "Lead criado com sucesso!" : "Cliente criado com sucesso!");
      setConvertModalOpen(false);
    } catch (err) {
      console.error('[ContactSheet] handleConvertSubmit:', err);
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setConverting(false);
    }
  };

  // Section 5 — merge
  const [mergeSearch, setMergeSearch]     = useState("");
  const [mergeResults, setMergeResults]   = useState<Array<{ id: string; display_name: string | null; phone: string | null }>>([]);
  const [mergeTarget, setMergeTarget]     = useState<{ id: string; display_name: string | null } | null>(null);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [merging, setMerging]             = useState(false);

  // ── Carregamento ────────────────────────────────────────────────────────────

  const loadContact = useCallback(async () => {
    if (!contactId || !clientId) return;
    setLoading(true);
    try {
      const { data: row, error } = await supabase
        .from('client_channel_contacts')
        .select('id, display_name, phone, email, client_id, metadata')
        .eq('id', contactId)
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;

      if (row) {
        setContact({
          id: row.id,
          display_name: row.display_name ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          client_id: row.client_id ?? null,
          profile_pic_url: row.metadata?.avatar_url ?? null,
          metadata: row.metadata ?? null,
        });
        setProfilePicUrl(row.metadata?.avatar_url ?? null);
        setIgMeta(row.metadata?.instagram ?? null);
        setDisplayName(row.display_name ?? "");
        setPhone(row.phone ?? "");
        setEmail(row.email ?? "");
      } else {
        setContact(null);
        setDisplayName(""); setPhone(""); setEmail("");
        setProfilePicUrl(null); setIgMeta(null);
      }

      // Identidades (deduplicadas por channel_type + external_user_id)
      const { data: ids } = await supabase
        .from('client_contact_identities')
        .select('id, channel_type, external_user_id, username')
        .eq('contact_id', contactId)
        .eq('client_id', clientId);
      const unique = (ids ?? []).filter((item, idx, arr) =>
        arr.findIndex(x => x.channel_type === item.channel_type && x.external_user_id === item.external_user_id) === idx
      );
      setIdentities(unique as OmniIdentity[]);

    } catch (err) {
      console.error('[ContactSheet] loadContact error:', err);
    } finally {
      setLoading(false);
    }
  }, [contactId, clientId]);

  const loadComments = useCallback(async () => {
    if (!contactId || !clientId) return;
    setCommentsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_contact_comments', {
        p_contact_id: contactId,
        p_client_id: clientId,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      setComments((data ?? []) as ContactComment[]);
    } catch (err) {
      console.error('[ContactSheet] loadComments error:', err);
    } finally {
      setCommentsLoading(false);
    }
  }, [contactId, clientId]);

  // Load linked client name when contact changes — removido (vínculo não é mais exibido)

  useEffect(() => {
    if (open) {
      setMergeSearch("");
      setMergeResults([]);
      setMergeTarget(null);
      loadContact();
    }
  }, [open, contactId, loadContact]);

  // Reset comments when sheet closes
  useEffect(() => {
    if (!open) {
      setComments([]);
      setCommentsOpen(false);
    }
  }, [open]);

  // Load comments when section is expanded
  useEffect(() => {
    if (commentsOpen) loadComments();
  }, [commentsOpen, loadComments]);

  // ── Section 1: Save identification ─────────────────────────────────────────

  const handleSave = async () => {
    if (!contactId || !clientId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('client_channel_contacts')
        .update({ display_name: displayName, phone, email })
        .eq('id', contactId)
        .eq('client_id', clientId);
      if (error) throw error;
      toast.success("Contato atualizado");
      onContactChanged?.();
      await loadContact();
    } catch (err) {
      toast.error("Erro ao salvar contato");
      console.error('[ContactSheet] handleSave:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Section 5: Merge search ────────────────────────────────────────────────

  useEffect(() => {
    if (!mergeSearch || !contactId) { setMergeResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('client_channel_contacts')
        .select('id, display_name, phone')
        .eq('client_id', clientId)
        .ilike('display_name', `%${mergeSearch}%`)
        .neq('id', contactId)
        .limit(10);
      setMergeResults((data ?? []) as Array<{ id: string; display_name: string | null; phone: string | null }>);
    }, 300);
    return () => clearTimeout(timer);
  }, [mergeSearch, contactId, clientId]);

  const handleMergeConfirm = async () => {
    if (!mergeTarget || !contactId || !authUserId) return;
    setMerging(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('merge_omni_contacts', {
        p_winner_id: contactId,
        p_loser_id: mergeTarget.id,
        p_merged_by: authUserId,
      });
      if (error) throw error;
      toast.success("Cadastros unificados com sucesso");
      setMergeConfirmOpen(false); setMergeTarget(null);
      setMergeSearch(""); setMergeResults([]);
      onContactChanged?.(); await loadContact();
    } catch {
      toast.error("Erro ao unificar cadastros");
    } finally {
      setMerging(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" />
              Identificação do Contato
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

              {/* ── Seção 1: Identificação ──────────────────────────────── */}
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dados do contato
                </p>
                <div className="flex items-center gap-3 mb-1">
                  <Avatar className="h-12 w-12 shrink-0">
                    {profilePicUrl &&
                     (channelType?.startsWith("instagram") || channelType?.startsWith("facebook")) && (
                      <AvatarImage src={profilePicUrl} alt="Foto do contato" />
                    )}
                    <AvatarFallback className="text-sm bg-muted">
                      {displayName ? displayName.slice(0, 2).toUpperCase() : "?"}
                    </AvatarFallback>
                  </Avatar>
                  {profilePicUrl &&
                   (channelType?.startsWith("instagram") || channelType?.startsWith("facebook")) && (
                    <span className="text-[10px] text-muted-foreground italic leading-tight">
                      Foto sincronizada pelo canal
                    </span>
                  )}
                </div>

                {/* ── Dados do perfil Instagram ──────────────────────── */}
                {igMeta && channelType?.startsWith("instagram") && (
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Perfil Instagram
                    </p>
                    {igMeta.follower_count !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Seguidores</span>
                        <span className="text-xs font-medium">
                          {igMeta.follower_count.toLocaleString("pt-BR")}
                        </span>
                      </div>
                    )}
                    {igMeta.is_user_follow_business !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Segue a conta</span>
                        <span className={`text-xs font-medium ${igMeta.is_user_follow_business ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {igMeta.is_user_follow_business ? "Sim" : "Não"}
                        </span>
                      </div>
                    )}
                    {igMeta.is_business_follow_user !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Conta segue de volta</span>
                        <span className={`text-xs font-medium ${igMeta.is_business_follow_user ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {igMeta.is_business_follow_user ? "Sim" : "Não"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nome do contato"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefone / WhatsApp</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+55 11 99999-0000"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">E-mail</Label>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </section>

              {/* ── Seção 2: Canais conectados ──────────────────────────── */}
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Canais identificados
                </p>
                {identities.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum canal identificado</p>
                ) : (
                  <div className="space-y-1">
                    {identities.map((id) => (
                      <div key={id.id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5">
                        <ChannelIcon ch={id.channel_type} />
                        <span className="text-xs text-foreground truncate">
                          {id.username ?? id.external_user_id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Seção 4: Converter para CRM ────────────────────────── */}
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Converter para CRM
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={() => openConvert("lead")}
                  >
                    Transformar em Lead
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={() => openConvert("client")}
                  >
                    Transformar em Cliente
                  </Button>
                </div>
              </section>

              {/* ── Seção 5: Unificar cadastros ─────────────────────────── */}
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Unificar cadastros
                </p>
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300">
                    Esta ação não pode ser desfeita automaticamente. O cadastro selecionado será mesclado neste.
                  </p>
                </div>
                <Input
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  placeholder="Buscar outro cadastro para mesclar..."
                  className="h-8 text-xs"
                />
                {mergeResults.length > 0 && (
                  <div className="rounded-md border border-border overflow-hidden">
                    {mergeResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setMergeTarget(m); setMergeConfirmOpen(true); }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary/40 transition-colors border-b border-border last:border-0"
                      >
                        <span className="font-medium">{m.display_name ?? "Sem nome"}</span>
                        {m.phone && <span className="text-muted-foreground ml-1.5">{m.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Seção 6: Comentários ────────────────────────────────── */}
              <section className="space-y-2">
                <Collapsible open={commentsOpen} onOpenChange={(v) => setCommentsOpen(v)}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Comentários
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                          commentsOpen && "rotate-180"
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {commentsLoading && (
                      <div className="flex justify-center py-4">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    )}
                    {!commentsLoading && comments.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">
                        Nenhum comentário registrado
                      </p>
                    )}
                    {!commentsLoading && comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border border-border bg-secondary/20 px-3 py-2 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <ChannelBadge channel={c.channel} small />
                            {c.sender_username && (
                              <span className="text-xs font-medium text-foreground truncate">
                                @{c.sender_username}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatMsgTimestamp(c.commented_at)}
                          </span>
                        </div>
                        {c.comment_text && (
                          <p className="text-xs text-foreground break-words">{c.comment_text}</p>
                        )}
                        {c.post_url && (
                          <a
                            href={c.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            Ver publicação
                          </a>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </section>

            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog — Converter para CRM */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {convertType === "lead" ? "Transformar em Lead" : "Transformar em Cliente"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Cadastrar contato no CRM
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={convName} onChange={e => setConvName(e.target.value)} placeholder="Nome completo" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={convPhone} onChange={e => setConvPhone(e.target.value)} placeholder="+55 11 99999-0000" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input value={convEmail} onChange={e => setConvEmail(e.target.value)} placeholder="email@exemplo.com" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={convNotes} onChange={e => setConvNotes(e.target.value)} placeholder="Observações opcionais" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConvertModalOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleConvertSubmit} disabled={converting || !convName.trim()}>
              {converting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm merge dialog */}
      <Dialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <GitMerge className="h-4 w-4" /> Confirmar unificação
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirmar unificação de cadastros de contato
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O cadastro <strong className="text-foreground">{mergeTarget?.display_name ?? "selecionado"}</strong> será mesclado neste contato. Todos os canais e histórico serão transferidos. Isso não pode ser desfeito automaticamente.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMergeConfirmOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={handleMergeConfirm} disabled={merging}>
              {merging ? "Unificando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Coluna esquerda ───────────────────────────────────────────────────────────

type ChannelFilter = ChannelKey | null;
type StatusFilter = "open" | "bot_active" | "waiting_human" | "human_active" | "resolved" | null;

// Pastas de filtro — cada uma mapeia para um conjunto de filtros do hook
type InboxFolder =
  | "minhas"       // human_active + assignedToMe
  | "nao_atribuidas" // sem agente, status ativo
  | "urgentes"     // comentários (instagram_comment / facebook_comment)
  | "bot_ativo"    // bot_active = true
  | "inbox_geral"  // sem filtro de atribuição
  | "finalizadas"; // resolved + closed

interface FolderDef {
  key: InboxFolder;
  label: string;
}

const FOLDERS: FolderDef[] = [
  { key: "minhas",           label: "Minhas Conversas" },
  { key: "nao_atribuidas",   label: "Não Atribuídas"   },
  { key: "urgentes",         label: "Urgentes"         },
  { key: "bot_ativo",        label: "Bot Ativo"        },
  { key: "inbox_geral",      label: "Inbox Geral"      },
  { key: "finalizadas",      label: "Finalizadas"      },
];

/** Converte uma pasta nos filtros do hook */
function folderToInboxFilters(
  folder: InboxFolder
): import("@/hooks/useOmnichannelInbox").InboxFilters {
  switch (folder) {
    case "minhas":
      return { status: "human_active" };
    case "nao_atribuidas":
      // Handoff ativo (waiting_human) sem atendente atribuído
      return { unassigned: true, status: "waiting_human" };
    case "urgentes":
      return { urgentOnly: true };
    case "bot_ativo":
      return { botActive: true };
    case "inbox_geral":
      return {};
    case "finalizadas":
      return { finalized: true };
    default:
      return {};
  }
}

interface LeftColumnProps {
  conversations: Conversation[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  folderCounts: Record<InboxFolder, number>;
  filters: {
    search: string;
    channel: ChannelFilter;
    folder: InboxFolder;
  };
  onFilterChange: (f: Partial<{ search: string; channel: ChannelFilter; folder: InboxFolder }>) => void;
  myStatus: ReturnType<typeof useOmnichannelInbox>["myStatus"];
  setMyStatus: ReturnType<typeof useOmnichannelInbox>["setMyStatus"];
  onAssume?: (convId: string) => void;
  myAgentId?: string | null;
  clientId: string | null;
  authUserId: string | null;
  organizationId: string | null;
}

function LeftColumn({
  conversations,
  loading,
  activeId,
  onSelect,
  folderCounts,
  filters,
  onFilterChange,
  myStatus,
  setMyStatus,
  onAssume,
  myAgentId,
  clientId,
  authUserId,
  organizationId,
}: LeftColumnProps) {
  // "Não Atribuídas" aparece primeiro quando há conversas nessa fila
  const orderedFolders: FolderDef[] = folderCounts.nao_atribuidas > 0
    ? [
        { key: "nao_atribuidas", label: "Não Atribuídas" },
        ...FOLDERS.filter(f => f.key !== "nao_atribuidas"),
      ]
    : FOLDERS;

  return (
    <div className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-border space-y-2">
        {/* Status do agente */}
        <div className="flex items-center justify-end">
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
        <select
          value={filters.channel ?? ""}
          onChange={(e) => onFilterChange({ channel: (e.target.value as ChannelFilter) || null })}
          className="w-full h-7 text-xs rounded-md border border-border bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="">Todos os canais</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>

        {/* Pastas */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1">
          {orderedFolders.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onFilterChange({ folder: key })}
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors font-medium shrink-0",
                filters.folder === key
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              )}
            >
              {label}
              {folderCounts[key] > 0 && (
                <span className={cn(
                  "h-3.5 min-w-[14px] px-0.5 rounded-full text-[9px] font-bold inline-flex items-center justify-center",
                  filters.folder === key
                    ? "bg-background text-foreground"
                    : "bg-primary text-primary-foreground"
                )}>
                  {folderCounts[key] > 9 ? "9+" : folderCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de conversas */}
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
              onAssume={onAssume}
              myAgentId={myAgentId}
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
  onAssume?: (convId: string) => void;
  onFinalize: () => void;
  onBack?: () => void;
  onTransfer?: (agentId: string, reason?: string) => Promise<void>;
  clientId?: string | null;
  myAgentId?: string | null;
  organizationId?: string | null;
  authUserId?: string | null;
  userRole?: string | null;
}

function CenterColumn({
  activeConversation,
  messages,
  messagesLoading,
  hasMoreMessages,
  loadMoreMessages,
  sendingMessage,
  onSend,
  onAssume,
  onFinalize,
  onBack,
  onTransfer,
  clientId,
  myAgentId,
  organizationId,
  authUserId,
  userRole,
}: CenterColumnProps) {
  const [inputText, setInputText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Transfer dialog state
  const [transferOpen, setTransferOpen] = useState(false);
  const [onlineAgents, setOnlineAgents] = useState<Array<{ agent_id: string; display_name: string; current_load: number }>>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [transferReason, setTransferReason] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // Contact sheet state
  const [contactSheetOpen, setContactSheetOpen] = useState(false);

  const handleOpenTransfer = async () => {
    if (!clientId) return;
    const { data, error } = await supabase.rpc('get_online_agents_for_client', { p_client_id: clientId });
    if (!error && data) {
      setOnlineAgents((data as any[]).filter((a: any) => a.agent_id !== myAgentId));
    }
    setSelectedAgent('');
    setTransferReason('');
    setTransferOpen(true);
  };

  const handleConfirmTransfer = async () => {
    if (!selectedAgent || !onTransfer) return;
    setTransferLoading(true);
    try {
      await onTransfer(selectedAgent, transferReason || undefined);
      toast.success('Conversa transferida com sucesso!');
      setTransferOpen(false);
    } catch {
      toast.error('Erro ao transferir conversa');
    } finally {
      setTransferLoading(false);
    }
  };

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

  // Caixa de digitação habilitada quando:
  // - bot desligado (bot_active = false), OU
  // - handoff ativo: status waiting_human ou human_active, OU
  // - atendente já atribuído
  // Desabilitada apenas quando bot está ativo E sem handoff em curso
  const conv = activeConversation;
  const botControllingConversation = conv
    ? conv.bot_active === true
      && conv.status !== "waiting_human"
      && conv.status !== "human_active"
      && conv.assigned_agent_id === null
    : false;

  const inputDisabled = expired24h || sendingMessage || botControllingConversation;

  // Visibilidade dos botões de ação: Assumir / Finalizar / Transferir.
  // O bot é controlado implicitamente — Assumir desliga, Finalizar religa.
  const supervisor = canSupervise(userRole);
  const showAssume = conv ? canAssumeConversation(conv, myAgentId) : false;
  const showFinalize = conv ? canFinalizeConversation(conv, myAgentId) : false;
  const showTransfer = conv ? canTransferConversation(conv, myAgentId, supervisor) : false;

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
            <button
              type="button"
              onClick={() => setContactSheetOpen(true)}
              className="text-sm font-semibold text-foreground truncate hover:underline text-left"
              title="Ver / identificar contato"
            >
              {conv.contact_name ?? conv.contact_phone ?? "Desconhecido"}
            </button>
            <ChannelBadge channel={conv.channel_type} />
            <StatusBadgeSmall status={conv.status} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Assumir */}
          {showAssume && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              onClick={() => onAssume?.(conv.id)}
            >
              Assumir
            </Button>
          )}
          {/* Finalizar */}
          {showFinalize && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onFinalize()}
            >
              Finalizar
            </Button>
          )}
          {/* Transferir */}
          {showTransfer && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={handleOpenTransfer}
              disabled={!clientId}
            >
              Transferir
            </Button>
          )}
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
                : botControllingConversation
                ? "Bot ativo — clique em Assumir para atender"
                : isInternalNote
                ? "Nota interna (não enviada ao cliente)..."
                : "Digite uma mensagem..."
            }
            disabled={inputDisabled}
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
              disabled={!inputText.trim() || sendingMessage || inputDisabled}
              className={cn(
                "p-1 transition-colors",
                inputText.trim() && !sendingMessage && !inputDisabled
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

      {/* Dialog de transferência */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir Conversa</DialogTitle>
            <DialogDescription className="sr-only">
              Transferir conversa para outro atendente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {onlineAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum outro atendente online no momento.</p>
            ) : (
              <div className="space-y-1">
                <label className="text-sm font-medium">Selecionar atendente</label>
                <div className="space-y-1">
                  {onlineAgents.map(agent => (
                    <button
                      key={agent.agent_id}
                      type="button"
                      onClick={() => setSelectedAgent(agent.agent_id)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors',
                        selectedAgent === agent.agent_id
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border hover:bg-secondary/40 text-foreground'
                      )}
                    >
                      <span>{agent.display_name}</span>
                      <span className="text-xs text-muted-foreground">{agent.current_load} conv.</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motivo (opcional)</label>
              <Textarea
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
                placeholder="Motivo da transferência..."
                rows={2}
                className="mt-1 resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmTransfer}
              disabled={!selectedAgent || transferLoading}
            >
              {transferLoading ? 'Transferindo...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ContactSheet */}
      <ContactSheet
        contactId={activeConversation?.omni_contact_id ?? activeConversation?.contact_id ?? null}
        channelType={activeConversation?.channel_type ?? null}
        clientId={clientId ?? null}
        organizationId={organizationId ?? null}
        authUserId={authUserId ?? null}
        open={contactSheetOpen}
        onOpenChange={setContactSheetOpen}
        onContactChanged={() => setContactSheetOpen(false)}
      />
    </div>
  );
}

// ─── Coluna direita ────────────────────────────────────────────────────────────

interface RightColumnProps {
  conv: Conversation | null;
  messages: Message[];
}

function RightColumn({ conv, messages }: RightColumnProps) {
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
            <Badge
              variant={conv.bot_active ? "default" : "secondary"}
              className="text-[10px] px-1.5 py-0.5 font-medium"
            >
              {conv.bot_active ? "Ativo" : "Inativo"}
            </Badge>
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
    waitingCount,
    assignConversation,
    transferConversation,
  } = useOmnichannelInbox();

  // Role do usuário para controle de permissões (Transferir p/ supervisores)
  const userRole = auth?.user?.role ?? "viewer";

  // myAgentId: capturado do ensure_client_agent no mount
  const [myAgentId, setMyAgentId] = useState<string | null>(null);

  // Auto-registro do atendente ao montar a página (fire-and-forget)
  useEffect(() => {
    if (!auth?.id || !auth?.organization_id || !auth?.user?.id) return;
    supabase.rpc('ensure_client_agent', {
      p_client_id:       auth.id,
      p_organization_id: auth.organization_id,
      p_crm_user_id:     auth.user.id,
      p_display_name:    auth.user.full_name ?? auth.user.email ?? 'Agente',
      p_avatar_url:      (auth?.user as unknown as { avatar_url?: string })?.avatar_url ?? null,
    }).then(({ data, error }) => {
      if (error) console.warn('[OmnichannelInboxPage] ensure_client_agent:', error);
      else if (data) {
        // ensure_client_agent pode retornar scalar (migrations antigas) ou
        // JSONB { agent_id, crm_user_id } (migration 135). Extrair defensivamente.
        const aid =
          data && typeof data === "object"
            ? (data as { agent_id?: string }).agent_id
            : (data as string);
        setMyAgentId(aid ?? null);
      }
    });
  }, [auth?.id, auth?.organization_id, auth?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtros locais (UI) que traduzem para hookFilters
  const [localSearch, setLocalSearch] = useState(hookFilters.search ?? "");
  const [localChannel, setLocalChannel] = useState<ChannelFilter>(
    (hookFilters.channel as ChannelFilter) ?? null
  );
  const [localFolder, setLocalFolder] = useState<InboxFolder>("minhas");

  // Estado de painel direito
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Responsividade: esconder lista quando conversa selecionada em mobile
  const showListOnMobile = !activeConversationId;

  // ── folderCounts: contagem de conversas por pasta (Step 4) ────────────────
  const [folderCounts, setFolderCounts] = useState<Record<InboxFolder, number>>({
    minhas: 0,
    nao_atribuidas: 0,
    urgentes: 0,
    bot_ativo: 0,
    inbox_geral: 0,
    finalizadas: 0,
  });

  useEffect(() => {
    const clientId = auth?.id;
    if (!clientId && !myAgentId) return;
    if (!clientId) return;

    const fetchCounts = async () => {
      const [minhasRes, naoAtribRes, urgentesRes, botAtivoRes, inboxGeralRes] = await Promise.all([
        // minhas: human_active atribuídas ao agente atual
        myAgentId
          ? supabase
              .from("client_channel_conversations")
              .select("id", { count: "exact", head: true })
              .eq("client_id", clientId)
              .eq("status", "human_active")
              .eq("assigned_agent_id", myAgentId)
          : Promise.resolve({ count: 0, error: null }),
        // nao_atribuidas: waiting_human sem agente
        supabase
          .from("client_channel_conversations")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("status", "waiting_human")
          .is("assigned_agent_id", null),
        // urgentes: comentários com status ativo
        supabase
          .from("client_channel_conversations")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .in("channel_type", ["instagram_comment", "facebook_comment"])
          .not("status", "in", '("resolved","closed")'),
        // bot_ativo: bot_active=true e status ativo
        supabase
          .from("client_channel_conversations")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("bot_active", true)
          .not("status", "in", '("resolved","closed")'),
        // inbox_geral: qualquer conversa ativa
        supabase
          .from("client_channel_conversations")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .not("status", "in", '("resolved","closed")'),
      ]);

      setFolderCounts({
        minhas:         minhasRes.count ?? 0,
        nao_atribuidas: naoAtribRes.count ?? 0,
        urgentes:       urgentesRes.count ?? 0,
        bot_ativo:      botAtivoRes.count ?? 0,
        inbox_geral:    inboxGeralRes.count ?? 0,
        finalizadas:    0,
      });
    };

    fetchCounts();
  }, [auth?.id, myAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── filteredConversations: filtragem client-side para pasta "minhas" (Step 2) ──
  const filteredConversations = useMemo(() => {
    if (localFolder === "minhas" && myAgentId) {
      return conversations.filter((conv) => conv.assigned_agent_id === myAgentId);
    }
    return conversations;
  }, [conversations, localFolder, myAgentId]);

  // Sincronizar filtros com o hook — pasta traduz para filtros compostos
  useEffect(() => {
    const folderFilters = folderToInboxFilters(localFolder);
    setFilters({
      ...folderFilters,
      search: localSearch || undefined,
      channel: localChannel ?? undefined,
    });
  }, [localSearch, localChannel, localFolder, setFilters]);

  const handleFilterChange = useCallback(
    (partial: Partial<{ search: string; channel: ChannelFilter; folder: InboxFolder }>) => {
      if (partial.search !== undefined) setLocalSearch(partial.search);
      if (partial.channel !== undefined) setLocalChannel(partial.channel);
      if (partial.folder !== undefined) setLocalFolder(partial.folder);
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

  const handleAssume = useCallback(async (convId: string) => {
    if (!myAgentId) return;
    try {
      await assignConversation(convId, myAgentId);
      toast.success('Conversa assumida!');
    } catch {
      toast.error('Erro ao assumir conversa');
    }
  }, [myAgentId, assignConversation]);

  // Finalizar: resolve a conversa (status=resolved + reativa o bot) e libera o
  // atendente (limpa assigned_agent_id), devolvendo a conversa ao pool do bot.
  const handleFinalize = useCallback(async () => {
    if (!activeConversationId || !auth?.id) return;
    await resolveConversation(activeConversationId);
    const { error } = await supabase
      .from("client_channel_conversations")
      .update({ assigned_agent_id: null })
      .eq("id", activeConversationId)
      .eq("client_id", auth.id);
    if (error) {
      console.warn("[OmnichannelInboxPage] clear assigned_agent_id:", error);
    }
    toast.success("Atendimento finalizado — bot reativado");
  }, [activeConversationId, resolveConversation, auth?.id]);

  const handleTransfer = useCallback(async (agentId: string, reason?: string) => {
    if (!activeConversationId) return;
    await transferConversation(activeConversationId, agentId, reason);
  }, [activeConversationId, transferConversation]);

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
          conversations={filteredConversations}
          loading={conversationsLoading}
          activeId={activeConversationId}
          onSelect={setActiveConversation}
          folderCounts={folderCounts}
          filters={{ search: localSearch, channel: localChannel, folder: localFolder }}
          onFilterChange={handleFilterChange}
          myStatus={myStatus}
          setMyStatus={setMyStatus}
          onAssume={handleAssume}
          myAgentId={myAgentId}
          clientId={auth?.id ?? null}
          authUserId={auth?.user?.id ?? null}
          organizationId={auth?.organization_id ?? null}
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
          onAssume={handleAssume}
          onFinalize={handleFinalize}
          onBack={activeConversationId ? () => setActiveConversation(null) : undefined}
          onTransfer={handleTransfer}
          clientId={auth?.id ?? null}
          myAgentId={myAgentId}
          organizationId={auth?.organization_id ?? null}
          authUserId={auth?.user?.id ?? null}
          userRole={userRole}
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
          />
        )}
      </div>
    </div>
  );
}

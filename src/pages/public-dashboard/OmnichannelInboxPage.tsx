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
  FileText, ExternalLink, User, Link2, Unlink, GitMerge,
  Instagram, Facebook, Phone, X as XIcon, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

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
        {onAssume && myAgentId && !conv.assigned_agent_id && (
          <div className="mt-1" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="h-5 px-2 text-[10px]"
              onClick={() => onAssume(conv.id)}
            >
              Assumir
            </Button>
          </div>
        )}
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

// ─── ContactSheet modal ────────────────────────────────────────────────────────

interface OmniContact {
  id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  client_id: string | null;
}

interface OmniIdentity {
  id: string;
  channel_type: string;
  external_user_id: string;
  username: string | null;
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
  const [omniContactId, setOmniContactId] = useState<string | null>(null);
  const [contact, setContact]         = useState<OmniContact | null>(null);
  const [identities, setIdentities]   = useState<OmniIdentity[]>([]);

  // Section 1 form
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone]             = useState("");
  const [email, setEmail]             = useState("");
  const [saving, setSaving]           = useState(false);

  // Section 3 — client link
  const [linkedClientName, setLinkedClientName] = useState<string | null>(null);
  const [clientSearch, setClientSearch]         = useState("");
  const [clientResults, setClientResults]       = useState<Array<{ id: string; name: string }>>([]);
  const [linkingClient, setLinkingClient]       = useState(false);

  // Section 4 — merge
  const [mergeSearch, setMergeSearch]     = useState("");
  const [mergeResults, setMergeResults]   = useState<Array<{ id: string; display_name: string | null; phone: string | null }>>([]);
  const [mergeTarget, setMergeTarget]     = useState<{ id: string; display_name: string | null } | null>(null);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [merging, setMerging]             = useState(false);

  // ── Carregamento ────────────────────────────────────────────────────────────

  const loadContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      let resolvedId = contactId;

      // Try to find omni_contacts row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData } = await (supabase.rpc as any)('get_omni_contact_with_identities', {
        p_contact_id: resolvedId,
      });

      if (rpcData?.contact) {
        setOmniContactId(resolvedId);
        setContact(rpcData.contact as OmniContact);
        setIdentities((rpcData.identities ?? []) as OmniIdentity[]);
        setDisplayName(rpcData.contact.display_name ?? "");
        setPhone(rpcData.contact.phone ?? "");
        setEmail(rpcData.contact.email ?? "");
      } else {
        // Fallback: try to find-or-create omni record via tenant identity
        const { data: identityRow } = await supabase
          .from('client_contact_identities')
          .select('external_user_id, display_name')
          .eq('contact_id', contactId)
          .eq('channel_type', channelType ?? '')
          .limit(1)
          .maybeSingle();

        if (identityRow?.external_user_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: oid } = await (supabase.rpc as any)('upsert_omni_contact_identity', {
            p_organization_id: organizationId,
            p_channel_type: channelType,
            p_external_user_id: identityRow.external_user_id,
            p_display_name: identityRow.display_name ?? null,
          });
          if (oid) {
            resolvedId = oid as string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: rpcData2 } = await (supabase.rpc as any)('get_omni_contact_with_identities', {
              p_contact_id: resolvedId,
            });
            if (rpcData2?.contact) {
              setOmniContactId(resolvedId);
              setContact(rpcData2.contact as OmniContact);
              setIdentities((rpcData2.identities ?? []) as OmniIdentity[]);
              setDisplayName(rpcData2.contact.display_name ?? "");
              setPhone(rpcData2.contact.phone ?? "");
              setEmail(rpcData2.contact.email ?? "");
            }
          }
        } else {
          // No identity — show empty form
          setOmniContactId(null);
          setContact(null);
          setIdentities([]);
          setDisplayName("");
          setPhone("");
          setEmail("");
        }
      }

      // Load linked client name if applicable
      setLinkedClientName(null);
      // We'll set after contact is loaded
    } catch (err) {
      console.error('[ContactSheet] loadContact error:', err);
    } finally {
      setLoading(false);
    }
  }, [contactId, channelType, organizationId]);

  // Load linked client name when contact changes
  useEffect(() => {
    if (!contact?.client_id) { setLinkedClientName(null); return; }
    supabase
      .from('clients')
      .select('name')
      .eq('id', contact.client_id)
      .maybeSingle()
      .then(({ data }) => setLinkedClientName(data?.name ?? null));
  }, [contact?.client_id]);

  useEffect(() => {
    if (open) {
      setClientSearch("");
      setClientResults([]);
      setMergeSearch("");
      setMergeResults([]);
      setMergeTarget(null);
      loadContact();
    }
  }, [open, contactId, loadContact]);

  // ── Section 1: Save identification ─────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!omniContactId) {
        if (!organizationId || !channelType || !displayName) {
          toast.error("Preencha pelo menos o nome para criar o contato");
          return;
        }
        // Create via upsert using phone as external_user_id placeholder
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newId } = await (supabase.rpc as any)('upsert_omni_contact_identity', {
          p_organization_id: organizationId,
          p_channel_type: channelType,
          p_external_user_id: phone || `manual-${Date.now()}`,
          p_display_name: displayName,
        });
        if (newId) {
          await supabase
            .from('omni_contacts')
            .update({ display_name: displayName, phone, email })
            .eq('id', newId);
          setOmniContactId(newId as string);
        }
      } else {
        const { error } = await supabase
          .from('omni_contacts')
          .update({ display_name: displayName, phone, email })
          .eq('id', omniContactId);
        if (error) throw error;
      }
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

  // ── Section 2: Remove identity ─────────────────────────────────────────────

  const handleRemoveIdentity = async (identityId: string) => {
    const { error } = await supabase
      .from('omni_contact_identities')
      .delete()
      .eq('id', identityId);
    if (error) { toast.error("Erro ao remover canal"); return; }
    setIdentities((prev) => prev.filter((i) => i.id !== identityId));
    toast.success("Canal removido");
  };

  // ── Section 3: Client search & link ────────────────────────────────────────

  useEffect(() => {
    if (!clientSearch) { setClientResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('name', `%${clientSearch}%`)
        .limit(10);
      setClientResults((data ?? []) as Array<{ id: string; name: string }>);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  const handleLinkClient = async (selectedId: string, selectedName: string) => {
    if (!omniContactId) return;
    setLinkingClient(true);
    try {
      const { error } = await supabase
        .from('omni_contacts')
        .update({ client_id: selectedId })
        .eq('id', omniContactId);
      if (error) throw error;
      setLinkedClientName(selectedName);
      setContact((c) => c ? { ...c, client_id: selectedId } : c);
      setClientSearch("");
      setClientResults([]);
      toast.success("Vínculo criado");
    } catch {
      toast.error("Erro ao vincular cliente");
    } finally {
      setLinkingClient(false);
    }
  };

  const handleUnlinkClient = async () => {
    if (!omniContactId) return;
    const { error } = await supabase
      .from('omni_contacts')
      .update({ client_id: null })
      .eq('id', omniContactId);
    if (error) { toast.error("Erro ao desvincular"); return; }
    setLinkedClientName(null);
    setContact((c) => c ? { ...c, client_id: null } : c);
    toast.success("Vínculo removido");
  };

  // ── Section 4: Merge search ────────────────────────────────────────────────

  useEffect(() => {
    if (!mergeSearch || !omniContactId) { setMergeResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('omni_contacts')
        .select('id, display_name, phone')
        .ilike('display_name', `%${mergeSearch}%`)
        .neq('id', omniContactId)
        .limit(10);
      setMergeResults((data ?? []) as Array<{ id: string; display_name: string | null; phone: string | null }>);
    }, 300);
    return () => clearTimeout(timer);
  }, [mergeSearch, omniContactId]);

  const handleMergeConfirm = async () => {
    if (!mergeTarget || !omniContactId || !authUserId) return;
    setMerging(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('merge_omni_contacts', {
        p_winner_id: omniContactId,
        p_loser_id: mergeTarget.id,
        p_merged_by: authUserId,
      });
      if (error) throw error;
      toast.success("Cadastros unificados com sucesso");
      setMergeConfirmOpen(false);
      setMergeTarget(null);
      setMergeSearch("");
      setMergeResults([]);
      onContactChanged?.();
      await loadContact();
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
                      <div key={id.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ChannelIcon ch={id.channel_type} />
                          <span className="text-xs text-foreground truncate">
                            {id.username ?? id.external_user_id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveIdentity(id.id)}
                          className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remover canal"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Seção 3: Vínculo a cliente ──────────────────────────── */}
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vínculo ao cliente
                </p>
                {linkedClientName ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{linkedClientName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnlinkClient}
                      className="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                    >
                      <Unlink className="h-3 w-3" /> Desvincular
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Buscar cliente para vincular..."
                      className="h-8 text-xs"
                      disabled={!omniContactId}
                    />
                    {clientResults.length > 0 && (
                      <div className="rounded-md border border-border overflow-hidden">
                        {clientResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={linkingClient}
                            onClick={() => handleLinkClient(c.id, c.name)}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary/40 transition-colors border-b border-border last:border-0"
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {!omniContactId && (
                      <p className="text-[11px] text-muted-foreground italic">
                        Salve o contato primeiro para vincular
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Seção 4: Unificar cadastros ─────────────────────────── */}
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
                  disabled={!omniContactId}
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
                {!omniContactId && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Salve o contato primeiro para habilitar a unificação
                  </p>
                )}
              </section>

            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm merge dialog */}
      <Dialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <GitMerge className="h-4 w-4" /> Confirmar unificação
            </DialogTitle>
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
  onAssume?: (convId: string) => void;
  myAgentId?: string | null;
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
  onAssume,
  myAgentId,
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
  onResolve: () => void;
  onToggleBot: (active: boolean) => void;
  onBack?: () => void;
  onTransfer?: (agentId: string, reason?: string) => Promise<void>;
  clientId?: string | null;
  myAgentId?: string | null;
  organizationId?: string | null;
  authUserId?: string | null;
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
  onTransfer,
  clientId,
  myAgentId,
  organizationId,
  authUserId,
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
            onClick={handleOpenTransfer}
            disabled={!clientId}
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

      {/* Dialog de transferência */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir Conversa</DialogTitle>
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
    assignConversation,
    transferConversation,
  } = useOmnichannelInbox();

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
      else if (data) setMyAgentId(data);
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

  const handleAssume = useCallback(async (convId: string) => {
    if (!myAgentId) return;
    try {
      await assignConversation(convId, myAgentId);
      toast.success('Conversa assumida!');
    } catch {
      toast.error('Erro ao assumir conversa');
    }
  }, [myAgentId, assignConversation]);

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
          conversations={conversations}
          loading={conversationsLoading}
          activeId={activeConversationId}
          onSelect={setActiveConversation}
          unreadCount={unreadCount}
          filters={{ search: localSearch, channel: localChannel, status: localStatus }}
          onFilterChange={handleFilterChange}
          myStatus={myStatus}
          setMyStatus={setMyStatus}
          onAssume={handleAssume}
          myAgentId={myAgentId}
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
          onTransfer={handleTransfer}
          clientId={auth?.id ?? null}
          myAgentId={myAgentId}
          organizationId={auth?.organization_id ?? null}
          authUserId={auth?.user?.id ?? null}
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

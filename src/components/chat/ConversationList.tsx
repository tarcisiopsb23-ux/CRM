import { useState } from "react";
import { MessageSquarePlus, ChevronDown, ChevronRight, Archive, Users, MessageSquare, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChatConversation } from "@/types/chat";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: ChatConversation[];
  onSelect: (conv: ChatConversation) => void;
  onNewConversation: () => void;
}

function ConversationItem({
  conv,
  currentUserId,
  onSelect,
  archived = false,
}: {
  conv: ChatConversation;
  currentUserId: string;
  onSelect: (c: ChatConversation) => void;
  archived?: boolean;
}) {
  const otherParticipant =
    conv.type === "direct"
      ? conv.participants?.find((p) => p.user_id !== currentUserId)
      : null;

  const displayName =
    conv.type === "direct"
      ? otherParticipant?.profile?.full_name ?? "Usuário"
      : conv.name ?? "Grupo";

  const avatarUrl =
    conv.type === "direct" ? otherParticipant?.profile?.avatar_url ?? null : null;

  const initials = displayName.slice(0, 2).toUpperCase();

  const timeAgo = conv.updated_at
    ? formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true, locale: ptBR })
    : "";

  return (
    <button
      onClick={() => onSelect(conv)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left",
        archived && "opacity-60"
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        {archived && (
          <Archive className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-muted-foreground bg-background rounded-full" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">{displayName}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
        </div>
        {conv.last_message && (
          <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
        )}
      </div>
      {conv.unread_count > 0 && !archived && (
        <Badge className="h-5 min-w-[20px] px-1 text-[10px] shrink-0">
          {conv.unread_count > 99 ? "99+" : conv.unread_count}
        </Badge>
      )}
    </button>
  );
}

function Section({
  title,
  icon,
  items,
  currentUserId,
  onSelect,
  collapsible = false,
  archived = false,
}: {
  title: string;
  icon: React.ReactNode;
  items: ChatConversation[];
  currentUserId: string;
  onSelect: (c: ChatConversation) => void;
  collapsible?: boolean;
  archived?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible);

  if (items.length === 0 && !archived) return null;

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => collapsible && setCollapsed((v) => !v)}
        className={cn(
          "w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
          collapsible && "hover:text-foreground transition-colors"
        )}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {collapsible && (
          <>
            {items.length > 0 && (
              <span className="text-[10px] font-normal normal-case tracking-normal">
                {items.length}
              </span>
            )}
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </>
        )}
      </button>
      {!collapsed && (
        <>
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhuma conversa ainda.</p>
          ) : (
            items.map((c) => (
              <ConversationItem
                key={c.id}
                conv={c}
                currentUserId={currentUserId}
                onSelect={onSelect}
                archived={archived}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

export function ConversationList({ conversations, onSelect, onNewConversation }: ConversationListProps) {
  const { profile } = useAuth();
  const currentUserId = profile?.id ?? "";

  const general = conversations.filter((c) => c.type === "general" && !c.is_archived);
  const teams = conversations.filter((c) => c.type === "group" && !c.is_archived);
  const directs = conversations.filter((c) => c.type === "direct" && !c.is_archived);
  const archived = conversations.filter((c) => c.is_archived);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Mensagens</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewConversation} title="Nova conversa">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-3">
        <Section
          title="Geral"
          icon={<Globe className="h-3 w-3" />}
          items={general}
          currentUserId={currentUserId}
          onSelect={onSelect}
        />
        <Section
          title="Equipes"
          icon={<Users className="h-3 w-3" />}
          items={teams}
          currentUserId={currentUserId}
          onSelect={onSelect}
        />
        <Section
          title="Diretas"
          icon={<MessageSquare className="h-3 w-3" />}
          items={directs}
          currentUserId={currentUserId}
          onSelect={onSelect}
        />
        {archived.length > 0 && (
          <Section
            title="Arquivadas"
            icon={<Archive className="h-3 w-3" />}
            items={archived}
            currentUserId={currentUserId}
            onSelect={onSelect}
            collapsible
            archived
          />
        )}
      </div>
    </div>
  );
}

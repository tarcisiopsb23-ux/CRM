import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Trash2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChatConversation, ChatMessage } from "@/types/chat";
import { ParticipantsList } from "./ParticipantsList";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface MessageThreadProps {
  conversation: ChatConversation;
  messages: ChatMessage[];
  currentUserId: string;
  hasMoreMessages: boolean;
  onLoadMore: () => Promise<void>;
  onAddMember?: (userId: string) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
  onArchive?: () => Promise<void>;
  onUnarchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function MessageThread({
  conversation,
  messages,
  currentUserId,
  hasMoreMessages,
  onLoadMore,
  onAddMember,
  onRemoveMember,
  onArchive,
  onUnarchive,
  onDelete,
}: MessageThreadProps) {
  const { profile } = useAuth();
  const canDelete = ["owner", "admin", "manager"].includes(profile?.role ?? "");
  const isGroup = conversation.type === "group" || conversation.type === "general";

  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const isFirstRender = useRef(true);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isFirstRender.current) {
      bottomRef.current?.scrollIntoView();
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // IntersectionObserver for load more
  useEffect(() => {
    if (!hasMoreMessages) return;
    const el = topRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting && !loadingMore) {
          setLoadingMore(true);
          await onLoadMore();
          setLoadingMore(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreMessages, loadingMore, onLoadMore]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Group participants button */}
      {isGroup && (
        <div className="flex items-center justify-between px-3 py-1 border-b">
          <button
            onClick={() => setShowParticipants((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            {conversation.participants?.length ?? 0} participantes
          </button>
          <div className="flex items-center gap-1">
            {conversation.is_archived ? (
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onUnarchive}>
                <ArchiveRestore className="h-3.5 w-3.5" />
                Desarquivar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={onArchive}>
                <Archive className="h-3.5 w-3.5" />
                Arquivar
              </Button>
            )}
            {canDelete && conversation.type !== "general" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => {
                  if (window.confirm("Excluir este grupo permanentemente? Esta ação não pode ser desfeita.")) {
                    onDelete?.();
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Archive button for direct conversations */}
      {!isGroup && (
        <div className="flex justify-end px-3 py-1 border-b">
          {conversation.is_archived ? (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onUnarchive}>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Desarquivar
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={onArchive}>
              <Archive className="h-3.5 w-3.5" />
              Arquivar
            </Button>
          )}
        </div>
      )}

      {/* Archived banner */}
      {conversation.is_archived && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <Archive className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Esta conversa está arquivada. Nenhuma nova mensagem pode ser enviada.
          </p>
        </div>
      )}

      {/* Participants panel */}
      {showParticipants && isGroup && (
        <div className="border-b bg-muted/30 max-h-48 overflow-y-auto">
          <ParticipantsList
            conversation={conversation}
            currentUserId={currentUserId}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <div ref={topRef} className="h-1" />
        {loadingMore && (
          <p className="text-center text-xs text-muted-foreground">Carregando...</p>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={cn("flex gap-2", isOwn ? "flex-row-reverse" : "flex-row")}
            >
              {!isOwn && (
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarImage src={msg.sender?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">
                    {(msg.sender?.full_name ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn("max-w-[75%] space-y-0.5", isOwn ? "items-end" : "items-start")}>
                {isGroup && !isOwn && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    {msg.sender?.full_name ?? "Usuário"}
                  </p>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm break-words",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted rounded-tl-sm"
                  )}
                >
                  {msg.content}
                </div>
                <p className={cn("text-[10px] text-muted-foreground px-1", isOwn ? "text-right" : "text-left")}>
                  {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          );
        })}

        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">
            Nenhuma mensagem ainda. Seja o primeiro a escrever!
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

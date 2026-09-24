import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import type { ChatConversation } from "@/types/chat";

interface ParticipantsListProps {
  conversation: ChatConversation;
  currentUserId: string;
  onAddMember?: (userId: string) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
}

export function ParticipantsList({
  conversation,
  currentUserId,
  onAddMember,
  onRemoveMember,
}: ParticipantsListProps) {
  const organizationId = useOrganization();
  const { data: allProfiles = [] } = useProfiles(organizationId);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const isLinked = conversation.linked_to !== null;
  const currentParticipant = conversation.participants?.find((p) => p.user_id === currentUserId);
  const isOwner = currentParticipant?.role === "owner";
  const canManage = isOwner && !isLinked;

  const participantIds = new Set(conversation.participants?.map((p) => p.user_id) ?? []);
  const available = allProfiles.filter(
    (p) => !participantIds.has(p.id) && p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const linkedBadge = conversation.linked_to === "team" ? "Equipe" : conversation.linked_to === "project" ? "Projeto" : null;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Participantes
        </p>
        {linkedBadge && (
          <Badge variant="secondary" className="text-[10px]">{linkedBadge}</Badge>
        )}
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setShowAdd((v) => !v)}
          >
            <UserPlus className="h-3 w-3" />
            Adicionar
          </Button>
        )}
      </div>

      {showAdd && canManage && (
        <div className="space-y-1">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {available.map((p) => (
              <button
                key={p.id}
                onClick={async () => {
                  await onAddMember?.(p.id);
                  setSearch("");
                  setShowAdd(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left text-xs"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[9px]">{p.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{p.full_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {(conversation.participants ?? []).map((p) => (
          <div key={p.user_id} className="flex items-center gap-2 group">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={p.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {(p.profile?.full_name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 text-xs truncate">{p.profile?.full_name ?? p.user_id}</span>
            {p.role === "owner" && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">Admin</Badge>
            )}
            {canManage && p.user_id !== currentUserId && (
              <button
                onClick={() => onRemoveMember?.(p.user_id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

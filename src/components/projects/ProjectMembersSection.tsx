import { useState } from "react";
import { UserPlus, X, Users, User, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useProjectMembers } from "@/hooks/useProjectMembers";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { useIntegration } from "@/hooks/useSettings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { N8nConfig } from "@/types/settings";
import { ClickupMembersModal } from "./ClickupMembersModal";

interface ProjectMembersSectionProps {
  projectId: string;
  assignedTo?: string | null;
  teamId?: string | null;
  assignedToName?: string | null;
  teamName?: string | null;
  clickupListId?: string | null;
  clickupWebhookUrl?: string | null;
  clickupMembersWebhookUrl?: string | null;
  projectTitle?: string;
}

export function ProjectMembersSection({
  projectId,
  assignedTo,
  teamId,
  assignedToName,
  teamName,
  clickupListId,
  clickupWebhookUrl,
  clickupMembersWebhookUrl,
  projectTitle = "Projeto",
}: ProjectMembersSectionProps) {
  const { profile } = useAuth();
  const organizationId = useOrganization();
  const { members, loading, addMember, removeMember } = useProjectMembers(projectId);
  const { data: allProfiles = [] } = useProfiles(organizationId);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [invitingClickup, setInvitingClickup] = useState(false);
  const [clickupModalOpen, setClickupModalOpen] = useState(false);

  const canManage = ["owner", "admin"].includes(profile?.role ?? "");

  const handleInviteToClickup = async () => {
    if (!clickupWebhookUrl) {
      toast.error("Configure o Webhook ClickUp nas Configurações → n8n → ClickUp.");
      return;
    }
    setInvitingClickup(true);
    try {
      const participants = members.map(m => ({
        profile_id: m.profile_id,
        name: m.profile?.full_name ?? "",
        email: (m.profile as any)?.email ?? null,
        role: m.role,
      }));
      await fetch(clickupWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite_members",
          table: "projects",
          item: { id: projectId, clickup_list_id: clickupListId },
          participants,
        }),
      });
      toast.success("Convites enviados para o ClickUp!");
    } catch {
      toast.error("Erro ao enviar convites.");
    } finally {
      setInvitingClickup(false);
    }
  };

  const memberIds = new Set(members.map((m) => m.profile_id));
  const available = allProfiles.filter(
    (p) =>
      !memberIds.has(p.id) &&
      p.id !== assignedTo &&
      p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (profileId: string, name: string) => {
    try {
      await addMember(profileId);
      toast.success(`${name} adicionado ao projeto`);
      setSearch("");
      setAddOpen(false);
    } catch {
      toast.error("Erro ao adicionar participante");
    }
  };

  const handleRemove = async (profileId: string, name: string) => {
    try {
      await removeMember(profileId);
      toast.success(`${name} removido do projeto`);
    } catch {
      toast.error("Erro ao remover participante");
    }
  };

  return (
    <>
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Participantes
        </h4>
        <div className="flex items-center gap-1">
          {(clickupListId || clickupMembersWebhookUrl) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-emerald-600 hover:text-emerald-700"
              onClick={() => setClickupModalOpen(true)}
              title="Gerenciar participantes no ClickUp"
            >
              <Send className="h-3.5 w-3.5" />
              ClickUp
            </Button>
          )}          {canManage && (
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1">
                  <UserPlus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <Input
                placeholder="Buscar colaborador..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-2 h-8 text-sm"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {available.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nenhum colaborador disponível
                  </p>
                ) : (
                  available.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAdd(p.id, p.full_name)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-sm"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={p.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {p.full_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate">{p.full_name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.role}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          )}
        </div>
      </div>

      {/* Participantes especiais */}
      {(assignedTo || teamId) && (
        <div className="space-y-1.5">
          {assignedTo && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{assignedToName ?? "Responsável"}</span>
              <Badge variant="secondary" className="text-[10px] h-4">Responsável</Badge>
            </div>
          )}
          {teamId && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{teamName ?? "Equipe"}</span>
              <Badge variant="secondary" className="text-[10px] h-4">Equipe</Badge>
            </div>
          )}
        </div>
      )}

      {/* Lista de membros */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhum participante adicionado.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.profile_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {(m.profile?.full_name ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{m.profile?.full_name ?? m.profile_id}</p>
                <p className="text-[10px] text-muted-foreground">
                  Desde {format(new Date(m.joined_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => handleRemove(m.profile_id, m.profile?.full_name ?? "")}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                  title="Remover participante"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Modal de participantes ClickUp */}
    <ClickupMembersModal
      open={clickupModalOpen}
      onOpenChange={setClickupModalOpen}
      projectId={projectId}
      projectTitle={projectTitle}
      clickupId={clickupListId ?? null}
      clickupType="project"
      webhookUrl={clickupMembersWebhookUrl ?? null}
    />
    </>
  );
}

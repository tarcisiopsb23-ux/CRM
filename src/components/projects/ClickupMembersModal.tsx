import { useState } from "react";
import { X, Trash2, UserPlus, ExternalLink, Loader2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectMembers } from "@/hooks/useProjectMembers";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

interface ClickupMembersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle: string;
  clickupId: string | null;       // list_id (projeto) ou task_id (tarefa)
  clickupType: "project" | "task";
  clickupUrl?: string | null;     // link direto no ClickUp
  webhookUrl: string | null;
}

interface ClickupMember {
  profile_id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: string;
  clickup_user_id?: string | null; // preenchido após convite
}

export function ClickupMembersModal({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  clickupId,
  clickupType,
  clickupUrl,
  webhookUrl,
}: ClickupMembersModalProps) {
  const organizationId = useOrganization();
  const { members } = useProjectMembers(projectId);
  const { data: allProfiles = [] } = useProfiles(organizationId);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null); // profile_id sendo processado

  // Participantes já no projeto (Maestria)
  const memberIds = new Set(members.map(m => m.profile_id));

  // Perfis disponíveis para adicionar
  const available = allProfiles.filter(
    p => !memberIds.has(p.id) && p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const fireWebhook = async (action: "invite" | "remove", profile: { id: string; full_name: string; email: string; avatar_url?: string | null }) => {
    if (!webhookUrl) {
      toast.error("Configure o Webhook de Participantes ClickUp nas Configurações → n8n → ClickUp.");
      return false;
    }
    if (!clickupId) {
      toast.error("Este projeto/tarefa ainda não foi criado no ClickUp.");
      return false;
    }
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          clickup_type: clickupType,
          clickup_id: clickupId,
          project_id: projectId,
          participant: {
            profile_id: profile.id,
            name: profile.full_name,
            email: profile.email,
            avatar_url: profile.avatar_url ?? null,
          },
        }),
      });
      return true;
    } catch {
      toast.error("Erro ao comunicar com o n8n.");
      return false;
    }
  };

  const handleInvite = async (profile: { id: string; full_name: string; email: string; avatar_url?: string | null }) => {
    setLoading(profile.id);
    const ok = await fireWebhook("invite", profile);
    if (ok) toast.success(`${profile.full_name} convidado no ClickUp!`);
    setLoading(null);
    setSearch("");
    setAddOpen(false);
  };

  const handleRemove = async (member: { profile_id: string; profile?: { full_name?: string; email?: string; avatar_url?: string | null } | null }) => {
    setLoading(member.profile_id);
    const profile = {
      id: member.profile_id,
      full_name: member.profile?.full_name ?? "",
      email: (member.profile as any)?.email ?? "",
      avatar_url: member.profile?.avatar_url ?? null,
    };
    const ok = await fireWebhook("remove", profile);
    if (ok) toast.success(`${profile.full_name} removido do ClickUp!`);
    setLoading(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Participantes no ClickUp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info do projeto/tarefa */}
          <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
            <p className="text-sm font-medium">{projectTitle}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {clickupType === "project" ? "Lista" : "Task"} no ClickUp
              </Badge>
              {clickupId ? (
                <span className="font-mono text-[10px]">ID: {clickupId}</span>
              ) : (
                <span className="text-amber-600">Não criado no ClickUp ainda</span>
              )}
              {clickupUrl && (
                <a
                  href={clickupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir no ClickUp
                </a>
              )}
            </div>
          </div>

          {/* Cabeçalho lista + botão adicionar */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Participantes do projeto ({members.length})</p>
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1" disabled={!clickupId}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Convidar
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
                      {search ? "Nenhum resultado" : "Todos já são participantes"}
                    </p>
                  ) : (
                    available.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleInvite({ id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url })}
                        disabled={loading === p.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-sm"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={p.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">{p.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm">{p.full_name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{p.email}</p>
                        </div>
                        {loading === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Lista de participantes */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                Nenhum participante no projeto.
              </p>
            ) : (
              members.map(m => (
                <div key={m.profile_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {(m.profile?.full_name ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{m.profile?.full_name ?? m.profile_id}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{(m.profile as any)?.email ?? ""}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{m.role}</Badge>
                  <button
                    onClick={() => handleRemove(m)}
                    disabled={loading === m.profile_id || !clickupId}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    title="Remover do ClickUp"
                  >
                    {loading === m.profile_id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              ))
            )}
          </div>

          {!clickupId && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
              Crie este {clickupType === "project" ? "projeto" : "tarefa"} no ClickUp primeiro para gerenciar participantes.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

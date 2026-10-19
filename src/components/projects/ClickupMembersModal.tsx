import { useState } from "react";
import { Trash2, UserPlus, ExternalLink, Loader2, Users, Mail, CheckCircle2, Clock, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfiles } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ClickupMembersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle: string;
  clickupId: string | null;
  clickupType: "project" | "task";
  taskId?: string | null;
  clickupUrl?: string | null;
  webhookUrl?: string | null; // mantido na interface mas não usado
}

type ParticipantStatus = "pending" | "active";

interface ClickupParticipant {
  id: string;
  profile_id: string | null;
  name: string;
  email: string;
  external: boolean;
  status: ParticipantStatus;
  invited_at: string;
}

function StatusBadge({ status, onChange }: { status: ParticipantStatus; onChange: (s: ParticipantStatus) => void }) {
  return (
    <Select value={status} onValueChange={(v) => onChange(v as ParticipantStatus)}>
      <SelectTrigger className="h-6 w-auto border-0 bg-transparent p-0 gap-1 focus:ring-0 text-[10px] font-medium">
        <SelectValue>
          {status === "active" ? (
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Vinculado
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-700">
              <Clock className="h-3 w-3" /> Pendente
            </span>
          )}
        </SelectValue>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pending">
          <span className="flex items-center gap-1.5 text-amber-700">
            <Clock className="h-3.5 w-3.5" /> Pendente
          </span>
        </SelectItem>
        <SelectItem value="active">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Vinculado
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ClickupMembersModal({
  open,
  onOpenChange,
  projectId,
  projectTitle,
  clickupId,
  clickupType,
  taskId,
  clickupUrl,
}: ClickupMembersModalProps) {
  const organizationId = useOrganization();
  const qc = useQueryClient();
  const { data: allProfiles = [] } = useProfiles(organizationId);

  // Busca de colaborador do sistema
  const [profileSearch, setProfileSearch] = useState("");
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);

  // Formulário de e-mail externo
  const [externalEmail, setExternalEmail] = useState("");
  const [externalName, setExternalName] = useState("");
  const [addingExternal, setAddingExternal] = useState(false);

  const [savingId, setSavingId] = useState<string | null>(null);

  const queryKey = ["clickup_participants", projectId, taskId ?? "project"];

  // Busca participantes do banco
  const { data: participants = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!organizationId) return [] as ClickupParticipant[];
      let q = supabase
        .from("clickup_participants")
        .select("id, profile_id, name, email, external, status, invited_at")
        .eq("project_id", projectId)
        .order("invited_at", { ascending: true });
      if (taskId) {
        q = q.eq("task_id", taskId);
      } else {
        q = q.is("task_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClickupParticipant[];
    },
    enabled: open && !!organizationId,
  });

  const participantEmails = new Set(participants.map(p => p.email));

  const availableProfiles = allProfiles.filter(
    p => !participantEmails.has(p.email) && (
      p.full_name.toLowerCase().includes(profileSearch.toLowerCase()) ||
      p.email?.toLowerCase().includes(profileSearch.toLowerCase())
    )
  );

  const addParticipant = async (data: { profile_id: string | null; name: string; email: string; external: boolean }) => {
    if (!organizationId) return;
    if (participantEmails.has(data.email)) {
      toast.error("Este e-mail já está na lista.");
      return;
    }
    const { error } = await supabase.from("clickup_participants").insert({
      organization_id: organizationId,
      project_id: projectId,
      task_id: taskId ?? null,
      clickup_id: clickupId ?? "",
      clickup_type: clickupType,
      profile_id: data.profile_id,
      name: data.name,
      email: data.email,
      external: data.external,
      status: "pending",
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey });
  };

  const handleAddProfile = async (profile: { id: string; full_name: string; email: string; avatar_url?: string | null }) => {
    try {
      await addParticipant({ profile_id: profile.id, name: profile.full_name, email: profile.email, external: false });
      toast.success(`${profile.full_name} adicionado.`);
      setProfileSearch("");
      setProfilePopoverOpen(false);
    } catch {
      toast.error("Erro ao adicionar participante.");
    }
  };

  const handleAddExternal = async () => {
    const email = externalEmail.trim();
    const name = externalName.trim() || email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setAddingExternal(true);
    try {
      await addParticipant({ profile_id: null, name, email, external: true });
      toast.success(`${email} adicionado.`);
      setExternalEmail("");
      setExternalName("");
    } catch {
      toast.error("Erro ao adicionar participante.");
    } finally {
      setAddingExternal(false);
    }
  };

  const handleStatusChange = async (id: string, status: ParticipantStatus) => {
    setSavingId(id);
    try {
      const { error } = await supabase.from("clickup_participants").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey });
    } catch {
      toast.error("Erro ao atualizar status.");
    } finally {
      setSavingId(null);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    setSavingId(id);
    try {
      const { error } = await supabase.from("clickup_participants").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey });
      toast.success(`${name} removido.`);
    } catch {
      toast.error("Erro ao remover participante.");
    } finally {
      setSavingId(null);
    }
  };

  const activeCount  = participants.filter(p => p.status === "active").length;
  const pendingCount = participants.filter(p => p.status === "pending").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Participantes ClickUp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info */}
          <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
            <p className="text-sm font-medium">{projectTitle}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                {clickupType === "project" ? "Lista" : "Task"} no ClickUp
              </Badge>
              {clickupId
                ? <span className="font-mono text-[10px]">ID: {clickupId}</span>
                : <span className="text-amber-600">Sem ID ClickUp</span>
              }
              {clickupUrl && (
                <a href={clickupUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Abrir no ClickUp
                </a>
              )}
              {participants.length > 0 && (
                <span className="text-[10px]">
                  <span className="text-emerald-600 font-medium">{activeCount} vinculado(s)</span>
                  {pendingCount > 0 && <span className="text-amber-600 font-medium"> · {pendingCount} pendente(s)</span>}
                </span>
              )}
            </div>
          </div>

          {/* Ações de adição */}
          <div className="flex items-center gap-2">
            {/* Adicionar colaborador do sistema */}
            <Popover open={profilePopoverOpen} onOpenChange={setProfilePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8">
                  <UserPlus className="h-3.5 w-3.5" /> Colaborador
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <Input
                  placeholder="Buscar por nome ou e-mail..."
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  className="mb-2 h-8 text-sm"
                  autoFocus
                />
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {availableProfiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {profileSearch ? "Nenhum resultado" : "Todos os colaboradores já foram adicionados"}
                    </p>
                  ) : (
                    availableProfiles.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleAddProfile({ id: p.id, full_name: p.full_name, email: p.email, avatar_url: p.avatar_url })}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={p.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">{p.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{p.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Adicionar e-mail externo inline */}
            <div className="flex-1 flex items-center gap-1.5">
              <Input
                type="email"
                placeholder="e-mail externo..."
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddExternal(); }}
                className="h-8 text-sm flex-1"
              />
              <Input
                placeholder="nome (opcional)"
                value={externalName}
                onChange={(e) => setExternalName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddExternal(); }}
                className="h-8 text-sm w-32"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 shrink-0"
                onClick={handleAddExternal}
                disabled={!externalEmail.trim() || addingExternal}
                title="Adicionar e-mail externo"
              >
                {addingExternal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Lista de participantes */}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : participants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <Users className="h-8 w-8 opacity-20" />
                <p className="text-sm">Nenhum participante adicionado.</p>
                <p className="text-xs">Use os campos acima para adicionar colaboradores ou e-mails externos.</p>
              </div>
            ) : (
              participants.map(p => {
                const profile = p.profile_id ? allProfiles.find(pr => pr.id === p.profile_id) : null;
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-muted/20 group">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px] bg-muted">
                        {p.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.external && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">externo</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {savingId === p.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        : <StatusBadge status={p.status as ParticipantStatus} onChange={(s) => handleStatusChange(p.id, s)} />
                      }
                      <button
                        onClick={() => handleRemove(p.id, p.name)}
                        disabled={savingId === p.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 ml-1"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

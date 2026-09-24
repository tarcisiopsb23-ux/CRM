import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { TeamRow } from "@/hooks/useTeams";
import type { TeamMemberRow } from "@/hooks/useTeams";
import type { ProfileRow } from "@/hooks/useProfiles";
import { MessageSquare, MessageSquarePlus, Plus, Pencil, Trash2, UserPlus, UserMinus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useChatContext } from "@/contexts/ChatContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface Props {
  teams: TeamRow[];
  profiles: ProfileRow[];
  members: TeamMemberRow[];
  onCreate: (input: { name: string; type: 'comercial' | 'operacional'; is_portfolio: boolean }) => void;
  onUpdate: (id: string, input: { name: string; type: 'comercial' | 'operacional'; is_portfolio: boolean }) => void;
  onDelete: (id: string) => void;
  onAddMember?: (teamId: string, profileId: string) => void;
  onRemoveMember?: (teamId: string, profileId: string) => void;
  loading?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManageMembers?: boolean;
}

// ── Team Chat Button ─────────────────────────────────────────────────────────
function TeamChatButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const chat = useChatContext();
  const [loading, setLoading] = useState(false);
  const [localConvId, setLocalConvId] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_team_chat_group", { p_team_id: teamId });
      if (error) throw error;
      const convId = data as string;
      setLocalConvId(convId);
      toast.success("Grupo de chat da equipe criado!");
      chat.openConversationById(convId);
    } catch (err) {
      logger.error("Erro ao criar grupo de chat", { 
        error: err instanceof Error ? err.message : "Erro desconhecido",
        teamId 
      }, 'TEAM');
      toast.error("Erro ao criar grupo de chat");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    if (localConvId) chat.openConversationById(localConvId);
  };

  if (localConvId) {
    return (
      <Button variant="ghost" size="icon" title="Abrir chat da equipe" onClick={handleOpen}>
        <MessageSquare className="h-4 w-4 text-primary" />
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="icon" title="Criar grupo de chat" onClick={handleCreate} disabled={loading}>
      <MessageSquarePlus className="h-4 w-4" />
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function TeamListSupabase({
  teams,
  profiles,
  members,
  onCreate,
  onUpdate,
  onDelete,
  onAddMember,
  onRemoveMember,
  loading,
  canCreate,
  canEdit,
  canDelete,
  canManageMembers,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<'comercial' | 'operacional'>('operacional');
  const [isPortfolio, setIsPortfolio] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [memberModal, setMemberModal] = useState<TeamRow | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string>("");

  const allowCreate = canCreate ?? true;
  const allowEdit = canEdit ?? true;
  const allowDelete = canDelete ?? true;
  const allowManageMembers = canManageMembers ?? true;

  const openNew = () => {
    if (!allowCreate) return;
    setEditing(null);
    setName("");
    setType('operacional');
    setIsPortfolio(false);
    setLeadId(null);
    setFormOpen(true);
  };
  const openEdit = (t: TeamRow) => {
    if (!allowEdit) return;
    setEditing(t);
    setName(t.name);
    setType(t.type);
    setIsPortfolio(t.is_portfolio);
    setLeadId(t.lead_id || null);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (editing && !allowEdit) return;
    if (!editing && !allowCreate) return;
    if (!name.trim()) return;
    
    const payload = { 
      name: name.trim(), 
      type, 
      is_portfolio: type === 'comercial' ? isPortfolio : false,
      lead_id: leadId
    };

    if (editing) {
      onUpdate(editing.id, payload);
    } else {
      onCreate(payload);
    }
    setFormOpen(false);
  };

  const teamMembers = (teamId: string) =>
    members.filter((m) => m.team_id === teamId).map((m) => profiles.find((p) => p.id === m.profile_id)).filter(Boolean) as ProfileRow[];

  const profilesNotInAnyTeam = useMemo(() => {
    const membersSet = new Set(members.map((m) => m.profile_id));
    return profiles.filter((p) => !membersSet.has(p.id));
  }, [profiles, members]);

  const profilesNotInThisTeam = (teamId: string) => {
    const inThisTeam = new Set(members.filter((m) => m.team_id === teamId).map((m) => m.profile_id));
    // Regra: se o colaborador já estiver em QUALQUER outra equipe, ele não pode ser selecionado
    const inOtherTeams = new Set(members.filter((m) => m.team_id !== teamId).map((m) => m.profile_id));
    return profiles.filter((p) => !inThisTeam.has(p.id) && !inOtherTeams.has(p.id));
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando equipes...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{teams.length} equipes cadastradas</p>
        <Button onClick={openNew} size="sm" disabled={!allowCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nova equipe
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => {
          const mems = teamMembers(team.id);
          return (
            <Card key={team.id}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-foreground">{team.name}</h3>
                    <div className="flex gap-1.5">
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {team.type}
                      </Badge>
                      {team.is_portfolio && (
                        <Badge className="text-[10px] uppercase bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">
                          Carteira
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <TeamChatButton teamId={team.id} teamName={team.name} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(team)} disabled={!allowEdit}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(team.id)} disabled={!allowDelete}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {onAddMember && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMemberModal(team)}
                        disabled={!allowManageMembers}
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {mems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem membros</p>
                  ) : (
                    mems.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span>{p.full_name}</span>
                        {onRemoveMember && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onRemoveMember(team.id, p.id)}
                            disabled={!allowManageMembers}
                          >
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {formOpen ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <CardTitle className="text-base">{editing ? "Editar equipe" : "Nova equipe"}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial" />
              </div>
              <div>
                <Label>Tipo de Equipe</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operacional">Operacional</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Responsável pela Equipe</Label>
                <Select value={leadId || "none"} onValueChange={(v) => setLeadId(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum responsável</SelectItem>
                    {profiles
                      .filter(p => {
                        // 1. Filtrar por role (admin/owner)
                        const isAdminOrOwner = p.role === 'admin' || p.role === 'owner';
                        if (!isAdminOrOwner) return false;

                        // 2. Regra: se o colaborador já estiver em OUTRA equipe (como membro ou líder), não pode ser selecionado
                        // (Permitir se for da equipe que estamos editando no momento)
                        const isInOtherTeam = members.some(m => m.profile_id === p.id && m.team_id !== editing?.id);
                        if (isInOtherTeam) return false;

                        return true;
                      })
                      .map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4 border-l pl-6">
              {type === 'comercial' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Gerenciar Carteira</Label>
                      <p className="text-[10px] text-muted-foreground">Esta equipe gerencia uma carteira de clientes.</p>
                    </div>
                    <Switch 
                      checked={isPortfolio} 
                      onCheckedChange={setIsPortfolio}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground text-center italic">
                    Equipes operacionais não podem ser vinculadas a carteiras de clientes.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {memberModal && onAddMember && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <CardTitle className="text-base">Adicionar membro — {memberModal.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMemberModal(null)}>
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (selectedProfile && selectedProfile !== "__none__") {
                    onAddMember(memberModal.id, selectedProfile);
                    setSelectedProfile("");
                    setMemberModal(null);
                  }
                }}
                disabled={!allowManageMembers || !selectedProfile || selectedProfile === "__none__"}
              >
                Adicionar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Colaborador</Label>
              <Select
                value={selectedProfile || "__none__"}
                onValueChange={(v) => setSelectedProfile(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione um colaborador</SelectItem>
                  {profilesNotInThisTeam(memberModal.id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

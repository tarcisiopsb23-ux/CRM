import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { TeamRow } from "@/hooks/useTeams";
import type { TeamMemberRow } from "@/hooks/useTeams";
import type { ProfileRow } from "@/hooks/useProfiles";
import { Plus, Pencil, Trash2, UserPlus, UserMinus } from "lucide-react";

interface Props {
  teams: TeamRow[];
  profiles: ProfileRow[];
  members: TeamMemberRow[];
  onCreate: (name: string) => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAddMember?: (teamId: string, profileId: string) => void;
  onRemoveMember?: (teamId: string, profileId: string) => void;
  loading?: boolean;
}

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
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [name, setName] = useState("");
  const [memberModal, setMemberModal] = useState<TeamRow | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string>("");

  const openNew = () => {
    setEditing(null);
    setName("");
    setFormOpen(true);
  };
  const openEdit = (t: TeamRow) => {
    setEditing(t);
    setName(t.name);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editing) {
      onUpdate(editing.id, name.trim());
    } else {
      onCreate(name.trim());
    }
    setFormOpen(false);
  };

  const teamMembers = (teamId: string) =>
    members.filter((m) => m.team_id === teamId).map((m) => profiles.find((p) => p.id === m.profile_id)).filter(Boolean) as ProfileRow[];

  const profilesNotInTeam = (teamId: string) => {
    const inTeam = new Set(members.filter((m) => m.team_id === teamId).map((m) => m.profile_id));
    return profiles.filter((p) => !inTeam.has(p.id));
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando equipes...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{teams.length} equipes cadastradas</p>
        <Button onClick={openNew} size="sm">
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
                  <h3 className="font-display font-semibold text-foreground">{team.name}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(team)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(team.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {onAddMember && (
                      <Button variant="ghost" size="icon" onClick={() => setMemberModal(team)}>
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar equipe" : "Nova equipe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {memberModal && onAddMember && (
        <Dialog open={!!memberModal} onOpenChange={() => setMemberModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar membro a {memberModal.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                    {profilesNotInTeam(memberModal.id).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMemberModal(null)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (selectedProfile && selectedProfile !== "__none__") {
                    onAddMember(memberModal.id, selectedProfile);
                    setSelectedProfile("");
                    setMemberModal(null);
                  }
                }}
                disabled={!selectedProfile || selectedProfile === "__none__"}
              >
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

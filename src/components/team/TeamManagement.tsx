import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Team, Employee } from "./types";
import { Plus, Pencil, Trash2, UserPlus, UserMinus, Users } from "lucide-react";

interface Props {
  teams: Team[];
  employees: Employee[];
  onTeamsUpdate: (teams: Team[]) => void;
  onEmployeesUpdate: (employees: Employee[]) => void;
}

export function TeamManagement({ teams, employees, onTeamsUpdate, onEmployeesUpdate }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [memberModal, setMemberModal] = useState<Team | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const openNew = () => { setEditingTeam(null); setTeamName(""); setFormOpen(true); };
  const openEdit = (t: Team) => { setEditingTeam(t); setTeamName(t.name); setFormOpen(true); };

  const handleSave = () => {
    if (!teamName.trim()) return;
    if (editingTeam) {
      const updated = teams.map((t) => t.id === editingTeam.id ? { ...t, name: teamName } : t);
      onTeamsUpdate(updated);
      onEmployeesUpdate(employees.map((e) => e.teamId === editingTeam.id ? { ...e, teamName: teamName } : e));
    } else {
      onTeamsUpdate([...teams, { id: crypto.randomUUID(), name: teamName }]);
    }
    setFormOpen(false);
  };

  const handleDelete = (id: string) => {
    onTeamsUpdate(teams.filter((t) => t.id !== id));
    onEmployeesUpdate(employees.map((e) => e.teamId === id ? { ...e, teamId: "", teamName: "" } : e));
  };

  const teamMembers = (teamId: string) => employees.filter((e) => e.teamId === teamId);
  const unassigned = employees.filter((e) => !e.teamId || !teams.some((t) => t.id === e.teamId));

  const addMember = () => {
    if (!memberModal || !selectedEmployee) return;
    onEmployeesUpdate(employees.map((e) =>
      e.id === selectedEmployee ? { ...e, teamId: memberModal.id, teamName: memberModal.name } : e
    ));
    setSelectedEmployee("");
  };

  const removeMember = (empId: string) => {
    onEmployeesUpdate(employees.map((e) => e.id === empId ? { ...e, teamId: "", teamName: "" } : e));
  };

  const availableForTeam = memberModal
    ? employees.filter((e) => e.teamId !== memberModal.id)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{teams.length} equipes cadastradas</p>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova equipe</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => {
          const members = teamMembers(team.id);
          return (
            <Card key={team.id}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-foreground">{team.name}</h3>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setMemberModal(team)}>
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(team)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(team.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Badge variant="secondary">{members.length} integrantes</Badge>
                <div className="mt-3 space-y-1">
                  {members.slice(0, 5).map((m) => (
                    <p key={m.id} className="text-sm text-muted-foreground">{m.displayName} — {m.role}</p>
                  ))}
                  {members.length > 5 && <p className="text-xs text-muted-foreground">+{members.length - 5} mais</p>}
                  {members.length === 0 && <p className="text-xs text-muted-foreground italic">Sem integrantes</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit team dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{editingTeam ? "Editar Equipe" : "Nova Equipe"}</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">Nome da equipe</Label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ex: Marketing Digital" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingTeam ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage members dialog */}
      {memberModal && (
        <Dialog open onOpenChange={() => setMemberModal(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Integrantes — {memberModal.name}</DialogTitle>
            </DialogHeader>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Adicionar integrante</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
                  <SelectContent>
                    {availableForTeam.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.displayName} — {e.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addMember} disabled={!selectedEmployee}>
                <UserPlus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers(memberModal.id).map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="text-sm font-medium">{emp.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.role}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeMember(emp.id)}>
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {teamMembers(memberModal.id).length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Nenhum integrante</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

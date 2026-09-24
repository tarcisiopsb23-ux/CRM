import { useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Employee, Team, ACCESS_LEVEL_LABELS, ACCESS_LEVEL_COLORS } from "./types";
import { ROLES } from "./mockData";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { EmployeeDetailModal } from "./EmployeeDetailModal";
import { Plus, Search, Pencil, Trash2, Eye } from "lucide-react";
import { formatBRL } from "@/lib/formatters";

interface Props {
  employees: Employee[];
  onUpdate: (employees: Employee[]) => void;
  payrollData: import("./types").PayrollEntry[];
  teams: Team[];
}

export function EmployeeList({ employees, onUpdate, payrollData, teams }: Props) {
  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);

  const filtered = employees.filter((e) => {
    const matchSearch = e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.displayName.toLowerCase().includes(search.toLowerCase());
    const matchTeam = filterTeam === "all" || e.teamId === filterTeam;
    const matchRole = filterRole === "all" || e.role === filterRole;
    return matchSearch && matchTeam && matchRole;
  });

  const handleSave = (emp: Employee) => {
    const idx = employees.findIndex((e) => e.id === emp.id);
    if (idx >= 0) {
      const updated = [...employees];
      updated[idx] = emp;
      onUpdate(updated);
    } else {
      onUpdate([...employees, emp]);
    }
  };

  const handleDelete = (id: string) => {
    onUpdate(employees.filter((e) => e.id !== id));
  };

  const fmt = (v: number) => formatBRL(v);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar colaborador..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Equipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas equipes</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Função" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas funções</SelectItem>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => { setEditingEmployee(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo colaborador
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Salário base</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{emp.displayName}</p>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{emp.role}</TableCell>
                  <TableCell className="text-sm">{emp.teamName}</TableCell>
                  <TableCell className="text-sm font-medium">{fmt(emp.baseSalary)}</TableCell>
                  <TableCell className="text-sm">{emp.commissionPercent}%</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={ACCESS_LEVEL_COLORS[emp.accessLevel]}>
                      {ACCESS_LEVEL_LABELS[emp.accessLevel]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewingEmployee(emp)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditingEmployee(emp); setFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(emp.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum colaborador encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EmployeeFormModal open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} employee={editingEmployee} teams={teams} />
      {viewingEmployee && (
        <EmployeeDetailModal
          open={!!viewingEmployee}
          onClose={() => setViewingEmployee(null)}
          employee={viewingEmployee}
          payroll={payrollData.filter((p) => p.employeeId === viewingEmployee.id)}
          onEdit={() => { setEditingEmployee(viewingEmployee); setViewingEmployee(null); setFormOpen(true); }}
        />
      )}
    </div>
  );
}

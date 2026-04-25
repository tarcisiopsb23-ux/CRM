import { useState, useMemo } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Employee, PayrollEntry, Team } from "./types";
import { ROLES } from "./mockData";
import { Search, Plus, Pencil, Trash2, DollarSign, TrendingUp, Users, Award } from "lucide-react";
import { formatBRL } from "@/lib/formatters";

interface Props {
  employees: Employee[];
  payroll: PayrollEntry[];
  onPayrollUpdate: (payroll: PayrollEntry[]) => void;
  teams: Team[];
}

const MONTHS = ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${names[Number(mo) - 1]} ${y}`;
};

export function PayrollView({ employees, payroll, onPayrollUpdate, teams }: Props) {
  const [selectedMonth, setSelectedMonth] = useState("2026-02");
  const [filterTeam, setFilterTeam] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState<{ entry: PayrollEntry; emp: Employee } | null>(null);
  const [editForm, setEditForm] = useState({ commission: 0, bonus: 0, overtime: 0, deductions: 0 });

  const monthPayroll = useMemo(() => {
    return payroll
      .filter((p) => p.month === selectedMonth)
      .map((p) => ({ ...p, employee: employees.find((e) => e.id === p.employeeId)! }))
      .filter((p) => p.employee)
      .filter((p) => {
        const matchSearch = p.employee.displayName.toLowerCase().includes(search.toLowerCase());
        const matchTeam = filterTeam === "all" || p.employee.teamId === filterTeam;
        const matchRole = filterRole === "all" || p.employee.role === filterRole;
        return matchSearch && matchTeam && matchRole;
      });
  }, [payroll, selectedMonth, employees, search, filterTeam, filterRole]);

  const totals = useMemo(() => {
    return monthPayroll.reduce(
      (acc, p) => ({
        base: acc.base + p.baseSalary,
        commission: acc.commission + p.commission,
        bonus: acc.bonus + p.bonus,
        overtime: acc.overtime + p.overtime,
        total: acc.total + p.total,
      }),
      { base: 0, commission: 0, bonus: 0, overtime: 0, total: 0 }
    );
  }, [monthPayroll]);

  const openEdit = (entry: PayrollEntry, emp: Employee) => {
    setEditForm({ commission: entry.commission, bonus: entry.bonus, overtime: entry.overtime, deductions: entry.deductions });
    setEditModal({ entry, emp });
  };

  const saveEdit = () => {
    if (!editModal) return;
    const updated = payroll.map((p) =>
      p.id === editModal.entry.id
        ? {
            ...p,
            commission: editForm.commission,
            bonus: editForm.bonus,
            overtime: editForm.overtime,
            deductions: editForm.deductions,
            total: p.baseSalary + editForm.commission + editForm.bonus + editForm.overtime - editForm.deductions,
          }
        : p
    );
    onPayrollUpdate(updated);
    setEditModal(null);
  };

  const removeBonus = (entryId: string) => {
    onPayrollUpdate(
      payroll.map((p) =>
        p.id === entryId ? { ...p, bonus: 0, total: p.baseSalary + p.commission + p.overtime - p.deductions } : p
      )
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={DollarSign} label="Total folha" value={formatBRL(totals.total)} />
        <SummaryCard icon={TrendingUp} label="Comissões" value={formatBRL(totals.commission)} />
        <SummaryCard icon={Award} label="Bônus" value={formatBRL(totals.bonus)} />
        <SummaryCard icon={Users} label="Colaboradores" value={String(monthPayroll.length)} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas equipes</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas funções</SelectItem>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Bônus</TableHead>
                <TableHead className="text-right">H. Extra</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthPayroll.map(({ employee: emp, ...entry }) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{emp.displayName}</p>
                      <p className="text-xs text-muted-foreground">{emp.role}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{emp.teamName}</TableCell>
                  <TableCell className="text-right text-sm">{formatBRL(entry.baseSalary)}</TableCell>
                  <TableCell className="text-right text-sm">{formatBRL(entry.commission)}</TableCell>
                  <TableCell className="text-right text-sm">{entry.bonus > 0 ? formatBRL(entry.bonus) : "—"}</TableCell>
                  <TableCell className="text-right text-sm">{entry.overtime > 0 ? formatBRL(entry.overtime) : "—"}</TableCell>
                  <TableCell className="text-right text-sm text-destructive">{formatBRL(entry.deductions)}</TableCell>
                  <TableCell className="text-right text-sm font-bold">{formatBRL(entry.total)}</TableCell>
                  <TableCell>
                    <Badge variant={entry.paid ? "default" : "outline"} className={entry.paid ? "bg-emerald-600" : ""}>
                      {entry.paid ? "Pago" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(entry, emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {entry.bonus > 0 && (
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeBonus(entry.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {monthPayroll.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
              )}
              {monthPayroll.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">{formatBRL(totals.base)}</TableCell>
                  <TableCell className="text-right">{formatBRL(totals.commission)}</TableCell>
                  <TableCell className="text-right">{formatBRL(totals.bonus)}</TableCell>
                  <TableCell className="text-right">{formatBRL(totals.overtime)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right font-bold">{formatBRL(totals.total)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editModal && (
        <Dialog open onOpenChange={() => setEditModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Ajustar — {editModal.emp.displayName}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Comissão (R$)</Label>
                <CurrencyInput value={editForm.commission} onChange={(v) => setEditForm((f) => ({ ...f, commission: Number(v) || 0 }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Bônus (R$)</Label>
                <CurrencyInput value={editForm.bonus} onChange={(v) => setEditForm((f) => ({ ...f, bonus: Number(v) || 0 }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hora extra (R$)</Label>
                <CurrencyInput value={editForm.overtime} onChange={(v) => setEditForm((f) => ({ ...f, overtime: Number(v) || 0 }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Descontos (R$)</Label>
                <CurrencyInput value={editForm.deductions} onChange={(v) => setEditForm((f) => ({ ...f, deductions: Number(v) || 0 }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button onClick={saveEdit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="stat-card flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

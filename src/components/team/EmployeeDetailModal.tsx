import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Employee, PayrollEntry, ACCESS_LEVEL_LABELS, ACCESS_LEVEL_COLORS } from "./types";
import { Pencil, User, Mail, Phone, MapPin, GraduationCap, Briefcase, Users, Calendar } from "lucide-react";
import { formatBRL, formatCpfCnpj, formatPhoneBR } from "@/lib/formatters";

interface Props {
  open: boolean;
  onClose: () => void;
  employee: Employee;
  payroll: PayrollEntry[];
  onEdit: () => void;
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[Number(mo) - 1]}/${y}`;
};

export function EmployeeDetailModal({ open, onClose, employee: emp, payroll, onEdit }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display">{emp.fullName}</DialogTitle>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
          </div>
        </DialogHeader>

        {/* Info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow icon={User} label="Nome de apresentação" value={emp.displayName} />
          <InfoRow icon={Mail} label="E-mail" value={emp.email} />
          <InfoRow icon={Phone} label="Telefone" value={emp.phone ? formatPhoneBR(emp.phone) : "—"} />
          <InfoRow icon={MapPin} label="Endereço" value={emp.address} />
          <InfoRow icon={GraduationCap} label="Escolaridade" value={emp.education} />
          <InfoRow icon={Briefcase} label="Função" value={emp.role} />
          <InfoRow icon={Users} label="Equipe" value={emp.teamName} />
          <InfoRow icon={Calendar} label="Admissão" value={new Date(emp.hireDate).toLocaleDateString("pt-BR")} />
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground text-xs w-32 shrink-0 pt-0.5">CPF</span>
            <span>{emp.cpf ? formatCpfCnpj(emp.cpf) : "—"}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground text-xs w-32 shrink-0 pt-0.5">RG</span>
            <span>{emp.rg}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground text-xs w-32 shrink-0 pt-0.5">Acesso</span>
            <Badge variant="secondary" className={ACCESS_LEVEL_COLORS[emp.accessLevel]}>
              {ACCESS_LEVEL_LABELS[emp.accessLevel]}
            </Badge>
          </div>
          {emp.notes && (
            <div className="sm:col-span-2 flex items-start gap-2">
              <span className="text-muted-foreground text-xs w-32 shrink-0 pt-0.5">Observações</span>
              <span className="whitespace-pre-wrap">{emp.notes}</span>
            </div>
          )}
        </div>

        {/* Salary info */}
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="stat-card text-center">
            <p className="text-xs text-muted-foreground">Salário base</p>
            <p className="text-lg font-bold text-foreground">{formatBRL(emp.baseSalary)}</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-xs text-muted-foreground">Comissão</p>
            <p className="text-lg font-bold text-foreground">{emp.commissionPercent}%</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-xs text-muted-foreground">Fator HE</p>
            <p className="text-lg font-bold text-foreground">{emp.overtimeFactor}x</p>
          </div>
        </div>

        {/* Payroll history */}
        <div className="mt-4">
          <h4 className="font-display font-semibold text-foreground mb-2">Histórico de Salários</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Bônus</TableHead>
                  <TableHead className="text-right">H. Extra</TableHead>
                  <TableHead className="text-right">Descontos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll.sort((a, b) => b.month.localeCompare(a.month)).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{monthLabel(p.month)}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.baseSalary)}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.commission)}</TableCell>
                    <TableCell className="text-right">{p.bonus > 0 ? formatBRL(p.bonus) : "—"}</TableCell>
                    <TableCell className="text-right">{p.overtime > 0 ? formatBRL(p.overtime) : "—"}</TableCell>
                    <TableCell className="text-right text-destructive">{formatBRL(p.deductions)}</TableCell>
                    <TableCell className="text-right font-bold">{formatBRL(p.total)}</TableCell>
                    <TableCell>
                      <Badge variant={p.paid ? "default" : "outline"} className={p.paid ? "bg-emerald-600" : ""}>
                        {p.paid ? "Pago" : "Pendente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-foreground">{value}</p>
      </div>
    </div>
  );
}

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Employee, AccessLevel, ACCESS_LEVEL_LABELS, Team } from "./types";
import { ROLES } from "./mockData";
import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (employee: Employee) => void;
  employee?: Employee | null;
  teams: Team[];
}

const emptyEmployee: Omit<Employee, "id" | "teamName"> = {
  fullName: "", displayName: "", cpf: "", rg: "", address: "",
  education: "", role: "", teamId: "", baseSalary: 0,
  commissionPercent: 0, overtimeFactor: 1.5, accessLevel: "none",
  email: "", phone: "", hireDate: new Date().toISOString().slice(0, 10), notes: "",
};

export function EmployeeFormModal({ open, onClose, onSave, employee, teams = [] }: Props) {
  const [form, setForm] = useState(emptyEmployee);

  useEffect(() => {
    if (employee) {
      const { id, teamName, ...rest } = employee;
      setForm(rest);
    } else {
      setForm(emptyEmployee);
    }
  }, [employee, open]);

  const set = (key: string, value: string | number) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = () => {
    const team = teams.find((t) => t.id === form.teamId);
    onSave({
      ...form,
      id: employee?.id || crypto.randomUUID(),
      teamName: team?.name || "",
    });
    onClose();
  };

  const isEdit = !!employee;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize as informações do colaborador abaixo." : "Preencha os dados para cadastrar um novo colaborador no sistema."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome completo" value={form.fullName} onChange={(v) => set("fullName", v)} />
          <Field label="Nome de apresentação" value={form.displayName} onChange={(v) => set("displayName", v)} />
          <Field label="CPF" value={form.cpf} onChange={(v) => set("cpf", v)} placeholder="000.000.000-00" />
          <Field label="RG" value={form.rg} onChange={(v) => set("rg", v)} />
          <Field label="E-mail" value={form.email} onChange={(v) => set("email", v)} className="md:col-span-2" />
          <Field label="Telefone" value={form.phone} onChange={(v) => set("phone", v)} />
          <Field label="Data de admissão" value={form.hireDate} onChange={(v) => set("hireDate", v)} type="date" />
          <Field label="Endereço" value={form.address} onChange={(v) => set("address", v)} className="md:col-span-2" />

          <div>
            <Label className="text-xs text-muted-foreground">Escolaridade</Label>
            <Select value={form.education} onValueChange={(v) => set("education", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {["Ensino Fundamental", "Ensino Médio", "Superior Incompleto", "Superior Completo", "Pós-Graduação", "Mestrado", "Doutorado"].map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Função</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Equipe</Label>
            <Select value={form.teamId} onValueChange={(v) => set("teamId", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Nível de acesso</Label>
            <Select value={form.accessLevel} onValueChange={(v) => set("accessLevel", v as AccessLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(ACCESS_LEVEL_LABELS) as [AccessLevel, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Salário base (R$)</Label>
            <CurrencyInput value={String(form.baseSalary)} onChange={(v) => set("baseSalary", Number(v) || 0)} />
          </div>
          <Field label="Fator hora extra" value={String(form.overtimeFactor)} onChange={(v) => set("overtimeFactor", Number(v))} type="number" />

          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anotações sobre o colaborador..." rows={3} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>{isEdit ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

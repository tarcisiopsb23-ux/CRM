import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { JobOpening, LocationType, JobOpeningStatus } from "@/types/recruitment";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: JobOpening | null;
  onSubmit: (data: Partial<JobOpening>) => Promise<void>;
}

const LOCATION_LABELS: Record<LocationType, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

const STATUS_LABELS: Record<JobOpeningStatus, string> = {
  aberta: "Aberta",
  pausada: "Pausada",
  encerrada: "Encerrada",
};

export function JobOpeningForm({ open, onOpenChange, editing, onSubmit }: Props) {
  const [form, setForm] = useState<Partial<JobOpening>>(() => editing ?? {
    title: "",
    job_title: "",
    department: "",
    description: "",
    requirements: "",
    location_type: "presencial",
    salary_range: "",
    status: "aberta",
    closes_at: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof JobOpening, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim()) { setError("Título é obrigatório."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar vaga.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar vaga" : "Nova vaga"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título da vaga *</Label>
              <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Ex: Analista de Marketing" required />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.job_title ?? ""} onChange={(e) => set("job_title", e.target.value)} placeholder="Ex: Analista" />
            </div>
            <div>
              <Label>Departamento / Área</Label>
              <Input value={form.department ?? ""} onChange={(e) => set("department", e.target.value)} placeholder="Ex: Marketing" />
            </div>
            <div>
              <Label>Tipo de trabalho</Label>
              <Select value={form.location_type ?? "presencial"} onValueChange={(v) => set("location_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(LOCATION_LABELS) as [LocationType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Faixa salarial</Label>
              <Input value={form.salary_range ?? ""} onChange={(e) => set("salary_range", e.target.value)} placeholder="Ex: R$ 3.000 - R$ 5.000" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "aberta"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABELS) as [JobOpeningStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de encerramento</Label>
              <Input type="date" value={form.closes_at?.slice(0, 10) ?? ""} onChange={(e) => set("closes_at", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Descrição da vaga</Label>
              <Textarea rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Descreva as responsabilidades e o dia a dia da função..." />
            </div>
            <div className="col-span-2">
              <Label>Requisitos</Label>
              <Textarea rows={3} value={form.requirements ?? ""} onChange={(e) => set("requirements", e.target.value)} placeholder="Formação, experiência, habilidades necessárias..." />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Salvar" : "Criar vaga"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useEmployeeAbsences, useCreateEmployeeAbsence, useUpdateAbsenceStatus } from "@/hooks/useEmployeeAbsences";
import type { AbsenceTipo } from "@/types/hr";
import type { ProfileRow } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";

interface Props {
  profile: ProfileRow;
}

const TIPO_LABEL: Record<string, string> = { ferias: "Férias", atestado: "Atestado", falta: "Falta" };
const STATUS_COLOR: Record<string, string> = {
  aprovado: "bg-emerald-100 text-emerald-800",
  pendente: "bg-yellow-100 text-yellow-800",
};

export function EmployeeAbsencesTab({ profile }: Props) {
  const orgId = useOrganization();
  const { data: absences = [], isLoading } = useEmployeeAbsences(profile.id);
  const createAbsence = useCreateEmployeeAbsence();
  const approveAbsence = useUpdateAbsenceStatus();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tipo: "ferias" as AbsenceTipo,
    data_inicio: "",
    data_fim: "",
    observacao: "",
  });

  const handleCreate = async () => {
    if (!form.data_inicio || !form.data_fim) {
      toast.error("Preencha as datas");
      return;
    }
    if (form.data_fim < form.data_inicio) {
      toast.error("Data fim não pode ser anterior à data início");
      return;
    }
    await createAbsence.mutateAsync({
      organization_id: orgId,
      collaborator_id: profile.id,
      tipo: form.tipo,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      observacao: form.observacao || null,
    });
    toast.success("Ausência registrada");
    setOpen(false);
    setForm({ tipo: "ferias", data_inicio: "", data_fim: "", observacao: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Férias e Ausências</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Registrar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : absences.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma ausência registrada</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {absences.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{TIPO_LABEL[a.tipo]}</TableCell>
                  <TableCell>{new Date(a.data_inicio).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{new Date(a.data_fim).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_COLOR[a.status]}>
                      {a.status === "aprovado" ? "Aprovado" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{a.observacao ?? "—"}</TableCell>
                  <TableCell>
                    {a.status === "pendente" && (
                      <Button variant="ghost" size="icon" title="Aprovar"
                        onClick={() => approveAbsence.mutate({ id: a.id, status: "aprovado" })}>
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Ausência</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as AbsenceTipo }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="atestado">Atestado</SelectItem>
                  <SelectItem value="falta">Falta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data Início</Label>
                <Input type="date" value={form.data_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Data Fim</Label>
                <Input type="date" value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Input value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createAbsence.isPending}>
              {createAbsence.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

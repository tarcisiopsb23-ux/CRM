import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useEmployeeTrainings, useCreateEmployeeTraining, useUpdateTrainingStatus } from "@/hooks/useEmployeeTrainings";
import type { ProfileRow } from "@/hooks/useProfiles";
import { useOrganization } from "@/hooks/useOrganization";

interface Props {
  profile: ProfileRow;
}

const EMPTY_FORM = { nome_treinamento: "", data: "", data_fim: "", observacao: "", resultado: "" };

export function EmployeeTrainingsTab({ profile }: Props) {
  const orgId = useOrganization();
  const { data: trainings = [], isLoading } = useEmployeeTrainings(profile.id);
  const createTraining = useCreateEmployeeTraining();
  const updateStatus = useUpdateTrainingStatus();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [resultado, setResultado] = useState("");

  const handleCreate = async () => {
    if (!form.nome_treinamento) { toast.error("Informe o nome do treinamento"); return; }
    await createTraining.mutateAsync({
      organization_id: orgId,
      collaborator_id: profile.id,
      nome_treinamento: form.nome_treinamento,
      data: form.data || null,
      data_fim: form.data_fim || null,
      observacao: form.observacao || null,
    });
    toast.success("Treinamento registrado");
    setOpen(false);
    setForm(EMPTY_FORM);
  };

  const handleComplete = async () => {
    if (!completingId) return;
    await updateStatus.mutateAsync({ id: completingId, status: "concluido", resultado: resultado || null });
    toast.success("Treinamento concluído");
    setCompletingId(null);
    setResultado("");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Treinamentos</p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Registrar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : trainings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum treinamento registrado</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treinamento</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {trainings.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome_treinamento}</TableCell>
                  <TableCell>{t.data ? new Date(t.data).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>{t.data_fim ? new Date(t.data_fim).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary"
                      className={t.status === "concluido" ? "bg-emerald-100 text-emerald-800" : "bg-yellow-100 text-yellow-800"}>
                      {t.status === "concluido" ? "Concluído" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{t.observacao ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{t.resultado ?? "—"}</TableCell>
                  <TableCell>
                    {t.status === "pendente" && (
                      <Button variant="ghost" size="icon" title="Marcar como concluído"
                        onClick={() => { setCompletingId(t.id); setResultado(""); }}>
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

      {/* Dialog novo treinamento */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Treinamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome do Treinamento</Label>
              <Input value={form.nome_treinamento}
                onChange={(e) => setForm((f) => ({ ...f, nome_treinamento: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data início</Label>
                <Input type="date" value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Data fim</Label>
                <Input type="date" value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Input value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                placeholder="Observações sobre o treinamento (opcional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createTraining.isPending}>
              {createTraining.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog concluir treinamento */}
      <Dialog open={!!completingId} onOpenChange={(o) => !o && setCompletingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Concluir Treinamento</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Resultado</Label>
            <Input value={resultado} onChange={(e) => setResultado(e.target.value)}
              placeholder="Descreva o resultado (opcional)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompletingId(null)}>Cancelar</Button>
            <Button onClick={handleComplete} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

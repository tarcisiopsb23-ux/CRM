import { useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useC8Plans, BILLING_CYCLE_LABELS, type C8Plan } from "@/hooks/useC8Plans";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface C8PlansManagerProps {
  organizationId: string;
  canEdit: boolean;
}

const emptyForm = () => ({
  name: "",
  max_users: "1",
  monthly_value: "0",
  billing_cycle: "mensal" as C8Plan["billing_cycle"],
  is_active: true,
});

export function C8PlansManager({ organizationId, canEdit }: C8PlansManagerProps) {
  const { data: plans = [], isLoading, upsert, remove } = useC8Plans(organizationId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<C8Plan | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<C8Plan | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreate = () => {
    setEditingPlan(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (plan: C8Plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      max_users: String(plan.max_users),
      monthly_value: String(plan.monthly_value),
      billing_cycle: plan.billing_cycle,
      is_active: plan.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const maxUsers = parseInt(form.max_users);
    const value = parseFloat(form.monthly_value);
    if (!form.name.trim()) { toast.error("Informe o nome do plano."); return; }
    if (isNaN(maxUsers) || maxUsers < 1 || maxUsers > 100) { toast.error("Máx. usuários deve ser entre 1 e 100."); return; }
    if (isNaN(value) || value < 0) { toast.error("Valor inválido."); return; }

    setIsSaving(true);
    try {
      await upsert.mutateAsync({
        ...(editingPlan ? { id: editingPlan.id } : {}),
        name: form.name.trim(),
        max_users: maxUsers,
        monthly_value: value,
        billing_cycle: form.billing_cycle,
        is_active: form.is_active,
      });
      toast.success(editingPlan ? "Plano atualizado!" : "Plano criado!");
      setDialogOpen(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao salvar plano.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Plano removido.");
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Erro ao remover plano.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando planos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Defina os planos disponíveis para os clientes do C8 Control.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Novo Plano
          </Button>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum plano cadastrado. Crie o primeiro plano para usar no cadastro de clientes.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Máx. Usuários</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Periodicidade</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.max_users} usuário{p.max_users !== 1 ? "s" : ""}</TableCell>
                  <TableCell>{fmtCurrency(p.monthly_value)}</TableCell>
                  <TableCell>{BILLING_CYCLE_LABELS[p.billing_cycle]}</TableCell>
                  <TableCell>
                    <Badge className={p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                      {p.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome do Plano *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Starter, Pro, Enterprise"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Máx. Usuários (1–100) *</Label>
                <Input
                  type="number" min={1} max={100}
                  value={form.max_users}
                  onChange={(e) => setForm(f => ({ ...f, max_users: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$) *</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={form.monthly_value}
                  onChange={(e) => setForm(f => ({ ...f, monthly_value: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Periodicidade de Cobrança</Label>
              <Select
                value={form.billing_cycle}
                onValueChange={(v) => setForm(f => ({ ...f, billing_cycle: v as C8Plan["billing_cycle"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_CYCLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))}
              />
              <Label className="text-sm">Plano ativo (disponível para seleção)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingPlan ? "Salvar" : "Criar Plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Plano</DialogTitle>
            <DialogDescription>
              Remover o plano <strong>{deleteTarget?.name}</strong>? Clientes já cadastrados com este plano não serão afetados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

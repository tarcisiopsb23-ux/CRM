import { useState, useMemo } from "react";
import { useClientKPIs, ClientKPI } from "@/hooks/useClientKPIs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, CheckCircle2, Circle, Loader2, Settings2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PREDEFINED_KPIS = [
  { name: "Faturamento Bruto", unit: "currency" as const },
  { name: "Faturamento Líquido", unit: "currency" as const },
  { name: "Taxa de Crescimento de Receita", unit: "percentage" as const },
  { name: "Ticket Médio Físico", unit: "currency" as const },
  { name: "Ticket Médio Digital", unit: "currency" as const },
  { name: "Margem de Contribuição", unit: "percentage" as const },
  { name: "Custo de Aquisição de Cliente (CAC)", unit: "currency" as const },
  { name: "ROI (Retorno Sobre o Investimento)", unit: "number" as const },
  { name: "Número de Clientes Ativos", unit: "number" as const },
  { name: "Número Total de Clientes", unit: "number" as const },
  { name: "Número de Pedidos", unit: "number" as const },
];

export function KPIConfigs({ organizationId, clientId }: { organizationId: string, clientId: string }) {
  const { data: kpis = [], isLoading, create, update, remove } = useClientKPIs(organizationId, clientId);
  const [newKpiName, setNewKpiName] = useState("");
  const [newKpiUnit, setNewKpiUnit] = useState<'currency' | 'percentage' | 'number'>("currency");
  const [newKpiTarget, setNewKpiTarget] = useState("");

  // Estado para edição
  const [editKpi, setEditKpi] = useState<ClientKPI | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState<'currency' | 'percentage' | 'number'>("currency");
  const [editTarget, setEditTarget] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Estado para exclusão
  const [deleteKpiId, setDeleteKpiId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeKpiNames = useMemo(() => new Set(kpis.map(k => k.name)), [kpis]);

  const handleAddPredefined = async (kpi: typeof PREDEFINED_KPIS[0]) => {
    if (activeKpiNames.has(kpi.name)) { toast.error("KPI já adicionado"); return; }
    try {
      await create.mutateAsync({ name: kpi.name, unit: kpi.unit, is_predefined: true, category: "Geral" });
      toast.success(`KPI ${kpi.name} ativado`);
    } catch (err: any) {
      toast.error(`Erro ao ativar KPI: ${err.message || "Erro desconhecido"}`);
    }
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKpiName.trim()) return;
    if (activeKpiNames.has(newKpiName.trim())) { toast.error("Já existe um KPI com este nome"); return; }
    try {
      await create.mutateAsync({
        name: newKpiName.trim(),
        unit: newKpiUnit,
        is_predefined: false,
        category: "Personalizado",
        target_value: newKpiTarget ? parseFloat(newKpiTarget) : null,
      });
      setNewKpiName("");
      setNewKpiTarget("");
      toast.success("KPI personalizado adicionado");
    } catch (err: any) {
      toast.error(`Erro ao adicionar KPI: ${err.message || "Erro desconhecido"}`);
    }
  };

  const openEdit = (kpi: ClientKPI) => {
    setEditKpi(kpi);
    setEditName(kpi.name);
    setEditUnit(kpi.unit);
    setEditTarget(kpi.target_value != null ? String(kpi.target_value) : "");
  };

  const handleSaveEdit = async () => {
    if (!editKpi || !editName.trim()) return;
    setIsSavingEdit(true);
    try {
      await update.mutateAsync({
        id: editKpi.id,
        name: editName.trim(),
        unit: editUnit,
        target_value: editTarget ? parseFloat(editTarget) : null,
      });
      toast.success("KPI atualizado!");
      setEditKpi(null);
    } catch {
      toast.error("Erro ao atualizar KPI.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteKpiId) return;
    setIsDeleting(true);
    try {
      await remove.mutateAsync(deleteKpiId);
      toast.success("KPI removido");
      setDeleteKpiId(null);
    } catch {
      toast.error("Erro ao remover KPI");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
      {/* Predefined KPIs */}
      <Card className="bg-background border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Indicadores Sugeridos</CardTitle>
          <CardDescription>Selecione os indicadores que deseja monitorar para este cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 max-h-[600px] overflow-y-auto pr-2">
          {PREDEFINED_KPIS.map((kpi) => {
            const isActive = activeKpiNames.has(kpi.name);
            return (
              <div
                key={kpi.name}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
                  isActive
                    ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10"
                    : "bg-muted/30 border-transparent hover:border-muted-foreground/20 hover:bg-muted/50 cursor-pointer"
                )}
                onClick={() => !isActive && handleAddPredefined(kpi)}
              >
                <div className="flex items-center gap-3">
                  {isActive ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                  <span className={cn("text-sm font-semibold", isActive ? "text-primary" : "text-foreground")}>{kpi.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                  {kpi.unit === 'currency' ? 'Moeda' : kpi.unit === 'percentage' ? 'Porc.' : 'Num.'}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {/* Custom KPI Form */}
        <Card className="bg-background border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">KPI Personalizado</CardTitle>
            <CardDescription>Crie um indicador único para este negócio.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddCustom} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nome do Indicador</label>
                <Input placeholder="Ex: Taxa de Recompra" value={newKpiName} onChange={(e) => setNewKpiName(e.target.value)} className="bg-muted/20" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Unidade</label>
                <Select value={newKpiUnit} onValueChange={(v: any) => setNewKpiUnit(v)}>
                  <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="currency">Moeda (R$)</SelectItem>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="number">Número Inteiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Meta (opcional)</label>
                <Input type="number" placeholder="Ex: 255000" value={newKpiTarget} onChange={(e) => setNewKpiTarget(e.target.value)} className="bg-muted/20" />
              </div>
              <Button type="submit" className="w-full bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 font-bold" disabled={!newKpiName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar KPI
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Active KPIs List */}
        <Card className="bg-background border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Indicadores Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : kpis.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Settings2 className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                <p className="text-sm text-muted-foreground">Nenhum KPI selecionado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {kpis.map((kpi) => (
                  <div key={kpi.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/10 group">
                    <div>
                      <p className="text-sm font-bold text-slate-700">{kpi.name}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">{kpi.category}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] font-bold">
                        {kpi.unit === 'currency' ? 'R$' : kpi.unit === 'percentage' ? '%' : 'Nº'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#2D8CC7]"
                        onClick={() => openEdit(kpi)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                        onClick={() => setDeleteKpiId(kpi.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Edição de KPI */}
      <Dialog open={!!editKpi} onOpenChange={(open) => { if (!open) setEditKpi(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Indicador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-muted/20" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Unidade</label>
              <Select value={editUnit} onValueChange={(v: any) => setEditUnit(v)}>
                <SelectTrigger className="bg-muted/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="currency">Moeda (R$)</SelectItem>
                  <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                  <SelectItem value="number">Número Inteiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Meta (opcional)</label>
              <Input type="number" placeholder="Ex: 255000" value={editTarget} onChange={(e) => setEditTarget(e.target.value)} className="bg-muted/20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKpi(null)}>Cancelar</Button>
            <Button className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90" onClick={handleSaveEdit} disabled={isSavingEdit || !editName.trim()}>
              {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de Exclusão */}
      <AlertDialog open={!!deleteKpiId} onOpenChange={(open) => { if (!open) setDeleteKpiId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Indicador</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover este KPI? O histórico e registros associados também serão excluídos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

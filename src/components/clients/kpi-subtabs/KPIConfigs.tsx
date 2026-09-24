import { useState, useMemo, useEffect, useCallback } from "react";
import { useClientKPIs, ClientKPI } from "@/hooks/useClientKPIs";
import { useClients } from "@/hooks/useClients";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, CheckCircle2, Circle, Loader2, Settings2, Pencil, LayoutDashboard, Save, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { startOfMonth, parseISO } from "date-fns";
import { buildPartnershipImpact } from "@/hooks/usePartnershipImpact";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Componente sortable para cada item da lista de KPIs ativos ────────────
function SortableKpiItem({
  kpi,
  onEdit,
  onDelete,
}: {
  kpi: ClientKPI;
  onEdit: (kpi: ClientKPI) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: kpi.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 rounded-lg border bg-muted/10 group"
    >
      {/* drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mr-2 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        tabIndex={-1}
        aria-label="Arrastar para reorganizar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-700 truncate">{kpi.name}</p>
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">{kpi.category}</p>
      </div>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        <Badge variant="outline" className="text-[10px] font-bold">
          {kpi.unit === 'currency' ? 'R$' : kpi.unit === 'percentage' ? '%' : 'Nº'}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#2D8CC7]"
          onClick={() => onEdit(kpi)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
          onClick={() => onDelete(kpi.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

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
  const qc = useQueryClient();
  const { data: kpis = [], isLoading, create, update, remove } = useClientKPIs(organizationId, clientId);
  const [newKpiName, setNewKpiName] = useState("");
  const [newKpiUnit, setNewKpiUnit] = useState<'currency' | 'percentage' | 'number'>("currency");
  const [newKpiTarget, setNewKpiTarget] = useState("");

  // ── Ordem dos KPIs ativos (drag and drop) ───────────────────────────────
  const [kpiOrder, setKpiOrder] = useState<string[]>([]);

  // KPIs ordenados conforme kpiOrder (IDs sem ordem ficam no final)
  const sortedKpis = useMemo(() => {
    if (kpiOrder.length === 0) return kpis;
    const orderMap = new Map(kpiOrder.map((id, i) => [id, i]));
    return [...kpis].sort((a, b) => {
      const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return ia - ib;
    });
  }, [kpis, kpiOrder]);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedKpis.findIndex(k => k.id === active.id);
    const newIndex = sortedKpis.findIndex(k => k.id === over.id);
    const reordered = arrayMove(sortedKpis, oldIndex, newIndex);
    const newOrder = reordered.map(k => k.id);
    setKpiOrder(newOrder);
    // Persiste a nova ordem no metadata do cliente
    try {
      const { data: current } = await supabase.from("clients").select("metadata").eq("id", clientId).single();
      const currentMeta = ((current?.metadata ?? {}) as Record<string, unknown>);
      await supabase.from("clients")
        .update({ metadata: { ...currentMeta, kpi_order: newOrder } })
        .eq("id", clientId);
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
    } catch {
      toast.error("Erro ao salvar ordem dos KPIs.");
    }
  }, [sortedKpis, clientId, organizationId, qc]);

  // ── Seleção de cards para o Dashboard Geral ──────────────────────────────
  // Carrega os IDs de impacto selecionados para o Dashboard Geral
  const [geralCards, setGeralCards] = useState<string[] | null>(null);
  const [isSavingGeral, setIsSavingGeral] = useState(false);

  // Busca os impact cards disponíveis para seleção
  const [impactCardsAvailable, setImpactCardsAvailable] = useState<{ id: string; label: string; subtitle: string }[]>([]);

  useEffect(() => {
    if (!clientId) return;
    supabase.from("clients").select("metadata").eq("id", clientId).single().then(({ data }) => {
      const meta = (data?.metadata ?? {}) as Record<string, unknown>;
      setGeralCards((meta.geral_dashboard_cards as string[] | undefined) ?? []);
      setKpiOrder((meta.kpi_order as string[] | undefined) ?? []);
    });
    Promise.all([
      supabase.from("client_kpis").select("*").eq("client_id", clientId).not("name", "in", '("__lead_manual","__sale_manual")'),
      supabase.from("client_kpi_history").select("*").eq("client_id", clientId),
      supabase.from("contracts").select("start_date, contract_date, is_dashboard_reference").eq("client_id", clientId).order("start_date", { ascending: true }).limit(1),
    ]).then(([kpisRes, histRes, contractsRes]) => {
      const kpis = kpisRes.data ?? [];
      const history = histRes.data ?? [];
      const contracts = contractsRes.data ?? [];
      if (contracts.length === 0 || kpis.length === 0) return;
      const ref = (contracts as any[]).find((c: any) => c.is_dashboard_reference) ?? contracts[0];
      const rawDate = String((ref as any).contract_date ?? (ref as any).start_date).substring(0, 10);
      const contractStart = startOfMonth(parseISO(rawDate));
      const cards = buildPartnershipImpact(kpis, history, contractStart);
      setImpactCardsAvailable(cards.map((c) => ({ id: c.id, label: c.label, subtitle: c.subtitle })));
    });
  }, [clientId]);

  const toggleGeralCard = (id: string) => {
    setGeralCards(prev => {
      const current = prev ?? [];
      if (current.includes(id)) return current.filter(c => c !== id);
      if (current.length >= 4) {
        toast.error("Máximo de 4 cards selecionados.");
        return current;
      }
      return [...current, id];
    });
  };

  const handleSaveGeralCards = async () => {
    setIsSavingGeral(true);
    try {
      const { data: current } = await supabase.from("clients").select("metadata").eq("id", clientId).single();
      const currentMeta = ((current?.metadata ?? {}) as Record<string, unknown>);
      const { error } = await supabase.from("clients")
        .update({ metadata: { ...currentMeta, geral_dashboard_cards: geralCards ?? [] } })
        .eq("id", clientId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
      toast.success("Seleção de cards salva com sucesso!");
    } catch { toast.error("Erro ao salvar seleção."); }
    finally { setIsSavingGeral(false); }
  };

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
            <CardDescription className="text-[11px]">Arraste para reorganizar a ordem de exibição.</CardDescription>
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedKpis.map(k => k.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {sortedKpis.map((kpi) => (
                      <SortableKpiItem
                        key={kpi.id}
                        kpi={kpi}
                        onEdit={openEdit}
                        onDelete={(id) => setDeleteKpiId(id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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

      {/* ── Cards do Dashboard Geral ── */}
      <Card className="bg-background border-border shadow-sm md:col-span-2">
        <CardHeader className="border-b bg-muted/5">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-[#2D8CC7]" />
            <CardTitle className="text-lg">Cards do Dashboard Geral</CardTitle>
          </div>
          <CardDescription>
            Selecione até 4 cards de Impacto da Parceria para exibir no topo do Dashboard Geral.
            Se nenhum for selecionado, os primeiros 4 disponíveis serão exibidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          {geralCards === null ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : impactCardsAvailable.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Os cards de impacto aparecerão aqui após cadastrar KPIs com histórico antes e após o início do contrato.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-[11px] text-muted-foreground">
                {geralCards.length}/4 selecionados
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {impactCardsAvailable.map(card => {
                  const selected = geralCards.includes(card.id);
                  return (
                    <label key={card.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selected
                          ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10"
                          : "bg-muted/20 border-transparent hover:bg-muted/40",
                        !selected && geralCards.length >= 4 ? "opacity-50 cursor-not-allowed" : ""
                      )}>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleGeralCard(card.id)}
                        className="mt-0.5 shrink-0"
                        disabled={!selected && geralCards.length >= 4} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{card.label}</p>
                        <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {geralCards.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum selecionado — os primeiros 4 cards disponíveis serão exibidos automaticamente.
                </p>
              )}
              <Button onClick={handleSaveGeralCards} disabled={isSavingGeral}
                className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90 font-bold">
                {isSavingGeral ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Seleção
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

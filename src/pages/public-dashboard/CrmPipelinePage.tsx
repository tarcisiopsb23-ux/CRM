import { useEffect, useState } from "react";
import { Plus, Loader2, GitMerge, X, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useCrmPipeline, type CrmDeal, type CrmPipelineStage } from "@/hooks/useCrmPipeline";
import { useCrmContacts } from "@/hooks/useCrmContacts";
import { useCrmProducts } from "@/hooks/useCrmProducts";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { useDynamicClient } from "@/hooks/useDynamicClient";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ─── Deal Card (sortable) ─────────────────────────────────────────────────────

function DealCard({ deal, onEdit, onDelete, canEdit }: {
  deal: CrmDeal;
  onEdit: (d: CrmDeal) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-lg bg-card border border-border/60 p-3 space-y-2 group"
    >
      <div className="flex items-start gap-2">
        {canEdit && (
          <button {...attributes} {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
            tabIndex={-1}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {deal.title || deal.contact?.name || "Sem título"}
          </p>
          {deal.contact?.name && deal.title && (
            <p className="text-xs text-muted-foreground truncate">{deal.contact.name}</p>
          )}
          {deal.product?.name && (
            <p className="text-xs text-muted-foreground truncate">{deal.product.name}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(deal)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(deal.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {deal.value > 0 && (
        <p className="text-xs font-black text-emerald-400">{fmtCurrency(deal.value)}</p>
      )}
      <Badge
        variant="outline"
        className={cn("text-[10px]",
          deal.status === "won"  ? "border-emerald-500/40 text-emerald-400" :
          deal.status === "lost" ? "border-red-500/40 text-red-400" :
          "border-border text-muted-foreground"
        )}
      >
        {deal.status === "won" ? "Ganho" : deal.status === "lost" ? "Perdido" : "Aberto"}
      </Badge>
    </div>
  );
}

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

function KanbanColumn({ stage, deals, onAddDeal, onEditDeal, onDeleteDeal, canEdit }: {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  onAddDeal: (stageId: string) => void;
  onEditDeal: (d: CrmDeal) => void;
  onDeleteDeal: (id: string) => void;
  canEdit: boolean;
}) {
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col gap-2 min-w-[260px] max-w-[260px]">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <p className="text-sm font-bold text-foreground">{stage.name}</p>
          <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full">
            {deals.length}
          </span>
        </div>
        {total > 0 && (
          <span className="text-xs font-semibold text-emerald-400">{fmtCurrency(total)}</span>
        )}
      </div>

      <div className="rounded-xl bg-muted/10 border border-border/40 p-2 flex flex-col gap-2 min-h-[80px]">
        <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map(d => (
            <DealCard key={d.id} deal={d} onEdit={onEditDeal} onDelete={onDeleteDeal} canEdit={canEdit} />
          ))}
        </SortableContext>

        {canEdit && (
          <button
            onClick={() => onAddDeal(stage.id)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-md hover:bg-muted/40"
          >
            <Plus className="h-3.5 w-3.5" /> Nova negociação
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function CrmPipelinePage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";
  const canEdit = ["owner", "admin", "manager", "member"].includes(auth?.user?.role ?? "");
  const canManageStages = ["owner", "admin"].includes(auth?.user?.role ?? "");

  const {
    stages, stagesLoading, deals, dealsLoading,
    createDeal, moveDeal, updateDeal, removeDeal,
    seedDefaultStages,
  } = useCrmPipeline(clientId);

  const { data: contacts = [] } = useCrmContacts(clientId);
  const { data: products = [] } = useCrmProducts(clientId);

  // Seed estágios padrão se vazio
  useEffect(() => {
    if (!stagesLoading && stages.length === 0 && clientId && dc) {
      seedDefaultStages.mutate(clientId);
    }
  }, [stagesLoading, stages.length, clientId, dc]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Estado local de ordem dos deals por coluna (para DnD otimista)
  const [localDeals, setLocalDeals] = useState<CrmDeal[]>([]);
  useEffect(() => { setLocalDeals(deals); }, [deals]);

  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal]       = useState<CrmDeal | null>(null);
  const [defaultStage, setDefaultStage]     = useState<string>("");

  // Form state
  const [dealTitle, setDealTitle]       = useState("");
  const [dealContactId, setDealContactId] = useState("");
  const [dealProductId, setDealProductId] = useState("");
  const [dealValue, setDealValue]       = useState("");
  const [dealStatus, setDealStatus]     = useState<"open" | "won" | "lost">("open");

  if (!dc) return <CredentialsErrorState />;

  function openAddDeal(stageId: string) {
    setEditingDeal(null);
    setDefaultStage(stageId);
    setDealTitle(""); setDealContactId(""); setDealProductId(""); setDealValue(""); setDealStatus("open");
    setDealDialogOpen(true);
  }

  function openEditDeal(deal: CrmDeal) {
    setEditingDeal(deal);
    setDefaultStage(deal.stage_id ?? "");
    setDealTitle(deal.title ?? "");
    setDealContactId(deal.contact_id ?? "");
    setDealProductId(deal.product_id ?? "");
    setDealValue(String(deal.value));
    setDealStatus(deal.status);
    setDealDialogOpen(true);
  }

  async function handleSaveDeal() {
    if (!clientId) return;
    const value = parseFloat(dealValue) || 0;
    try {
      if (editingDeal) {
        await updateDeal.mutateAsync({
          id: editingDeal.id,
          title: dealTitle.trim() || null,
          contact_id: dealContactId || null,
          product_id: dealProductId || null,
          value,
          status: dealStatus,
          stage_id: defaultStage || null,
        });
        toast.success("Negociação atualizada.");
      } else {
        await createDeal.mutateAsync({
          client_id: clientId,
          stage_id: defaultStage,
          title: dealTitle.trim() || undefined,
          contact_id: dealContactId || null,
          product_id: dealProductId || null,
          value,
        });
        toast.success("Negociação criada.");
      }
      setDealDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDeleteDeal(id: string) {
    try {
      await removeDeal.mutateAsync(id);
      toast.success("Negociação removida.");
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Determina para qual coluna o card foi arrastado
    const targetStage = stages.find(s =>
      localDeals.filter(d => d.stage_id === s.id).some(d => d.id === over.id)
    ) ?? stages.find(s => s.id === over.id);

    if (!targetStage) return;

    const draggedDeal = localDeals.find(d => d.id === active.id);
    if (!draggedDeal || draggedDeal.stage_id === targetStage.id) {
      // Reordenar dentro da mesma coluna (local only)
      const colDeals = localDeals.filter(d => d.stage_id === draggedDeal?.stage_id);
      const oldIdx = colDeals.findIndex(d => d.id === active.id);
      const newIdx = colDeals.findIndex(d => d.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        const reordered = arrayMove(colDeals, oldIdx, newIdx);
        setLocalDeals(prev => [
          ...prev.filter(d => d.stage_id !== draggedDeal?.stage_id),
          ...reordered,
        ]);
      }
      return;
    }

    // Mover para outra coluna
    setLocalDeals(prev => prev.map(d =>
      d.id === String(active.id) ? { ...d, stage_id: targetStage.id } : d
    ));
    try {
      await moveDeal.mutateAsync({ id: String(active.id), stage_id: targetStage.id });
    } catch (e: any) {
      toast.error(e.message);
      setLocalDeals(deals); // reverte
    }
  }

  if (stagesLoading || dealsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalValue = localDeals.filter(d => d.status === "won").reduce((s, d) => s + d.value, 0);

  return (
    <div className="mx-auto flex max-w-full flex-col gap-6">
      <PageHeader
        title="Pipeline de Vendas"
        description={totalValue > 0 ? `${fmtCurrency(totalValue)} em negociações ganhas` : "Gerencie suas oportunidades de negócio"}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={localDeals.filter(d => d.stage_id === stage.id)}
              onAddDeal={openAddDeal}
              onEditDeal={openEditDeal}
              onDeleteDeal={handleDeleteDeal}
              canEdit={canEdit}
            />
          ))}

          {stages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 w-full">
              <GitMerge className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">Criando estágios padrão...</p>
            </div>
          )}
        </div>
      </DndContext>

      {/* Dialog negociação */}
      <Dialog open={dealDialogOpen} onOpenChange={open => { if (!open) setDealDialogOpen(false); }}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingDeal ? "Editar Negociação" : "Nova Negociação"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Título</Label>
              <Input value={dealTitle} onChange={e => setDealTitle(e.target.value)} placeholder="Título da negociação (opcional)" />
            </div>
            <div className="grid gap-2">
              <Label>Contato</Label>
              <select
                value={dealContactId}
                onChange={e => setDealContactId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecionar contato (opcional)</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Produto/Serviço</Label>
              <select
                value={dealProductId}
                onChange={e => {
                  setDealProductId(e.target.value);
                  const p = products.find(p => p.id === e.target.value);
                  if (p && !dealValue) setDealValue(String(p.price));
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecionar produto (opcional)</option>
                {products.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(p.price)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input type="number" min="0" step="0.01" value={dealValue}
                  onChange={e => setDealValue(e.target.value)} placeholder="0,00" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <select
                  value={dealStatus}
                  onChange={e => setDealStatus(e.target.value as "open" | "won" | "lost")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="open">Aberto</option>
                  <option value="won">Ganho</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Etapa</Label>
              <select
                value={defaultStage}
                onChange={e => setDefaultStage(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDealDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveDeal}
              disabled={createDeal.isPending || updateDeal.isPending}
              className="bg-gradient-ember text-primary-foreground shadow-glow"
            >
              {(createDeal.isPending || updateDeal.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

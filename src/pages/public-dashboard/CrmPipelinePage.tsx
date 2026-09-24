import { useEffect, useRef, useState, useCallback } from "react";
import {
  Plus, Loader2, GitMerge, X, Pencil, Trash2, GripVertical,
  Settings2, Check, KanbanSquare, List, ChevronDown,
  Filter, SlidersHorizontal, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useCrmDeals } from "@/hooks/useCrmDeals";
import { useCrmContacts } from "@/hooks/useCrmContacts";
import { useCrmProducts } from "@/hooks/useCrmProducts";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { CrmSettingsPanel, type CrmData, type CrmPipeline, type CrmStage, type CrmCustomField } from "./components/CrmSettingsPanel";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Deal {
  id: string;
  client_id: string;
  contact_id: string | null;
  product_id: string | null;
  stage_id: string | null;
  title: string | null;
  value: number;
  status: "open" | "won" | "lost";
  notes: string | null;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string;
  contact?: { name: string } | null;
  product?: { name: string; price: number } | null;
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ deal, onEdit, onDelete, canEdit }: {
  deal: Deal; onEdit: (d: Deal) => void; onDelete: (id: string) => void; canEdit: boolean;
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
      {deal.value > 0 && <p className="text-xs font-black text-emerald-400">{fmtCurrency(deal.value)}</p>}
      <Badge variant="outline" className={cn("text-[10px]",
        deal.status === "won"  ? "border-emerald-500/40 text-emerald-400" :
        deal.status === "lost" ? "border-red-500/40 text-red-400" :
        "border-border text-muted-foreground"
      )}>
        {deal.status === "won" ? "Ganho" : deal.status === "lost" ? "Perdido" : "Aberto"}
      </Badge>
    </div>
  );
}

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

function KanbanColumn({ stage, deals, onAddDeal, onEditDeal, onDeleteDeal, canEdit }: {
  stage: CrmStage; deals: Deal[];
  onAddDeal: (stageId: string) => void;
  onEditDeal: (d: Deal) => void;
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
          <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full">{deals.length}</span>
        </div>
        {total > 0 && <span className="text-xs font-semibold text-emerald-400">{fmtCurrency(total)}</span>}
      </div>
      <div className="rounded-xl bg-muted/10 border border-border/40 p-2 flex flex-col gap-2 min-h-[80px]">
        <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map(d => (
            <DealCard key={d.id} deal={d} onEdit={onEditDeal} onDelete={onDeleteDeal} canEdit={canEdit} />
          ))}
        </SortableContext>
        {canEdit && (
          <button onClick={() => onAddDeal(stage.id)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-md hover:bg-muted/40">
            <Plus className="h-3.5 w-3.5" /> Nova negociação
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Campo personalizado dinâmico ─────────────────────────────────────────────

function CustomFieldInput({ field, value, onChange }: {
  field: CrmCustomField; value: string; onChange: (v: string) => void;
}) {
  const cls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  switch (field.field_type) {
    case "text":
      return <Input value={value} onChange={e => onChange(e.target.value)} placeholder={field.name} />;
    case "number":
      return <Input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="0" />;
    case "date":
      return <Input type="date" value={value} onChange={e => onChange(e.target.value)} />;
    case "select":
      return (
        <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
          <option value="">— Selecionar —</option>
          {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch checked={value === "true"} onCheckedChange={v => onChange(v ? "true" : "false")} />
          <span className="text-sm text-muted-foreground">{value === "true" ? "Sim" : "Não"}</span>
        </div>
      );
    default: return null;
  }
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function CrmPipelinePage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";
  const canEdit = ["owner", "admin", "manager", "member"].includes(auth?.user?.role ?? "");
  const canManage = ["owner", "admin"].includes(auth?.user?.role ?? "");

  if (!dc) return <CredentialsErrorState />;

  // ── CRM Data (fonte unificada via get_crm_data) ────────────────────────────
  const [crmData, setCrmData] = useState<CrmData>({ pipelines: [], stages: [], custom_fields: [] });
  const [crmLoading, setCrmLoading] = useState(true);

  const fetchCrmData = useCallback(async () => {
    if (!dc || !clientId) return;
    const { data, error } = await dc.rpc("get_crm_data", { p_client_id: clientId });
    if (!error && data) setCrmData(data as CrmData);
    setCrmLoading(false);
  // dc muda referência a cada render quando o token muda — usa clientId como proxy estável
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => { if (dc) fetchCrmData(); }, [fetchCrmData, !!dc]);

  // ── Funil ativo ──
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);

  // Seleciona funil default quando carrega
  useEffect(() => {
    if (crmData.pipelines.length > 0 && !activePipelineId) {
      const def = crmData.pipelines.find(p => p.is_default) ?? crmData.pipelines[0];
      setActivePipelineId(def.id);
    }
  }, [crmData.pipelines, activePipelineId]);

  const activePipeline = crmData.pipelines.find(p => p.id === activePipelineId);
  const activeStages   = crmData.stages
    .filter(s => s.pipeline_id === activePipelineId)
    .sort((a, b) => a.order - b.order);

  // ── Deals ──
  const { data: contacts = [] } = useCrmContacts(clientId);
  const { data: products = [] } = useCrmProducts(clientId);
  const { data: allDeals = [], isLoading: dealsLoading, createDeal, updateDeal, removeDeal, moveDeal } =
    useCrmDeals(clientId);

  // Filtra deals do pipeline ativo
  const pipelineDeals = allDeals.filter(d =>
    activeStages.some(s => s.id === d.stage_id)
  );

  const [localDeals, setLocalDeals] = useState<Deal[]>([]);
  const prevDealsKeyRef = useRef<string>("");
  const prevPipelineRef = useRef<string | null>(null);

  // Sincroniza localDeals apenas quando os dados realmente mudam (por valor)
  // evitando loop infinito causado por nova referência de array a cada render
  const dealsKey = allDeals.map(d => `${d.id}:${d.stage_id}:${d.updated_at}`).join("|");
  if (dealsKey !== prevDealsKeyRef.current || activePipelineId !== prevPipelineRef.current) {
    prevDealsKeyRef.current = dealsKey;
    prevPipelineRef.current = activePipelineId;
    // Atualiza localDeals de forma síncrona durante o render (sem useEffect)
    // só quando a pipeline ou os deals realmente mudaram
  }

  useEffect(() => {
    setLocalDeals(pipelineDeals as Deal[]);
  // dealsKey e activePipelineId são primitivos — não causam loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealsKey, activePipelineId]);

  // ── Vista ──
  type ViewMode  = "kanban" | "list";
  type GroupMode = "none" | "stage" | "product" | "status";
  type PageTab   = "deals" | "settings";
  const [viewMode, setViewMode]     = useState<ViewMode>("kanban");
  const [activeTab, setActiveTab]   = useState<PageTab>("deals");
  const [groupBy, setGroupBy]       = useState<GroupMode>("none");
  const [showFilters, setShowFilters] = useState(false);

  // ── Filtros da lista ──
  const [filterStatus,  setFilterStatus]  = useState<"" | "open" | "won" | "lost">("");
  const [filterStageId, setFilterStageId] = useState("");
  const [filterProductId, setFilterProductId] = useState("");

  // ── Deal form ──
  const [dealOpen, setDealOpen]         = useState(false);
  const [editingDeal, setEditingDeal]   = useState<Deal | null>(null);
  const [dealTitle, setDealTitle]       = useState("");
  const [dealContactId, setDealContactId] = useState("");
  const [dealProductId, setDealProductId] = useState("");
  const [dealValue, setDealValue]       = useState("");
  const [dealStatus, setDealStatus]     = useState<"open" | "won" | "lost">("open");
  const [dealStageId, setDealStageId]   = useState("");
  const [dealCustomValues, setDealCustomValues] = useState<Record<string, string>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function openAdd(stageId: string) {
    setEditingDeal(null);
    setDealTitle(""); setDealContactId(""); setDealProductId("");
    setDealValue(""); setDealStatus("open"); setDealStageId(stageId);
    setDealCustomValues({});
    setDealOpen(true);
  }

  function openEdit(deal: Deal) {
    setEditingDeal(deal);
    setDealTitle(deal.title ?? "");
    setDealContactId(deal.contact_id ?? "");
    setDealProductId(deal.product_id ?? "");
    setDealValue(String(deal.value));
    setDealStatus(deal.status);
    setDealStageId(deal.stage_id ?? activeStages[0]?.id ?? "");
    setDealCustomValues({});
    setDealOpen(true);
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
          value, status: dealStatus, stage_id: dealStageId || null,
        });
        toast.success("Negociação atualizada.");
      } else {
        await createDeal.mutateAsync({
          client_id: clientId, stage_id: dealStageId,
          title: dealTitle.trim() || undefined,
          contact_id: dealContactId || null,
          product_id: dealProductId || null, value,
        });
        toast.success("Negociação criada.");
      }
      setDealOpen(false);
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleDeleteDeal(id: string) {
    try { await removeDeal.mutateAsync(id); toast.success("Negociação removida."); }
    catch (e: any) { toast.error(e.message); }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const targetStage = activeStages.find(s =>
      localDeals.filter(d => d.stage_id === s.id).some(d => d.id === over.id)
    ) ?? activeStages.find(s => s.id === over.id);

    if (!targetStage) return;

    const draggedDeal = localDeals.find(d => d.id === active.id);
    if (!draggedDeal || draggedDeal.stage_id === targetStage.id) {
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

    setLocalDeals(prev => prev.map(d =>
      d.id === String(active.id) ? { ...d, stage_id: targetStage.id } : d
    ));
    try {
      await moveDeal.mutateAsync({ id: String(active.id), stage_id: targetStage.id });
    } catch (e: any) {
      toast.error(e.message);
      setLocalDeals(pipelineDeals as Deal[]);
    }
  }

  const totalWon = localDeals.filter(d => d.status === "won").reduce((s, d) => s + d.value, 0);

  if (crmLoading || dealsLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto flex max-w-full flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Funis de Vendas"
          description={totalWon > 0 ? `${fmtCurrency(totalWon)} em negociações ganhas` : "Gerencie suas oportunidades de negócio"}
        />
        <div className="flex items-center gap-2">
          {/* Seletor de funil */}
          {crmData.pipelines.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-sm">
                  <GitMerge className="h-4 w-4" />
                  {activePipeline?.name ?? "Funil"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {crmData.pipelines.map(p => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setActivePipelineId(p.id)}
                    className={cn("gap-2", activePipelineId === p.id && "font-bold text-primary")}
                  >
                    <GitMerge className="h-4 w-4" />
                    {p.name}
                    {p.is_default && <span className="ml-auto text-[10px] text-amber-400">padrão</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Toggle vista */}
          {activeTab === "deals" && (
            <div className="flex items-center rounded-lg border border-border/60 p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode("kanban")}
                className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors",
                  viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <KanbanSquare className="h-3.5 w-3.5" /> Kanban
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors",
                  viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
          )}

          {/* Botão nova negociação */}
          {canEdit && activeTab === "deals" && activeStages.length > 0 && (
            <Button size="sm" onClick={() => openAdd(activeStages[0].id)}
              className="bg-gradient-ember text-primary-foreground shadow-glow gap-1.5">
              <Plus className="h-4 w-4" /> Nova negociação
            </Button>
          )}
        </div>
      </div>

      {/* ── Abas: Negociações / Configurações ── */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        <button
          onClick={() => setActiveTab("deals")}
          className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors",
            activeTab === "deals" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          <GitMerge className="h-4 w-4" /> Negociações
        </button>
        {canManage && (
          <button
            onClick={() => setActiveTab("settings")}
            className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors",
              activeTab === "settings" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            <Settings2 className="h-4 w-4" /> Configurações
          </button>
        )}
      </div>

      {/* ══ ABA: CONFIGURAÇÕES ══════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <CrmSettingsPanel
          crmData={crmData}
          onRefresh={async () => { await fetchCrmData(); }}
        />
      )}

      {/* ══ ABA: NEGOCIAÇÕES ════════════════════════════════════════════════ */}
      {activeTab === "deals" && (<>

        {/* Sem pipeline configurado */}
        {crmData.pipelines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <GitMerge className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-semibold">Nenhum funil configurado</p>
            <p className="text-muted-foreground/70 text-sm max-w-xs">
              Vá em "Configurações" para criar seu primeiro funil de vendas.
            </p>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setActiveTab("settings")} className="gap-2 mt-2">
                <Settings2 className="h-4 w-4" /> Configurar funil
              </Button>
            )}
          </div>
        )}

        {/* ── Vista Kanban ── */}
        {crmData.pipelines.length > 0 && viewMode === "kanban" && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {activeStages.map(stage => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={localDeals.filter(d => d.stage_id === stage.id)}
                  onAddDeal={openAdd}
                  onEditDeal={openEdit}
                  onDeleteDeal={handleDeleteDeal}
                  canEdit={canEdit}
                />
              ))}
              {activeStages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 w-full">
                  <GitMerge className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground text-sm">Nenhuma etapa neste funil.</p>
                </div>
              )}
            </div>
          </DndContext>
        )}

        {/* ── Vista Lista ── */}
        {crmData.pipelines.length > 0 && viewMode === "list" && (() => {
          // Produtos únicos disponíveis no pipeline ativo
          const availableProducts = Array.from(
            new Map(
              localDeals.filter(d => d.product_id && d.product?.name)
                .map(d => [d.product_id, { id: d.product_id!, name: d.product!.name }])
            ).values()
          );

          // Aplica filtros
          const filtered = localDeals.filter(d => {
            if (filterStatus    && d.status      !== filterStatus)    return false;
            if (filterStageId   && d.stage_id    !== filterStageId)   return false;
            if (filterProductId && d.product_id  !== filterProductId) return false;
            return true;
          });

          const totalFiltered = filtered.reduce((s, d) => s + d.value, 0);
          const wonFiltered   = filtered.filter(d => d.status === "won").reduce((s, d) => s + d.value, 0);
          const activeFilters = [filterStatus, filterStageId, filterProductId].filter(Boolean).length;

          // Agrupa os deals filtrados
          type Group = { key: string; label: string; color?: string; deals: typeof filtered };
          let groups: Group[] = [];

          if (groupBy === "stage") {
            groups = activeStages.map(s => ({
              key: s.id, label: s.name, color: s.color,
              deals: filtered.filter(d => d.stage_id === s.id),
            })).filter(g => g.deals.length > 0);
          } else if (groupBy === "product") {
            const prodMap = new Map<string, Group>();
            filtered.forEach(d => {
              const key = d.product_id ?? "__none__";
              const label = d.product?.name ?? "Sem produto";
              if (!prodMap.has(key)) prodMap.set(key, { key, label, deals: [] });
              prodMap.get(key)!.deals.push(d);
            });
            groups = Array.from(prodMap.values());
          } else if (groupBy === "status") {
            const statusOrder = ["open", "won", "lost"] as const;
            const statusLabel: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };
            const statusColor: Record<string, string> = { open: "#64748b", won: "#10b981", lost: "#ef4444" };
            groups = statusOrder
              .map(s => ({ key: s, label: statusLabel[s], color: statusColor[s], deals: filtered.filter(d => d.status === s) }))
              .filter(g => g.deals.length > 0);
          } else {
            groups = [{ key: "all", label: "", deals: filtered }];
          }

          const DealRow = ({ deal }: { deal: typeof filtered[0] }) => {
            const stage = activeStages.find(s => s.id === deal.stage_id);
            return (
              <TableRow className="border-border/60 hover:bg-muted/10">
                <TableCell className="font-semibold text-foreground">
                  {deal.title || deal.contact?.name || "Sem título"}
                </TableCell>
                <TableCell>
                  {stage && (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm text-muted-foreground">{stage.name}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{deal.contact?.name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{deal.product?.name ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-400">
                  {deal.value > 0 ? fmtCurrency(deal.value) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px]",
                    deal.status === "won"  ? "border-emerald-500/40 text-emerald-400" :
                    deal.status === "lost" ? "border-red-500/40 text-red-400" :
                    "border-border text-muted-foreground"
                  )}>
                    {deal.status === "won" ? "Ganho" : deal.status === "lost" ? "Perdido" : "Aberto"}
                  </Badge>
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(deal)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDeal(deal.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          };

          return (
            <div className="space-y-3">
              {/* ── Barra de filtros + agrupamento ── */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Botão filtros */}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setShowFilters(v => !v)}
                  className={cn("gap-2 text-sm", activeFilters > 0 && "border-primary text-primary")}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filtros
                  {activeFilters > 0 && (
                    <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {activeFilters}
                    </span>
                  )}
                </Button>

                {/* Agrupamento */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 text-sm">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      {groupBy === "none"    ? "Agrupar por"  :
                       groupBy === "stage"   ? "Por etapa"    :
                       groupBy === "product" ? "Por produto"  : "Por status"}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setGroupBy("none")}   className={cn(groupBy === "none"    && "font-bold text-primary")}>Sem agrupamento</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGroupBy("stage")}  className={cn(groupBy === "stage"   && "font-bold text-primary")}>Por etapa</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGroupBy("product")} className={cn(groupBy === "product" && "font-bold text-primary")}>Por produto/serviço</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGroupBy("status")} className={cn(groupBy === "status"  && "font-bold text-primary")}>Por status</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Limpar filtros */}
                {activeFilters > 0 && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-sm"
                    onClick={() => { setFilterStatus(""); setFilterStageId(""); setFilterProductId(""); }}>
                    <X className="h-3.5 w-3.5" /> Limpar filtros
                  </Button>
                )}

                {/* Totais */}
                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{filtered.length} negociação{filtered.length !== 1 ? "s" : ""}</span>
                  {totalFiltered > 0 && <span className="text-foreground/70">Total: <span className="font-bold text-emerald-400">{fmtCurrency(totalFiltered)}</span></span>}
                  {wonFiltered > 0 && <span>Ganhos: <span className="font-bold text-emerald-400">{fmtCurrency(wonFiltered)}</span></span>}
                </div>
              </div>

              {/* ── Painel de filtros expandível ── */}
              {showFilters && (
                <div className="rounded-xl border border-border/60 bg-muted/10 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Filtro status */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Status</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([["", "Todos"], ["open", "Aberto"], ["won", "Ganho"], ["lost", "Perdido"]] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setFilterStatus(v as any)}
                          className={cn("px-2.5 py-1 rounded-full text-xs font-bold transition-colors border",
                            filterStatus === v
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtro etapa */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Etapa</p>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setFilterStageId("")}
                        className={cn("px-2.5 py-1 rounded-full text-xs font-bold transition-colors border",
                          filterStageId === "" ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}>
                        Todas
                      </button>
                      {activeStages.map(s => (
                        <button key={s.id} onClick={() => setFilterStageId(s.id)}
                          className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors border",
                            filterStageId === s.id ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}>
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtro produto */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Produto/Serviço</p>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setFilterProductId("")}
                        className={cn("px-2.5 py-1 rounded-full text-xs font-bold transition-colors border",
                          filterProductId === "" ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}>
                        Todos
                      </button>
                      {availableProducts.map(p => (
                        <button key={p.id} onClick={() => setFilterProductId(p.id)}
                          className={cn("px-2.5 py-1 rounded-full text-xs font-bold transition-colors border",
                            filterProductId === p.id ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")}>
                          {p.name}
                        </button>
                      ))}
                      {availableProducts.length === 0 && (
                        <span className="text-xs text-muted-foreground/60 py-1">Nenhum produto nos deals</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tabela (com ou sem agrupamento) ── */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center rounded-xl border border-dashed border-border/60">
                  <GitMerge className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">Nenhuma negociação encontrada com esses filtros.</p>
                  {activeFilters > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs gap-1 mt-1"
                      onClick={() => { setFilterStatus(""); setFilterStageId(""); setFilterProductId(""); }}>
                      <X className="h-3 w-3" /> Limpar filtros
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map(group => (
                    <div key={group.key}>
                      {/* Header do grupo */}
                      {groupBy !== "none" && (
                        <div className="flex items-center gap-2 px-1 py-1.5 mb-1">
                          {group.color && (
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                          )}
                          <span className="text-sm font-bold text-foreground">{group.label}</span>
                          <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full">
                            {group.deals.length}
                          </span>
                          <span className="ml-auto text-xs font-semibold text-emerald-400">
                            {fmtCurrency(group.deals.reduce((s, d) => s + d.value, 0))}
                          </span>
                        </div>
                      )}

                      {/* Tabela do grupo */}
                      <div className="rounded-xl border border-border/60 overflow-hidden">
                        <Table>
                          {groupBy === "none" && (
                            <TableHeader>
                              <TableRow className="border-border hover:bg-transparent bg-muted/10">
                                <TableHead>Negociação</TableHead>
                                <TableHead>Etapa</TableHead>
                                <TableHead>Contato</TableHead>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead>Status</TableHead>
                                {canEdit && <TableHead className="text-right">Ações</TableHead>}
                              </TableRow>
                            </TableHeader>
                          )}
                          {groupBy !== "none" && (
                            <TableHeader>
                              <TableRow className="border-border hover:bg-transparent bg-muted/5">
                                <TableHead className="text-xs text-muted-foreground/70">Negociação</TableHead>
                                {groupBy !== "stage"   && <TableHead className="text-xs text-muted-foreground/70">Etapa</TableHead>}
                                <TableHead className="text-xs text-muted-foreground/70">Contato</TableHead>
                                {groupBy !== "product" && <TableHead className="text-xs text-muted-foreground/70">Produto</TableHead>}
                                <TableHead className="text-right text-xs text-muted-foreground/70">Valor</TableHead>
                                {groupBy !== "status"  && <TableHead className="text-xs text-muted-foreground/70">Status</TableHead>}
                                {canEdit && <TableHead />}
                              </TableRow>
                            </TableHeader>
                          )}
                          <TableBody>
                            {group.deals.map(deal => {
                              const stage = activeStages.find(s => s.id === deal.stage_id);
                              return (
                                <TableRow key={deal.id} className="border-border/60 hover:bg-muted/10">
                                  <TableCell className="font-semibold text-foreground">
                                    {deal.title || deal.contact?.name || "Sem título"}
                                  </TableCell>
                                  {(groupBy === "none" || groupBy !== "stage") && (
                                    <TableCell>
                                      {stage && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                                          <span className="text-sm text-muted-foreground">{stage.name}</span>
                                        </div>
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-sm text-muted-foreground">{deal.contact?.name ?? "—"}</TableCell>
                                  {(groupBy === "none" || groupBy !== "product") && (
                                    <TableCell className="text-sm text-muted-foreground">{deal.product?.name ?? "—"}</TableCell>
                                  )}
                                  <TableCell className="text-right font-semibold text-emerald-400">
                                    {deal.value > 0 ? fmtCurrency(deal.value) : "—"}
                                  </TableCell>
                                  {(groupBy === "none" || groupBy !== "status") && (
                                    <TableCell>
                                      <Badge variant="outline" className={cn("text-[10px]",
                                        deal.status === "won"  ? "border-emerald-500/40 text-emerald-400" :
                                        deal.status === "lost" ? "border-red-500/40 text-red-400" :
                                        "border-border text-muted-foreground"
                                      )}>
                                        {deal.status === "won" ? "Ganho" : deal.status === "lost" ? "Perdido" : "Aberto"}
                                      </Badge>
                                    </TableCell>
                                  )}
                                  {canEdit && (
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(deal)}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDeal(deal.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </>)}

      {/* ── Dialog: Nova / Editar Negociação ── */}
      <Dialog open={dealOpen} onOpenChange={open => { if (!open) setDealOpen(false); }}>
        <DialogContent className="border-border bg-card sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingDeal ? "Editar Negociação" : "Nova Negociação"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Título */}
            <div className="grid gap-2">
              <Label>Título</Label>
              <Input value={dealTitle} onChange={e => setDealTitle(e.target.value)} placeholder="Título da negociação (opcional)" />
            </div>

            {/* Contato + Produto */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Contato</Label>
                <select value={dealContactId} onChange={e => setDealContactId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Nenhum —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Produto/Serviço</Label>
                <select value={dealProductId}
                  onChange={e => { setDealProductId(e.target.value); const p = products.find(p => p.id === e.target.value); if (p && !dealValue) setDealValue(String(p.price)); }}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Nenhum —</option>
                  {products.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(p.price)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Valor + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input type="number" min="0" step="0.01" value={dealValue}
                  onChange={e => setDealValue(e.target.value)} placeholder="0,00" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <select value={dealStatus} onChange={e => setDealStatus(e.target.value as "open" | "won" | "lost")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="open">Aberto</option>
                  <option value="won">Ganho</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
            </div>

            {/* Etapa */}
            <div className="grid gap-2">
              <Label>Etapa</Label>
              <select value={dealStageId} onChange={e => setDealStageId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                {activeStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Campos personalizados */}
            {crmData.custom_fields.length > 0 && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Campos Personalizados
                </p>
                {crmData.custom_fields.map(field => (
                  <div key={field.id} className="grid gap-2">
                    <Label>
                      {field.name}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <CustomFieldInput
                      field={field}
                      value={dealCustomValues[field.id] ?? ""}
                      onChange={v => setDealCustomValues(prev => ({ ...prev, [field.id]: v }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDealOpen(false)}>Cancelar</Button>
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

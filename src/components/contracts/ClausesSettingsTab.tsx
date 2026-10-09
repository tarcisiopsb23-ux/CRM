/**
 * ClausesSettingsTab
 * Aba de gerenciamento de alíneas de cláusulas em Configurações → Contratos.
 *
 * Exibe todas as alíneas agrupadas por categoria, com hierarquia recursiva
 * (alínea → sub-alínea → detalhe → tópico). Cada nó pode ser editado,
 * removido, reordenado (DnD dentro do mesmo pai) e ter filhos adicionados.
 */
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Loader2, Lock, Unlock, ChevronDown, ChevronRight,
  GripVertical, ChevronsRight,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useClauseCategories, useClauses,
} from "@/hooks/useContractTemplates";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { useOrganization } from "@/hooks/useOrganization";
import type { ContractClause } from "@/hooks/useContractTemplates";
import { ClauseEditor } from "./ClauseEditor";

// ── Tipos de edição ──────────────────────────────────────────────────────────

type EditingClause = Partial<ContractClause> & {
  category_key: string;
  is_fixed: boolean;
  depth?: number;
  parent_id?: string | null;
  marker_type?: ContractClause['marker_type'];
};

// ── Labels de depth ──────────────────────────────────────────────────────────

const DEPTH_LABELS: Record<number, string> = {
  0: "Alínea",
  1: "Sub-alínea",
  2: "Detalhe",
  3: "Tópico",
};

const DEPTH_INDENT_PX: Record<number, number> = {
  0: 0,
  1: 20,
  2: 40,
  3: 60,
};

// ── Badge de condição ────────────────────────────────────────────────────────

function ConditionBadge({
  clause,
  getServiceName,
}: {
  clause: ContractClause;
  getServiceName: (slug: string) => string;
}) {
  const negate = clause.condition_negate;
  const negateLabel = negate ? " (invertida)" : "";

  if (clause.is_fixed || clause.condition_type === "always") {
    return (
      <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-300 gap-0.5">
        <Lock className="h-2.5 w-2.5" /> Fixa
      </Badge>
    );
  }
  if (clause.condition_type === "service") {
    return (
      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 gap-0.5">
        <Unlock className="h-2.5 w-2.5" />{" "}
        {getServiceName((clause.condition_value?.slugs as string[])?.[0] ?? clause.service_slug ?? "")}
        {negateLabel}
      </Badge>
    );
  }
  if (clause.condition_type) {
    return (
      <Badge variant="outline" className={`text-[10px] gap-0.5 ${negate ? "text-rose-600 border-rose-300" : "text-blue-600 border-blue-300"}`}>
        <Unlock className="h-2.5 w-2.5" /> {clause.condition_type}{negateLabel}
      </Badge>
    );
  }
  if (clause.service_slug) {
    return (
      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 gap-0.5">
        <Unlock className="h-2.5 w-2.5" /> {getServiceName(clause.service_slug)}{negateLabel}
      </Badge>
    );
  }
  return null;
}

// ── SortableClauseCard ───────────────────────────────────────────────────────

interface SortableClauseCardProps {
  clause: ContractClause;
  idx: number;
  depth: number;
  getServiceName: (slug: string) => string;
  onEdit: (clause: ContractClause) => void;
  onDelete: (clause: ContractClause) => void;
  onAddChild: (parent: ContractClause) => void;
  children?: React.ReactNode;
}

function SortableClauseCard({
  clause,
  idx,
  depth,
  getServiceName,
  onEdit,
  onDelete,
  onAddChild,
  children,
}: SortableClauseCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clause.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const depthColor = [
    "border-l-violet-300",
    "border-l-blue-300",
    "border-l-emerald-300",
    "border-l-amber-300",
  ][depth] ?? "border-l-slate-300";

  const canAddChild = depth < 3;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`border-l-2 ${depthColor} transition-colors`}>
        <CardHeader className="py-2 px-3">
          <div className="flex items-start justify-between gap-2">
            {/* Drag handle + info */}
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <button
                {...attributes}
                {...listeners}
                type="button"
                className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground mt-0.5 focus:outline-none shrink-0"
                aria-label="Reordenar"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {depth > 0 && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground gap-0.5 border-dashed">
                      <ChevronsRight className="h-2.5 w-2.5" /> {DEPTH_LABELS[depth]}
                    </Badge>
                  )}
                  <CardTitle className="text-xs font-medium truncate">
                    {clause.title || `${DEPTH_LABELS[depth] ?? "Nó"} ${idx + 1}`}
                  </CardTitle>
                  <ConditionBadge clause={clause} getServiceName={getServiceName} />
                  {/* Badge do marcador */}
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                    {clause.marker_type === "number" ? "#" :
                     clause.marker_type === "letter" ? "a)" :
                     clause.marker_type === "bullet" ? "•" : "—"}
                  </Badge>
                </div>
                {clause.html_content && (
                  <CardDescription
                    className="text-[10px] mt-0.5 line-clamp-1"
                    dangerouslySetInnerHTML={{
                      __html: clause.html_content
                        .replace(/<[^>]+>/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 120),
                    }}
                  />
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-0.5 shrink-0">
              {canAddChild && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => onAddChild(clause)}
                  title={`Adicionar ${DEPTH_LABELS[depth + 1]}`}
                >
                  <Plus className="h-3 w-3" />
                  {DEPTH_LABELS[depth + 1]}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => onEdit(clause)}
              >
                <Pencil className="h-3 w-3" /> Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => onDelete(clause)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filhos aninhados */}
      {children && (
        <div className="mt-1" style={{ marginLeft: DEPTH_INDENT_PX[depth + 1] ?? 60 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── ClauseTree — renderização recursiva de um nó e seus filhos ───────────────

interface ClauseTreeProps {
  clauses: ContractClause[];           // todos os nós (flat)
  parentId: string | null;             // null = raiz
  depth: number;
  getServiceName: (slug: string) => string;
  onEdit: (clause: ContractClause) => void;
  onDelete: (clause: ContractClause) => void;
  onAddChild: (parent: ContractClause) => void;
  onReorder: (siblings: ContractClause[]) => void;
  sensors: ReturnType<typeof useSensors>;
}

function ClauseTree({
  clauses,
  parentId,
  depth,
  getServiceName,
  onEdit,
  onDelete,
  onAddChild,
  onReorder,
  sensors,
}: ClauseTreeProps) {
  const siblings = clauses
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => a.display_order - b.display_order);

  if (siblings.length === 0) return null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = siblings.findIndex((c) => c.id === active.id);
    const newIdx = siblings.findIndex((c) => c.id === over.id);
    onReorder(arrayMove(siblings, oldIdx, newIdx));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={siblings.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1.5">
          {siblings.map((clause, idx) => (
            <SortableClauseCard
              key={clause.id}
              clause={clause}
              idx={idx}
              depth={depth}
              getServiceName={getServiceName}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            >
              {/* Filhos recursivos */}
              <ClauseTree
                clauses={clauses}
                parentId={clause.id}
                depth={depth + 1}
                getServiceName={getServiceName}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onReorder={onReorder}
                sensors={sensors}
              />
            </SortableClauseCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── ClausesSettingsTab ───────────────────────────────────────────────────────

export function ClausesSettingsTab() {
  const { data: categories = [], isLoading: loadingCats } = useClauseCategories();
  const {
    data: clauses = [],
    isLoading: loadingClauses,
    saveClause,
    removeClause,
    reorderClause,
  } = useClauses();
  const organizationId = useOrganization();
  const { services: serviceItems = [] } = useServiceCatalog(organizationId);

  const getServiceName = (slug: string) =>
    serviceItems.find((s) => s.slug === slug || s.id === slug)?.name ?? slug;

  const [editing,      setEditing]      = useState<EditingClause | null>(null);
  const [parentTitle,  setParentTitle]  = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ContractClause | null>(null);
  const [openCats,     setOpenCats]     = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = loadingCats || loadingClauses;
  const sensors   = useSensors(useSensor(PointerSensor));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSave = async (
    data: Partial<ContractClause> & { category_key: string; html_content: string; is_fixed: boolean }
  ) => {
    try {
      await saveClause.mutateAsync(data);
      toast.success("Salvo!");
      setEditing(null);
      setParentTitle(undefined);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao salvar.");
    }
  };

  const handleDelete = async (clause: ContractClause) => {
    try {
      await removeClause.mutateAsync(clause.id);
      toast.success("Removido.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Erro ao remover.");
    }
  };

  const toggleCat = (key: string) =>
    setOpenCats((prev) => ({ ...prev, [key]: !prev[key] }));

  /** Abre o editor para uma nova alínea raiz */
  const openNewRoot = (categoryKey: string) => {
    setParentTitle(undefined);
    setEditing({ category_key: categoryKey, is_fixed: true, depth: 0, parent_id: null, marker_type: "number" });
  };

  /** Abre o editor para um novo filho */
  const openAddChild = (parent: ContractClause) => {
    const childDepth = (parent.depth ?? 0) + 1;
    setParentTitle(parent.title ?? `${DEPTH_LABELS[parent.depth ?? 0]} sem título`);
    setEditing({
      category_key: parent.category_key,
      is_fixed:     parent.is_fixed,
      condition_type: parent.condition_type ?? "always",
      depth:        childDepth,
      parent_id:    parent.id,
      marker_type:  "number",
      display_order: clauses.filter((c) => c.parent_id === parent.id).length,
    });
  };

  /** Persiste nova ordem após drag-and-drop */
  const handleReorder = async (reordered: ContractClause[]) => {
    try {
      await Promise.all(
        reordered.map((c, i) => reorderClause.mutateAsync({ id: c.id, display_order: i }))
      );
    } catch {
      toast.error("Erro ao salvar nova ordem.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={scrollRef} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Cláusulas do Contrato</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gerencie alíneas, sub-alíneas, detalhes e tópicos. Arraste pelo ícone{" "}
            <GripVertical className="h-3 w-3 inline -mt-0.5 text-muted-foreground" />{" "}
            para reordenar dentro do mesmo nível.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => openNewRoot(categories[0]?.key ?? "")}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Nova alínea
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Lock className="h-3 w-3 text-violet-500" /> Fixa
        </span>
        <span className="flex items-center gap-1">
          <Unlock className="h-3 w-3 text-amber-500" /> Condicional
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span className="text-[11px]"># 1.1</span> Número
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span className="text-[11px]">a)</span> Letra
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span className="text-[11px]">•</span> Marcador
        </span>
      </div>

      {/* Grupos por categoria */}
      <div className="space-y-2">
        {categories.map((cat) => {
          // conta apenas raízes desta categoria
          const rootCount = clauses.filter(
            (c) => c.category_key === cat.key && !c.parent_id
          ).length;
          const isOpen = openCats[cat.key] !== false;

          return (
            <Collapsible
              key={cat.key}
              open={isOpen}
              onOpenChange={() => toggleCat(cat.key)}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors select-none">
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold text-foreground">
                    Cláusula {cat.display_order}ª — {cat.label}
                  </span>
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {rootCount} {rootCount === 1 ? "alínea" : "alíneas"}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                    {cat.placeholder}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs gap-1 ml-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNewRoot(cat.key);
                    }}
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-1 ml-4">
                  {rootCount === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 px-2 italic">
                      Nenhuma alínea cadastrada. Clique em "Adicionar" para criar.
                    </p>
                  ) : (
                    <ClauseTree
                      clauses={clauses.filter((c) => c.category_key === cat.key)}
                      parentId={null}
                      depth={0}
                      getServiceName={getServiceName}
                      onEdit={(c) => { setParentTitle(undefined); setEditing(c); }}
                      onDelete={(c) => setDeleteTarget(c)}
                      onAddChild={openAddChild}
                      onReorder={handleReorder}
                      sensors={sensors}
                    />
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Dialog — editor de alínea/sub-alínea */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setParentTitle(undefined); } }}>
        <DialogContent
          className="max-w-none p-0 gap-0 overflow-hidden flex flex-col"
          style={{ width: "90vw", height: "90vh" }}
        >
          {editing && (
            <ClauseEditor
              clause={editing}
              onSave={handleSave}
              onClose={() => { setEditing(null); setParentTitle(undefined); }}
              isSaving={saveClause.isPending}
              parentTitle={parentTitle}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      {deleteTarget && (
        <Dialog open onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Remover {DEPTH_LABELS[deleteTarget.depth ?? 0]}
              </DialogTitle>
              <DialogDescription>
                <strong>{deleteTarget.title || "sem título"}</strong> e todos os seus
                filhos serão removidos. Contratos já gerados não serão afetados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(deleteTarget)}
                disabled={removeClause.isPending}
              >
                {removeClause.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

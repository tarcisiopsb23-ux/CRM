// src/components/contracts/settings/ServiceCatalogTab.tsx
// Lista de servicos agrupados por categoria, com drag-and-drop por @dnd-kit/sortable.
// Clicar no badge de entregáveis expande um painel inline abaixo da linha do serviço.
// Requirements: 1.7, 1.8

import { useState } from "react";
import {
  Plus, Pencil, Trash2, GripVertical, Package,
  ListChecks, Hash, AlignLeft, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

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

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

import { useOrganization } from "@/hooks/useOrganization";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { ServiceFormDialog } from "./ServiceFormDialog";
import type { ServiceCatalogItem, ServiceDeliverable } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Helpers de estilo para tipos de entregável
// ---------------------------------------------------------------------------

const DELIVERY_TYPE_LABEL: Record<string, string> = {
  recorrente: "Recorrente",
  unico:      "Único",
  pontual:    "Pontual",
};

const DELIVERY_TYPE_CLASS: Record<string, string> = {
  recorrente: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  unico:      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  pontual:    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
};

function DeliverableTypePill({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium leading-4 shrink-0 ${DELIVERY_TYPE_CLASS[type] ?? "bg-muted text-muted-foreground"}`}
    >
      {DELIVERY_TYPE_LABEL[type] ?? type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DeliverablesPanel — painel inline expandível
// ---------------------------------------------------------------------------

function DeliverablesPanel({ deliverables }: { deliverables: ServiceDeliverable[] }) {
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Entregáveis ({deliverables.length})
      </p>
      <ul className="space-y-1.5">
        {deliverables.map((d, i) => (
          <li key={d.id} className="flex items-start gap-2.5">
            {/* Número */}
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-border text-[10px] font-semibold text-muted-foreground">
              {i + 1}
            </span>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-xs font-medium leading-snug">{d.name}</p>
              <div className="flex flex-wrap items-center gap-1">
                <DeliverableTypePill type={d.delivery_type} />
                {d.output_format === "numero" ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Hash className="h-2.5 w-2.5" />
                    Quantidade
                    {d.unit_plural
                      ? ` · ${d.unit_plural}`
                      : d.unit
                      ? ` · ${d.unit}`
                      : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <AlignLeft className="h-2.5 w-2.5" />
                    Texto fixo
                  </span>
                )}
              </div>
              {d.output_format === "texto" && d.text_value && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                  {d.text_value}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableServiceRow
// ---------------------------------------------------------------------------

interface SortableServiceRowProps {
  service: ServiceCatalogItem;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (service: ServiceCatalogItem) => void;
  onDelete: (service: ServiceCatalogItem) => void;
}

function SortableServiceRow({
  service,
  expandedId,
  onToggleExpand,
  onEdit,
  onDelete,
}: SortableServiceRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id });

  const isExpanded = expandedId === service.id;
  const hasDeliverables = service.deliverables.length > 0;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-card shadow-sm overflow-hidden"
    >
      {/* ── Linha principal ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label="Reordenar serviço"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Nome + modalidade */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{service.name}</span>
          {service.modality && (
            <span className="ml-2 text-xs text-muted-foreground">
              &middot; {service.modality}
            </span>
          )}
        </div>

        {/* Badge de entregáveis — clicável para expandir */}
        {hasDeliverables && (
          <button
            type="button"
            onClick={() => onToggleExpand(service.id)}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Fechar" : "Ver"} entregáveis de ${service.name}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ListChecks className="h-3 w-3" />
            {service.deliverables.length}{" "}
            {service.deliverables.length === 1 ? "entregável" : "entregáveis"}
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
        )}

        {!hasDeliverables && (
          <Badge variant="outline" className="text-xs text-muted-foreground/50">
            Sem entregáveis
          </Badge>
        )}

        {/* Ações */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(service)}
          aria-label={`Editar ${service.name}`}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(service)}
          aria-label={`Excluir ${service.name}`}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Excluir
        </Button>
      </div>

      {/* ── Painel de entregáveis (inline, abaixo da linha) ── */}
      {isExpanded && hasDeliverables && (
        <DeliverablesPanel deliverables={service.deliverables} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceCategorySection - DnD sortable list per category
// ---------------------------------------------------------------------------

interface ServiceCategorySectionProps {
  category: string;
  services: ServiceCatalogItem[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (service: ServiceCatalogItem) => void;
  onDelete: (service: ServiceCatalogItem) => void;
  onReorder: (newIds: string[]) => void;
}

function ServiceCategorySection({
  category,
  services,
  expandedId,
  onToggleExpand,
  onEdit,
  onDelete,
  onReorder,
}: ServiceCategorySectionProps) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = services.findIndex((s) => s.id === active.id);
    const newIndex = services.findIndex((s) => s.id === over.id);
    onReorder(arrayMove(services, oldIndex, newIndex).map((s) => s.id));
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {category}
      </h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={services.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {services.map((service) => (
              <SortableServiceRow
                key={service.id}
                service={service}
                expandedId={expandedId}
                onToggleExpand={onToggleExpand}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ServiceCatalogSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceCatalogTab — componente principal
// ---------------------------------------------------------------------------

export function ServiceCatalogTab() {
  const organizationId = useOrganization();
  const { servicesByCategory, isLoading, isError, deleteService, reorderServices } =
    useServiceCatalog(organizationId);

  // Accordion: apenas um serviço expandido por vez (null = nenhum)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceCatalogItem | undefined>(undefined);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ServiceCatalogItem | null>(null);
  const [blockedContracts, setBlockedContracts] = useState<string[] | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  function handleOpenCreate() {
    setEditingService(undefined);
    setFormOpen(true);
  }

  function handleEdit(service: ServiceCatalogItem) {
    setEditingService(service);
    setFormOpen(true);
  }

  function handleDeleteRequest(service: ServiceCatalogItem) {
    setDeleteTarget(service);
    setConfirmDeleteOpen(true);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setConfirmDeleteOpen(false);
    try {
      const result = await deleteService.mutateAsync(deleteTarget.id);
      if (result.blocked) {
        setBlockedContracts(result.affectedContracts);
        setBlockedDialogOpen(true);
      } else {
        toast.success(`Serviço "${deleteTarget.name}" excluído com sucesso.`);
        setDeleteTarget(null);
      }
    } catch {
      toast.error("Erro ao excluir serviço.");
      setDeleteTarget(null);
    }
  }

  function handleCloseBlockedDialog() {
    setBlockedDialogOpen(false);
    setBlockedContracts(null);
    setDeleteTarget(null);
  }

  function handleReorder(categoryServices: ServiceCatalogItem[], newIds: string[]) {
    const allServices = Object.values(servicesByCategory).flat();
    const outsideIds = allServices
      .filter((s) => !newIds.includes(s.id))
      .map((s) => s.id);
    reorderServices.mutate([...outsideIds, ...newIds]);
  }

  const categories = Object.keys(servicesByCategory).sort();
  const isEmpty = categories.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Serviços / Produtos</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os serviços e produtos disponíveis para contratos.
          </p>
        </div>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Serviço
        </Button>
      </div>

      {/* Loading */}
      {isLoading && <ServiceCatalogSkeleton />}

      {/* Error */}
      {isError && !isLoading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Erro ao carregar catálogo de serviços.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
          <Package className="h-10 w-10 mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum serviço cadastrado ainda.
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Clique em &quot;Novo Serviço&quot; para começar.
          </p>
          <Button size="sm" variant="outline" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Serviço
          </Button>
        </div>
      )}

      {/* Categorias + serviços */}
      {!isLoading && !isError && !isEmpty && (
        <div className="space-y-8">
          {categories.map((category) => {
            const catServices = servicesByCategory[category];
            return (
              <ServiceCategorySection
                key={category}
                category={category}
                services={catServices}
                expandedId={expandedId}
                onToggleExpand={handleToggleExpand}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
                onReorder={(newIds) => handleReorder(catServices, newIds)}
              />
            );
          })}
        </div>
      )}

      {/* Dialog de criação / edição */}
      {organizationId && (
        <ServiceFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          service={editingService}
          organizationId={organizationId}
        />
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Tem certeza que deseja excluir o serviço{" "}
                  <strong>&quot;{deleteTarget.name}&quot;</strong>? Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Serviço em uso — exclusão bloqueada */}
      <AlertDialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Serviço em uso &mdash; exclusão bloqueada</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O serviço <strong>&quot;{deleteTarget?.name}&quot;</strong> não pode ser excluído porque
                  está referenciado nos seguintes contratos ativos:
                </p>
                {blockedContracts && blockedContracts.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {blockedContracts.map((title, i) => (
                      <li key={i}>{title}</li>
                    ))}
                  </ul>
                )}
                <p className="text-sm">
                  Remova o serviço desses contratos antes de excluí-lo do catálogo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleCloseBlockedDialog}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

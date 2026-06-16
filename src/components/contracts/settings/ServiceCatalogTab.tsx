// src/components/contracts/settings/ServiceCatalogTab.tsx
// Lista de serviços agrupados por categoria, com drag-and-drop por @dnd-kit/sortable.
// Requirements: 1.7, 1.8

import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical, Package } from "lucide-react";
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
import type { ServiceCatalogItem } from "@/types/contracts";

// ---------------------------------------------------------------------------
// SortableServiceRow
// ---------------------------------------------------------------------------

interface SortableServiceRowProps {
  service: ServiceCatalogItem;
  onEdit: (service: ServiceCatalogItem) => void;
  onDelete: (service: ServiceCatalogItem) => void;
}

function SortableServiceRow({ service, onEdit, onDelete }: SortableServiceRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
    >
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

      {/* Name */}
      <span className="flex-1 text-sm font-medium">{service.name}</span>

      {/* Sub-services badge */}
      <Badge variant="secondary" className="shrink-0">
        {service.sub_services.length}{" "}
        {service.sub_services.length === 1 ? "sub-serviço" : "sub-serviços"}
      </Badge>

      {/* Actions */}
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
  );
}

// ---------------------------------------------------------------------------
// ServiceCategorySection — DnD sortable list per category
// ---------------------------------------------------------------------------

interface ServiceCategorySectionProps {
  category: string;
  services: ServiceCatalogItem[];
  onEdit: (service: ServiceCatalogItem) => void;
  onDelete: (service: ServiceCatalogItem) => void;
  onReorder: (newIds: string[]) => void;
}

function ServiceCategorySection({
  category,
  services,
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
    const reordered = arrayMove(services, oldIndex, newIndex);
    onReorder(reordered.map((s) => s.id));
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
// ServiceCatalogTab — main component
// ---------------------------------------------------------------------------

export function ServiceCatalogTab() {
  const organizationId = useOrganization();
  const { servicesByCategory, isLoading, isError, deleteService, reorderServices } =
    useServiceCatalog(organizationId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceCatalogItem | undefined>(undefined);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ServiceCatalogItem | null>(null);
  const [blockedContracts, setBlockedContracts] = useState<string[] | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

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
    // Build globally-stable ordering: keep services outside this category in
    // their relative positions, then append/splice the reordered ones.
    const allServices = Object.values(servicesByCategory).flat();
    const outsideIds = allServices
      .filter((s) => !newIds.includes(s.id))
      .map((s) => s.id);
    reorderServices.mutate([...outsideIds, ...newIds]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const categories = Object.keys(servicesByCategory).sort();
  const isEmpty = categories.length === 0;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Serviços/Produtos</h2>
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
            Clique em "Novo Serviço" para começar.
          </p>
          <Button size="sm" variant="outline" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Serviço
          </Button>
        </div>
      )}

      {/* Categories + services */}
      {!isLoading && !isError && !isEmpty && (
        <div className="space-y-8">
          {categories.map((category) => {
            const catServices = servicesByCategory[category];
            return (
              <ServiceCategorySection
                key={category}
                category={category}
                services={catServices}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
                onReorder={(newIds) => handleReorder(catServices, newIds)}
              />
            );
          })}
        </div>
      )}

      {/* ServiceFormDialog — create / edit */}
      {organizationId && (
        <ServiceFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          service={editingService}
          organizationId={organizationId}
        />
      )}

      {/* Simple delete confirmation dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Tem certeza que deseja excluir o serviço{" "}
                  <strong>"{deleteTarget.name}"</strong>? Esta ação não pode ser desfeita.
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

      {/* Blocked by active contracts dialog */}
      <AlertDialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Serviço em uso — exclusão bloqueada</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O serviço <strong>"{deleteTarget?.name}"</strong> não pode ser excluído porque
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

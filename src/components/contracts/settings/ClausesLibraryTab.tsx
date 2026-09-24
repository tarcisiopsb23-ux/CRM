// src/components/contracts/settings/ClausesLibraryTab.tsx
// Flat sortable list of contract clauses with drag-and-drop reordering.
// Requirements: 2.3, 2.4

import { useState } from "react";
import { BookOpen, GripVertical, Pencil, Trash2, Plus } from "lucide-react";
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
import { useContractClauses } from "@/hooks/useContractClauses";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { ClauseFormDialog } from "./ClauseFormDialog";
import type { ContractClause } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Condition type label map
// ---------------------------------------------------------------------------

const CONDITION_LABELS: Record<ContractClause["condition_type"], string> = {
  always:                      "Sempre",
  has_setup:                   "Com Setup",
  has_min_duration:            "Com Prazo Mínimo",
  has_service:                 "Com Serviço (ID)",
  has_setup_installments:      "Setup Parcelado",
  service:                     "Com Serviço (slug)",
  has_multiple_representatives:"Assinatura Conjunta",
  signing_type:                "Tipo de Assinatura",
  has_schedule:                "Com Cronograma",
  service_count:               "Nº de Serviços",
  has_grace_period:            "Com Carência",
  is_pf:                       "Pessoa Física",
  is_pj:                       "Pessoa Jurídica",
  has_procurador:              "Com Procurador",
};

// ---------------------------------------------------------------------------
// SortableClauseRow
// ---------------------------------------------------------------------------

interface SortableClauseRowProps {
  clause: ContractClause;
  onEdit: (clause: ContractClause) => void;
  onDelete: (clause: ContractClause) => void;
}

function SortableClauseRow({ clause, onEdit, onDelete }: SortableClauseRowProps) {
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
        aria-label="Reordenar cláusula"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Title */}
      <span className="flex-1 text-sm font-medium truncate">{clause.title}</span>

      {/* Condition type badge */}
      <Badge variant="secondary" className="shrink-0">
        {CONDITION_LABELS[clause.condition_type] ?? clause.condition_type}
      </Badge>

      {/* Editable icon */}
      {clause.is_editable && (
        <Pencil
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-label="Editável pelo consultor"
        />
      )}

      {/* Actions */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onEdit(clause)}
        aria-label={`Editar ${clause.title}`}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        Editar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => onDelete(clause)}
        aria-label={`Excluir ${clause.title}`}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Excluir
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ClausesSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClausesLibraryTab — main component
// ---------------------------------------------------------------------------

export function ClausesLibraryTab() {
  const organizationId = useOrganization();
  const { clauses, isLoading, deleteClause, reorderClauses } =
    useContractClauses(organizationId);
  const { services } = useServiceCatalog(organizationId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingClause, setEditingClause] = useState<ContractClause | undefined>(undefined);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ContractClause | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleOpenCreate() {
    setEditingClause(undefined);
    setFormOpen(true);
  }

  function handleEdit(clause: ContractClause) {
    setEditingClause(clause);
    setFormOpen(true);
  }

  function handleDeleteRequest(clause: ContractClause) {
    setDeleteTarget(clause);
    setConfirmDeleteOpen(true);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setConfirmDeleteOpen(false);
    try {
      await deleteClause.mutateAsync(deleteTarget.id);
      toast.success(`Cláusula "${deleteTarget.title}" excluída com sucesso.`);
      setDeleteTarget(null);
    } catch {
      toast.error("Erro ao excluir cláusula.");
      setDeleteTarget(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = clauses.findIndex((c) => c.id === active.id);
    const newIndex = clauses.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(clauses, oldIndex, newIndex);
    reorderClauses(reordered.map((c) => c.id));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isEmpty = !isLoading && clauses.length === 0;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Biblioteca de Cláusulas</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie as cláusulas disponíveis para os contratos e defina sua ordem.
          </p>
        </div>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Cláusula
        </Button>
      </div>

      {/* Loading */}
      {isLoading && <ClausesSkeleton />}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
          <BookOpen className="h-10 w-10 mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhuma cláusula cadastrada ainda.
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Clique em "Nova Cláusula" para começar.
          </p>
          <Button size="sm" variant="outline" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Cláusula
          </Button>
        </div>
      )}

      {/* Sortable list */}
      {!isLoading && clauses.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={clauses.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {clauses.map((clause) => (
                <SortableClauseRow
                  key={clause.id}
                  clause={clause}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ClauseFormDialog — create / edit */}
      {organizationId && (
        <ClauseFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          clause={editingClause}
          organizationId={organizationId}
          availableServices={services}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cláusula?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Tem certeza que deseja excluir a cláusula{" "}
                  <strong>"{deleteTarget.title}"</strong>? Esta ação não pode ser
                  desfeita.
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
    </div>
  );
}

/**
 * ContentKanbanBoard
 *
 * Kanban de produção editorial — colunas = etapas do workflow de conteúdo.
 * Usa @dnd-kit para drag-and-drop entre colunas.
 * Ao soltar um card em outra coluna, chama onStatusChange.
 */

import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ContentItemCard } from "./ContentItemCard";
import type { ContentItem, ContentStatus } from "@/hooks/useContentItems";

// ── Colunas do kanban de conteúdo ─────────────────────────────────────────────

const KANBAN_COLUMNS: { id: ContentStatus; label: string; color: string }[] = [
  { id: "briefing",              label: "Briefing",             color: "bg-slate-200 dark:bg-slate-700" },
  { id: "producao",              label: "Em Produção",          color: "bg-blue-200 dark:bg-blue-900/50" },
  { id: "revisao_interna",       label: "Revisão Interna",      color: "bg-amber-200 dark:bg-amber-900/50" },
  { id: "aguardando_aprovacao",  label: "Aguardando Aprovação", color: "bg-violet-200 dark:bg-violet-900/50" },
  { id: "aprovado",              label: "Aprovado",             color: "bg-emerald-200 dark:bg-emerald-900/50" },
  { id: "reprovado",             label: "Reprovado",            color: "bg-red-200 dark:bg-red-900/50" },
  { id: "publicado",             label: "Publicado",            color: "bg-green-200 dark:bg-green-900/50" },
];

// ── SortableCard (wrapper dnd-kit) ────────────────────────────────────────────

function SortableCard({
  item,
  onClick,
}: {
  item:    ContentItem;
  onClick: (item: ContentItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform:  CSS.Transform.toString(transform),
        transition,
        opacity:    isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <ContentItemCard item={item} onClick={onClick} compact />
    </div>
  );
}

// ── Coluna ─────────────────────────────────────────────────────────────────────

function KanbanColumn({
  colId,
  label,
  color,
  items,
  onItemClick,
}: {
  colId:       ContentStatus;
  label:       string;
  color:       string;
  items:       ContentItem[];
  onItemClick: (item: ContentItem) => void;
}) {
  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px] flex-shrink-0">
      {/* Header da coluna */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${color}`}>
        <span className="text-xs font-semibold text-foreground/80 truncate flex-1">{label}</span>
        <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0 bg-background/50">
          {items.length}
        </Badge>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-260px)]">
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 p-2 min-h-[80px] bg-muted/30 rounded-b-lg border border-t-0 border-border/40">
            {items.map(item => (
              <SortableCard key={item.id} item={item} onClick={onItemClick} />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// ── Board principal ───────────────────────────────────────────────────────────

interface ContentKanbanBoardProps {
  items:          ContentItem[];
  onItemClick:    (item: ContentItem) => void;
  onStatusChange: (itemId: string, newStatus: ContentStatus) => void;
}

export function ContentKanbanBoard({
  items,
  onItemClick,
  onStatusChange,
}: ContentKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Agrupa itens por coluna (exclui arquivados)
  const grouped = useMemo(() => {
    const result: Record<ContentStatus, ContentItem[]> = {} as Record<ContentStatus, ContentItem[]>;
    for (const col of KANBAN_COLUMNS) result[col.id] = [];
    for (const item of items) {
      if (item.status !== "arquivado" && result[item.status]) {
        result[item.status].push(item);
      }
    }
    return result;
  }, [items]);

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const sourceItem = items.find(i => i.id === active.id);
    if (!sourceItem) return;

    // Verifica se soltou em uma coluna diferente
    const targetColumnId = KANBAN_COLUMNS.find(col =>
      col.id === over.id || grouped[col.id]?.some(i => i.id === over.id)
    )?.id;

    if (targetColumnId && targetColumnId !== sourceItem.status) {
      onStatusChange(sourceItem.id, targetColumnId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(col => (
          <KanbanColumn
            key={col.id}
            colId={col.id}
            label={col.label}
            color={col.color}
            items={grouped[col.id] ?? []}
            onItemClick={onItemClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem && (
          <ContentItemCard item={activeItem} onClick={() => {}} compact />
        )}
      </DragOverlay>
    </DndContext>
  );
}

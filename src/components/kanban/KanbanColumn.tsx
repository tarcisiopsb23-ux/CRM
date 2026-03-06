import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LeadCard } from "./LeadCard";
import type { Lead, EtapaKanban } from "@/types/database";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  id: EtapaKanban;
  label: string;
  leads: Lead[];
  onDetalhes: (lead: Lead) => void;
}

export function KanbanColumn({ id, label, leads, onDetalhes }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const leadIds = leads.map((l) => l.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[280px] w-[280px] flex-shrink-0 rounded-lg border-2 border-dashed border-gray-200 bg-gray-light/50 p-3 transition-colors",
        isOver && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-dark">{label}</h3>
        <span className="text-sm text-gray-500 bg-white px-2 py-0.5 rounded-full">
          {leads.length}
        </span>
      </div>
      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[60px]">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onDetalhes={onDetalhes} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LeadCard } from "./LeadCard";
import type { Lead, EtapaKanban } from "@/types/database";
import { cn } from "@/lib/utils";

interface LeadsKanbanColumnProps {
  id: EtapaKanban;
  label: string;
  leads: Lead[];
  onDetalhes: (lead: Lead) => void;
  activeProposalsCount?: number;
}

export function LeadsKanbanColumn({ id, label, leads, onDetalhes, activeProposalsCount = 0 }: LeadsKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const leadIds = leads.map((l) => l.id);

  return (
    <div
      className={cn(
        "min-w-[280px] w-[280px] flex-shrink-0 flex flex-col rounded-lg border-2 border-dashed border-border bg-muted/50 transition-colors h-full",
        isOver && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-border/50 bg-muted/80 backdrop-blur rounded-t-lg">
        <h3 className="font-semibold text-foreground text-sm truncate pr-2">{label}</h3>
        <div className="flex items-center gap-2">
          {activeProposalsCount > 0 && (
            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full border">
              📝 {activeProposalsCount}
            </span>
          )}
          <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
            {leads.length}
          </span>
        </div>
      </div>
      <div ref={setNodeRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar">
        <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 min-h-[100px]">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onDetalhes={onDetalhes} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

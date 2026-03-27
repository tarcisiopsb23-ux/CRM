import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Lead } from "./types";
import { COLUMNS } from "./types";
import { LeadCard } from "./LeadCard";

interface KanbanColumnProps {
  col: typeof COLUMNS[0];
  leads: Lead[];
  onEdit: (l: Lead) => void;
  onDelete: (id: string) => void;
}

export function KanbanColumn({ col, leads, onEdit, onDelete }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-3 min-w-[260px] w-[260px] bg-slate-800/60 rounded-xl border-t-4 p-3",
        col.color,
        isOver && "bg-slate-700/80"
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-black uppercase tracking-widest text-slate-300">{col.label}</span>
        <span className="text-xs font-bold text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[80px]">
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

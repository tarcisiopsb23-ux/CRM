import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { Lead } from "./types";
import { LeadCard } from "./LeadCard";

export interface KanbanColDef {
  id: string;
  label: string;
  color: string; // classe Tailwind de borda superior, ex: "border-t-indigo-500"
}

interface KanbanColumnProps {
  col: KanbanColDef;
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
        "flex flex-col gap-3 min-w-[300px] w-[300px] bg-slate-800/60 rounded-xl border-t-4 p-3",
        col.color,
        isOver && "bg-slate-700/80"
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-black uppercase tracking-widest text-slate-300">{col.label}</span>
        <span className="text-xs font-bold text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">{leads.length}</span>
      </div>
      <div
        className="flex flex-col gap-2 min-h-[80px] overflow-y-auto pr-2"
        style={{ maxHeight: "22rem" }}
      >
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

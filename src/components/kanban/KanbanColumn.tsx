import { useDroppable } from "@dnd-kit/core";
import { KanbanCard, type Lead } from "./KanbanCard";

interface Props {
  stage: { id: string; label: string; color: string };
  leads: Lead[];
  onOpenDetail: (lead: Lead) => void;
}

export function KanbanColumn({ stage, leads, onOpenDetail }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 border transition-colors ${
        isOver ? "border-primary/40 bg-accent/40" : "border-transparent"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-2 pb-3 min-h-[120px]">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </div>
  );
}

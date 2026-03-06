import { useDraggable } from "@dnd-kit/core";
import { Phone, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Lead {
  id: string;
  company: string;
  niche: string;
  priority: "alta" | "média" | "baixa";
  responsible: string;
  phone: string;
  stage: string;
  email: string;
  city: string;
  origin: string;
  revenue: string;
  notes: string;
  createdAt: string;
}

const priorityStyles: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive",
  média: "bg-warning/10 text-warning",
  baixa: "bg-muted text-muted-foreground",
};

interface Props {
  lead: Lead;
  onOpenDetail: (lead: Lead) => void;
  isDragging?: boolean;
}

export function KanbanCard({ lead, onOpenDetail, isDragging }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-lg bg-card border border-border/60 p-3 shadow-sm cursor-grab transition-shadow hover:shadow-md",
        isDragging && "opacity-90 shadow-lg rotate-2"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-semibold text-foreground leading-tight">{lead.company}</h4>
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", priorityStyles[lead.priority])}>
          {lead.priority}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{lead.niche}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          <span className="truncate max-w-[100px]">{lead.phone}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(lead);
          }}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Eye className="h-3 w-3" />
          Detalhes
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 truncate">Resp: {lead.responsible}</p>
    </div>
  );
}

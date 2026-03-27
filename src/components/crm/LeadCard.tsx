import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Phone, Mail, Building2, Flame, Thermometer, Snowflake, Calendar, MessageCircle, Package, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "./types";
import { format, parseISO, differenceInDays, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadCardProps {
  lead: Lead;
  onEdit: (l: Lead) => void;
  onDelete: (id: string) => void;
  isDragging?: boolean;
}

const TempIcon = ({ t }: { t: string | null }) => {
  if (t === "quente") return <Flame className="h-3 w-3 text-red-400" />;
  if (t === "morno")  return <Thermometer className="h-3 w-3 text-yellow-400" />;
  if (t === "frio")   return <Snowflake className="h-3 w-3 text-blue-400" />;
  return null;
};

function leadAge(createdAt: string): string {
  const created = parseISO(createdAt);
  const now = new Date();
  const days = differenceInDays(now, created);
  if (days >= 1) return `${days}d`;
  const hours = differenceInHours(now, created);
  return `${hours}h`;
}

function leadAgeColor(createdAt: string): string {
  const days = differenceInDays(new Date(), parseISO(createdAt));
  if (days >= 30) return "text-red-400";
  if (days >= 14) return "text-yellow-400";
  return "text-slate-500";
}

export function LeadCard({ lead, onEdit, onDelete, isDragging = false }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortable } = useSortable({ id: lead.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const hasFollowup = lead.next_followup_at && new Date(lead.next_followup_at) > new Date();
  const isOverdue   = lead.next_followup_at && new Date(lead.next_followup_at) < new Date();

  return (
    <div ref={setNodeRef} style={style}>
      <div className={cn(
        "bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2 group",
        (isDragging || isSortable) && "opacity-80 ring-2 ring-blue-400"
      )}>
        {/* Header */}
        <div className="flex items-start gap-2">
          <div {...attributes} {...listeners} className="cursor-grab mt-0.5 shrink-0">
            <GripVertical className="h-4 w-4 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-white truncate">{lead.name}</p>
              <TempIcon t={lead.temperature} />
            </div>
            {lead.company && (
              <div className="flex items-center gap-1 mt-0.5">
                <Building2 className="h-3 w-3 text-slate-500 shrink-0" />
                <p className="text-xs text-slate-400 truncate">{lead.company}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(lead)} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(lead.id)} className="p-1 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Tempo de vida */}
            <div className={cn("flex items-center gap-0.5", leadAgeColor(lead.created_at))}>
              <Clock className="h-2.5 w-2.5 shrink-0" />
              <span className="text-[10px] font-bold">{leadAge(lead.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Contato */}
        <div className="pl-6 space-y-0.5">
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-slate-500 shrink-0" />
              <p className="text-xs text-slate-400 truncate">{lead.phone}</p>
            </div>
          )}
          {lead.whatsapp_link && (
            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-3 w-3 text-emerald-500 shrink-0" />
              <a
                href={lead.whatsapp_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline truncate"
              >
                Abrir WhatsApp
              </a>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-slate-500 shrink-0" />
              <p className="text-xs text-slate-500 truncate">{lead.email}</p>
            </div>
          )}
        </div>

        {/* Produto + Valores */}
        {(lead.product_name || lead.proposal_value != null || lead.potential_value != null) && (
          <div className="pl-6 space-y-0.5">
            {lead.product_name && (
              <div className="flex items-center gap-1.5">
                <Package className="h-3 w-3 text-violet-400 shrink-0" />
                <p className="text-xs text-violet-300 truncate font-medium">{lead.product_name}</p>
              </div>
            )}
            <div className="flex gap-3">
              {lead.proposal_value != null && (
                <p className="text-xs text-emerald-400 font-bold">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.proposal_value)}
                </p>
              )}
              {lead.potential_value != null && (
                <p className="text-xs text-slate-500 font-bold">
                  pot. {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.potential_value)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Follow-up */}
        {lead.next_followup_at && (
          <div className={cn("pl-6 flex items-center gap-1.5", isOverdue ? "text-red-400" : "text-slate-400")}>
            <Calendar className="h-3 w-3 shrink-0" />
            <p className="text-[11px]">
              {isOverdue ? "Atrasado: " : "Follow-up: "}
              {format(parseISO(lead.next_followup_at), "dd/MM HH:mm", { locale: ptBR })}
            </p>
          </div>
        )}

        {/* Tags */}
        {lead.tags && (
          <div className="pl-6 flex flex-wrap gap-1">
            {lead.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
              <span key={tag} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        {/* Origem */}
        {lead.origin && (
          <div className="pl-6">
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wide">{lead.origin}</span>
          </div>
        )}

        {/* Motivo da perda */}
        {lead.status === "perdido" && lead.lost_reason && (
          <p className="text-[11px] text-red-400/70 pl-6 line-clamp-1">↳ {lead.lost_reason}</p>
        )}

        {/* Notas */}
        {lead.notes && (
          <p className="text-[11px] text-slate-500 line-clamp-2 pl-6">{lead.notes}</p>
        )}
      </div>
    </div>
  );
}

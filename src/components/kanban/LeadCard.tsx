import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/database";
import { formatPhoneBR } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const PRIORIDADE_COLOR: Record<string, string> = {
  baixa: "bg-gray-200 text-gray-600",
  media: "bg-blue-100 text-blue-700",
  alta: "bg-amber-100 text-amber-700",
  urgente: "bg-red-100 text-red-700",
};

interface LeadCardProps {
  lead: Lead;
  onDetalhes: (lead: Lead) => void;
  isDragging?: boolean;
}

export function LeadCard({ lead, onDetalhes, isDragging = false }: LeadCardProps) {
  const navigate = useNavigate();
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: lead.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const prioridade = lead.prioridade ?? "media";
  const responsavel =
    (lead as Lead & { profiles?: { full_name: string } | null }).profiles?.full_name ??
    "—";

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "cursor-grab active:cursor-grabbing transition-shadow",
          (isDragging || isSortableDragging) && "opacity-90 shadow-lg ring-2 ring-primary"
        )}
      >
        <CardHeader className="p-3 pb-1">
          <div className="flex items-start justify-between gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 -m-1 rounded hover:bg-gray-100 shrink-0"
              aria-hidden
            >
              <GripVertical className="h-4 w-4 text-gray-400" />
            </div>
            <span className="font-medium text-gray-dark truncate flex-1 min-w-0" title={lead.company ?? lead.name}>
              {lead.company ?? lead.name ?? "—"}
            </span>
            <span
              className={cn(
                "shrink-0 text-xs px-2 py-0.5 rounded-full",
                PRIORIDADE_COLOR[prioridade] ?? PRIORIDADE_COLOR.media
              )}
            >
              {PRIORIDADE_LABEL[prioridade] ?? prioridade}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-1.5">
          {lead.nicho && (
            <p className="text-sm text-gray-600 truncate" title={lead.nicho}>
              <span className="font-medium">Nicho:</span> {lead.nicho}
            </p>
          )}
          <p className="text-sm text-gray-600 truncate">
            <span className="font-medium">Responsável:</span> {responsavel}
          </p>
          {lead.phone && (
            <p className="text-sm text-gray-600 truncate" title={lead.phone}>
              <span className="font-medium">Telefone:</span> {formatPhoneBR(lead.phone)}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onDetalhes(lead);
              }}
            >
              <FileText className="h-4 w-4 mr-2" />
              Detalhes
            </Button>
            {lead.etapa_kanban === "emissao_contrato" && (
              <Button
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/comercial/propostas/nova?lead_id=${lead.id}`);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Proposta
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

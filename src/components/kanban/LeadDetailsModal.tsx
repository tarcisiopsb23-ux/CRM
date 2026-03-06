import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Lead } from "@/types/database";
import { ETAPAS_KANBAN } from "@/types/database";

const PRIORIDADE_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

interface LeadDetailsModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailsModal({
  lead,
  open,
  onOpenChange,
}: LeadDetailsModalProps) {
  if (!lead) return null;

  const etapaLabel =
    ETAPAS_KANBAN.find((e) => e.id === lead.etapa_kanban)?.label ??
    lead.etapa_kanban;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detalhes do Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <span className="font-medium text-gray-500">Empresa</span>
            <p className="text-gray-dark">{lead.company ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Nome</span>
            <p className="text-gray-dark">{lead.name}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Email</span>
            <p className="text-gray-dark">{lead.email ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Telefone</span>
            <p className="text-gray-dark">{lead.phone ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Nicho</span>
            <p className="text-gray-dark">{lead.nicho ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Prioridade</span>
            <p className="text-gray-dark">
              {PRIORIDADE_LABEL[lead.prioridade ?? "media"] ?? lead.prioridade}
            </p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Etapa</span>
            <p className="text-gray-dark">{etapaLabel}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Origem</span>
            <p className="text-gray-dark">{lead.source ?? "—"}</p>
          </div>
          <div>
            <span className="font-medium text-gray-500">Valor estimado</span>
            <p className="text-gray-dark">
              {lead.value != null
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(Number(lead.value))
                : "—"}
            </p>
          </div>
          {lead.notes && (
            <div>
              <span className="font-medium text-gray-500">Observações</span>
              <p className="text-gray-dark whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

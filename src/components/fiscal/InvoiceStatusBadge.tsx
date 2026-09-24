import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/types/fiscal";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; className: string }
> = {
  pendente: {
    label: "Pendente",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  processando: {
    label: "Processando",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  aguardando: {
    label: "Aguardando Emissão",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  emitida: {
    label: "Emitida",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  rejeitada: {
    label: "Rejeitada",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  cancelada: {
    label: "Cancelada",
    className: "bg-gray-300 text-gray-700 border-gray-400",
  },
  cancelamento_pendente: {
    label: "Cancelamento Pendente",
    className: "bg-orange-100 text-orange-700 border-orange-300",
  },
  cancelamento_erro: {
    label: "Erro no Cancelamento",
    className: "bg-red-200 text-red-800 border-red-400",
  },
};

/**
 * Colored badge that displays the status of an NFS-e invoice.
 *
 * - pendente    → gray
 * - processando → yellow
 * - autorizada  → green
 * - rejeitada   → red
 * - cancelada   → dark gray
 */
export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={`${config.className}${className ? ` ${className}` : ""}`}
    >
      {config.label}
    </Badge>
  );
}

import { Badge } from "@/components/ui/badge";

export type IntegrationStatus = "conectado" | "aguardando_qr" | "desconectado" | "inativo";

interface IntegrationStatusBadgeProps {
  status: IntegrationStatus;
}

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; className: string }> = {
  conectado:      { label: "Conectado",      className: "border-transparent bg-emerald-500/20 text-emerald-400" },
  aguardando_qr:  { label: "Aguardando QR",  className: "border-transparent bg-amber-500/20 text-amber-400" },
  desconectado:   { label: "Desconectado",   className: "border-transparent bg-red-500/20 text-red-400" },
  inativo:        { label: "Inativo",        className: "border-transparent bg-slate-500/20 text-slate-400" },
};

export function IntegrationStatusBadge({ status }: IntegrationStatusBadgeProps) {
  const { label, className } = STATUS_CONFIG[status];
  return <Badge className={className}>{label}</Badge>;
}

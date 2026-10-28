/**
 * ContentClientCard — card de cliente para a aba "Clientes" do dashboard.
 * Exibe: logo/avatar, nome, items ativos, pendentes de aprovação,
 * próxima publicação e % de aprovação.
 */

import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge }  from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRight, Calendar, Clock, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/hooks/useContentItems";

interface ClientSummary {
  clientId:       string;
  clientName:     string;
  faviconUrl?:    string | null;
  items:          ContentItem[];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

export function ContentClientCard({ clientId, clientName, faviconUrl, items }: ClientSummary) {
  const navigate = useNavigate();

  const active           = items.filter(i => !["arquivado"].includes(i.status));
  const awaitingApproval = active.filter(i => i.status === "aguardando_aprovacao");
  const published        = active.filter(i => i.status === "publicado");
  const overdue          = active.filter(i => {
    const d = i.production_deadline ?? i.scheduled_date;
    return d && new Date(d) < new Date() && !["publicado","arquivado"].includes(i.status);
  });

  // Próxima publicação agendada
  const upcoming = [...active]
    .filter(i => i.scheduled_date && i.status !== "publicado")
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""))[0];

  const approvalRate = active.length > 0
    ? Math.round((published.length / active.length) * 100)
    : 0;

  return (
    <Card
      className="border-border/60 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
      onClick={() => navigate(`/content/cliente/${clientId}`)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: avatar + nome + seta */}
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            {faviconUrl ? (
              <img src={faviconUrl} alt={clientName} className="object-contain" />
            ) : (
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                {initials(clientName)}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {clientName}
            </p>
            <p className="text-xs text-muted-foreground">{active.length} ite{active.length !== 1 ? "ns" : "m"} ativo{active.length !== 1 ? "s" : ""}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-2">
          <MetricBox value={awaitingApproval.length} label="Aprovação" highlight={awaitingApproval.length > 0} />
          <MetricBox value={published.length}        label="Publicados" />
          <MetricBox value={`${approvalRate}%`}      label="Taxa aprov." />
        </div>

        {/* Alerts */}
        <div className="space-y-1.5">
          {overdue.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {overdue.length} ite{overdue.length !== 1 ? "ns" : "m"} atrasado{overdue.length !== 1 ? "s" : ""}
            </div>
          )}
          {upcoming?.scheduled_date && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" />
              Próx.: {format(parseISO(upcoming.scheduled_date), "dd/MM", { locale: ptBR })} · {upcoming.title.slice(0, 30)}{upcoming.title.length > 30 ? "..." : ""}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBox({ value, label, highlight = false }: { value: string | number; label: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-lg p-2 text-center",
      highlight ? "bg-violet-50 dark:bg-violet-900/20" : "bg-muted/40",
    )}>
      <p className={cn(
        "text-base font-black tabular-nums",
        highlight ? "text-violet-600 dark:text-violet-300" : "text-foreground",
      )}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
    </div>
  );
}

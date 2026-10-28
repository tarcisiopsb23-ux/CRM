/**
 * ContentNextActionsTable
 * Lista de próximas ações — itens com prazo iminente.
 * Filtros: Todos | Equipe | Cliente | Publicações
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ContentStatusBadge, ContentPlatformBadge } from "./ContentStatusBadge";
import type { ContentItem } from "@/hooks/useContentItems";

type Filter = "todos" | "equipe" | "cliente" | "publicacoes";

interface Props {
  items:   ContentItem[];
  loading: boolean;
  max?:    number;
}

function deadlineLabel(date: string | null): { label: string; className: string } | null {
  if (!date) return null;
  const d = parseISO(date);
  if (isToday(d))    return { label: "Hoje",   className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  if (isTomorrow(d)) return { label: "Amanhã", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
  if (isPast(d))     return { label: "Atrasado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  return { label: format(d, "dd/MM", { locale: ptBR }), className: "bg-muted text-muted-foreground" };
}

export function ContentNextActionsTable({ items, loading, max = 8 }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("todos");

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
      </div>
    );
  }

  // Filtra por itens com prazo próximo (próximos 7 dias + atrasados), excluindo publicados/arquivados
  const withDeadline = items.filter(i => {
    const d = i.production_deadline ?? i.scheduled_date;
    if (!d) return false;
    if (["publicado", "arquivado"].includes(i.status)) return false;
    return true;
  }).sort((a, b) => {
    const da = a.production_deadline ?? a.scheduled_date ?? "9999";
    const db = b.production_deadline ?? b.scheduled_date ?? "9999";
    return da.localeCompare(db);
  });

  const filtered = withDeadline.filter(i => {
    if (filter === "equipe")       return i.assigned_to_type === "agency";
    if (filter === "cliente")      return i.approval_status === "alteracao_solicitada" || i.status === "aguardando_aprovacao";
    if (filter === "publicacoes")  return i.status === "aprovado";
    return true;
  });

  const shown = filtered.slice(0, max);

  const filterBtns: { key: Filter; label: string }[] = [
    { key: "todos",       label: "Todos" },
    { key: "equipe",      label: "Equipe" },
    { key: "cliente",     label: "Cliente" },
    { key: "publicacoes", label: "Publicações" },
  ];

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {filterBtns.map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              filter === btn.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            {btn.label}
            {btn.key !== "todos" && (
              <span className="ml-1.5 opacity-70">
                {withDeadline.filter(i => {
                  if (btn.key === "equipe")      return i.assigned_to_type === "agency";
                  if (btn.key === "cliente")     return i.approval_status === "alteracao_solicitada" || i.status === "aguardando_aprovacao";
                  if (btn.key === "publicacoes") return i.status === "aprovado";
                  return true;
                }).length}
              </span>
            )}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs h-7"
          onClick={() => navigate("/content/itens")}
        >
          Ver todos <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Lista */}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma ação pendente para este filtro.
        </p>
      ) : (
        <div className="space-y-1.5">
          {shown.map(item => {
            const deadline = item.production_deadline ?? item.scheduled_date;
            const dlLabel  = deadlineLabel(deadline);

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:bg-accent/30 cursor-pointer transition-colors group"
                onClick={() => navigate(`/content/itens/${item.id}`)}
              >
                <Checkbox
                  checked={item.status === "publicado"}
                  className="shrink-0"
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ContentPlatformBadge platform={item.platform} />
                    {item.client_name && (
                      <span className="text-xs text-muted-foreground truncate">
                        · {item.client_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs border-0 hidden sm:inline-flex",
                      item.assigned_to_type === "partner"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                    )}
                  >
                    {item.assigned_to_type === "partner" ? "Parceiro" : "Equipe"}
                  </Badge>
                  <ContentStatusBadge status={item.status} size="sm" />
                  {dlLabel && (
                    <Badge variant="outline" className={cn("text-xs border-0", dlLabel.className)}>
                      {dlLabel.label}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

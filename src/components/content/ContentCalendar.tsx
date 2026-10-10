/**
 * ContentCalendar — calendário editorial mensal.
 * Exibe itens de conteúdo agrupados por data (scheduled_date ou production_deadline).
 * Clique num item abre o detalhe.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, parseISO, addMonths, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useContentCalendar } from "@/hooks/useContentItems";
import type { ContentItem } from "@/hooks/useContentItems";
import { ContentStatusBadge, ContentPlatformBadge } from "./ContentStatusBadge";

// ── Mapa de cores por plataforma para pontos no calendário ────────────────────
const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook:  "bg-blue-600",
  linkedin:  "bg-blue-400",
  tiktok:    "bg-gray-900 dark:bg-white",
  youtube:   "bg-red-600",
  google:    "bg-yellow-500",
  email:     "bg-slate-500",
  outro:     "bg-gray-400",
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CalendarItem {
  id:             string;
  title:          string;
  status:         string;
  platform:       string | null;
  scheduled_date: string | null;
  production_deadline: string | null;
  client_name:    string | null;
}

interface ContentCalendarProps {
  organizationId: string;
  clientId?:      string;
  onItemClick:    (item: ContentItem) => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContentCalendar({
  organizationId,
  clientId,
  onItemClick,
}: ContentCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selected,     setSelected]     = useState<Date | null>(null);

  const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const end   = format(endOfMonth(currentMonth),   "yyyy-MM-dd");

  const { data: items = [], isLoading } = useContentCalendar(
    organizationId,
    start,
    end,
    clientId,
  );

  // Dias do mês (com padding de semana)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd   = endOfMonth(currentMonth);
    const weekStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
    const weekEnd    = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentMonth]);

  // Agrupa itens por data
  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of items) {
      const date = item.scheduled_date ?? item.production_deadline;
      if (!date) continue;
      const key = date.slice(0, 10);
      map[key] = map[key] ?? [];
      map[key].push(item as CalendarItem);
    }
    return map;
  }, [items]);

  // Itens do dia selecionado
  const selectedItems = selected
    ? itemsByDate[format(selected, "yyyy-MM-dd")] ?? []
    : [];

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="space-y-4">
      {/* Cabeçalho do mês */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => setCurrentMonth(new Date())}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grade do calendário */}
      <div className="border border-border/60 rounded-xl overflow-hidden">
        {/* Nome dos dias da semana */}
        <div className="grid grid-cols-7 border-b border-border/60">
          {dayNames.map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Células de dias */}
        <div className="grid grid-cols-7">
          {calendarDays.map(day => {
            const key        = format(day, "yyyy-MM-dd");
            const dayItems   = itemsByDate[key] ?? [];
            const isToday    = isSameDay(day, new Date());
            const isSelected = selected ? isSameDay(day, selected) : false;
            const isOther    = !isSameMonth(day, currentMonth);

            return (
              <div
                key={key}
                onClick={() => setSelected(isSelected ? null : day)}
                className={cn(
                  "min-h-[80px] p-1.5 border-b border-r border-border/40 cursor-pointer",
                  "hover:bg-accent/20 transition-colors",
                  isOther    && "bg-muted/20 opacity-50",
                  isSelected && "bg-accent/40 ring-1 ring-inset ring-primary/30",
                )}
              >
                {/* Número do dia */}
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                  isToday    && "bg-primary text-primary-foreground",
                  !isToday   && "text-foreground/80",
                )}>
                  {format(day, "d")}
                </div>

                {/* Pontos de itens (máx 3 + contador) */}
                {dayItems.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {dayItems.slice(0, 3).map(item => (
                      <div
                        key={item.id}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          item.platform ? PLATFORM_DOT[item.platform] : "bg-primary",
                        )}
                      />
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{dayItems.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Título do primeiro item (visível em telas maiores) */}
                {dayItems[0] && (
                  <p className="hidden lg:block text-[10px] text-foreground/70 truncate mt-0.5">
                    {dayItems[0].title}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Painel lateral: itens do dia selecionado */}
      {selected && selectedItems.length > 0 && (
        <div className="border border-border/60 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">
            {format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            <span className="ml-2 text-muted-foreground font-normal">
              ({selectedItems.length} ite{selectedItems.length !== 1 ? "ns" : "m"})
            </span>
          </h3>
          <div className="space-y-2">
            {selectedItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-lg border border-border/40 hover:bg-accent/20 cursor-pointer transition-colors"
                onClick={() => onItemClick(item as unknown as ContentItem)}
              >
                {item.platform && (
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    item.platform ? PLATFORM_DOT[item.platform] : "bg-primary",
                  )} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ContentPlatformBadge platform={item.platform as never} />
                    {item.client_name && (
                      <span className="text-xs text-muted-foreground">· {item.client_name}</span>
                    )}
                  </div>
                </div>
                <ContentStatusBadge status={item.status as never} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <p className="text-center text-sm text-muted-foreground py-4">Carregando calendário...</p>
      )}
    </div>
  );
}

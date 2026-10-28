/**
 * ContentWeekCalendar
 * Calendário semanal compacto — 7 colunas, scroll por semana.
 * Cada célula mostra os itens do dia com cor por plataforma.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isSameDay, parseISO, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/hooks/useContentItems";

const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook:  "bg-blue-600",
  linkedin:  "bg-blue-400",
  tiktok:    "bg-gray-800 dark:bg-white",
  youtube:   "bg-red-600",
  google:    "bg-yellow-500",
  email:     "bg-slate-400",
  outro:     "bg-muted-foreground",
};

const STATUS_RING: Record<string, string> = {
  aguardando_aprovacao: "ring-1 ring-violet-400/60",
  aprovado:             "ring-1 ring-emerald-400/60",
  publicado:            "ring-1 ring-green-500/60",
  reprovado:            "ring-1 ring-red-400/60",
};

interface Props {
  items:        ContentItem[];
  onItemClick?: (item: ContentItem) => void;
}

export function ContentWeekCalendar({ items, onItemClick }: Props) {
  const navigate         = useNavigate();
  const [refDate, setRefDate] = useState(new Date());

  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 }); // segunda
  const weekEnd   = endOfWeek(refDate,   { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Agrupa itens por data (scheduled_date ou production_deadline)
  const byDate = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    for (const item of items) {
      const d = item.scheduled_date ?? item.production_deadline;
      if (!d) continue;
      const key = d.slice(0, 10);
      map[key] = map[key] ?? [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const weekLabel = `${format(weekStart, "d", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMMM", { locale: ptBR })}`;

  return (
    <div className="space-y-2">
      {/* Navegação */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setRefDate(d => subWeeks(d, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-sm font-medium px-1 min-w-[180px] text-center">
            {weekLabel}
          </span>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setRefDate(d => addWeeks(d, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm" className="h-7 text-xs ml-1"
            onClick={() => setRefDate(new Date())}
          >
            Hoje
          </Button>
        </div>
        <Button
          variant="ghost" size="sm" className="text-xs h-7"
          onClick={() => navigate("/content/itens")}
        >
          Ver calendário <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Grade semanal */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const key      = format(day, "yyyy-MM-dd");
          const dayItems = byDate[key] ?? [];
          const today    = isToday(day);

          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border border-border/40 p-1.5 min-h-[80px] space-y-1",
                today && "border-primary/30 bg-primary/5",
              )}
            >
              {/* Cabeçalho do dia */}
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {format(day, "EEE", { locale: ptBR })}
                </p>
                <p className={cn(
                  "text-sm font-bold leading-none",
                  today ? "text-primary" : "text-foreground/80",
                )}>
                  {format(day, "d")}
                </p>
              </div>

              {/* Items do dia */}
              {dayItems.length === 0 ? null : (
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(item => (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full text-left rounded px-1 py-0.5",
                        "bg-muted/60 hover:bg-accent/60 transition-colors",
                        STATUS_RING[item.status] ?? "",
                      )}
                      onClick={() => onItemClick?.(item)}
                      title={item.title}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        {item.platform && (
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full shrink-0", PLATFORM_DOT[item.platform] ?? "bg-muted-foreground")}
                          />
                        )}
                        <span className="text-[10px] truncate leading-tight text-foreground/80">
                          {item.title}
                        </span>
                      </div>
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <p className="text-[9px] text-muted-foreground text-center">
                      +{dayItems.length - 3} mais
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

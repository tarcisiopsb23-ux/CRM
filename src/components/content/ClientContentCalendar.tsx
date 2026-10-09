/**
 * ClientContentCalendar — calendário de publicações do cliente.
 * Read-only: mostra datas agendadas e itens publicados.
 * Itens aguardando aprovação são destacados em violeta.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, parseISO,
  addMonths, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useClientContentCalendar } from "@/hooks/useClientContent";

const STATUS_DOT: Record<string, string> = {
  aguardando_aprovacao: "bg-violet-500",
  aprovado:             "bg-emerald-500",
  publicado:            "bg-green-500",
  reprovado:            "bg-red-500",
  producao:             "bg-blue-500",
  briefing:             "bg-slate-500",
};

interface ClientContentCalendarProps {
  clientId:       string;
  organizationId: string;
  onItemClick?:   (itemId: string) => void;
}

export function ClientContentCalendar({
  clientId,
  organizationId,
  onItemClick,
}: ClientContentCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selected,     setSelected]     = useState<Date | null>(null);

  const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const end   = format(endOfMonth(currentMonth),   "yyyy-MM-dd");

  const { data: items = [], isLoading } = useClientContentCalendar(
    clientId, organizationId, start, end,
  );

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd   = endOfMonth(currentMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end:   endOfWeek(monthEnd, { weekStartsOn: 0 }),
    });
  }, [currentMonth]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, typeof items> = {};
    for (const item of items) {
      const date = (item as Record<string, unknown>).scheduled_date as string
        ?? (item as Record<string, unknown>).production_deadline as string;
      if (!date) continue;
      const key = date.slice(0, 10);
      map[key] = map[key] ?? [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const selectedItems = selected
    ? itemsByDate[format(selected, "yyyy-MM-dd")] ?? []
    : [];

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-[#1E293B]"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-400 hover:text-white hover:bg-[#1E293B]"
            onClick={() => setCurrentMonth(new Date())}
          >
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-[#1E293B]"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grade */}
      <div className="border border-[#1E293B] rounded-xl overflow-hidden">
        {/* Dias da semana */}
        <div className="grid grid-cols-7 border-b border-[#1E293B] bg-[#0F172A]">
          {dayNames.map(d => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-slate-500">
              {d}
            </div>
          ))}
        </div>

        {/* Células */}
        <div className="grid grid-cols-7 bg-[#0B1120]">
          {calendarDays.map(day => {
            const key       = format(day, "yyyy-MM-dd");
            const dayItems  = itemsByDate[key] ?? [];
            const isToday   = isSameDay(day, new Date());
            const isSelected = selected ? isSameDay(day, selected) : false;
            const isOther   = !isSameMonth(day, currentMonth);
            const hasApproval = dayItems.some(
              i => (i as Record<string, unknown>).status === "aguardando_aprovacao",
            );

            return (
              <div
                key={key}
                onClick={() => setSelected(isSelected ? null : day)}
                className={cn(
                  "min-h-[70px] p-1.5 border-b border-r border-[#1E293B] cursor-pointer transition-colors",
                  "hover:bg-[#1E293B]/50",
                  isOther    && "opacity-30",
                  isSelected && "bg-[#1E293B]/70",
                  hasApproval && "ring-1 ring-inset ring-violet-500/30",
                )}
              >
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                  isToday && "bg-violet-600 text-white",
                  !isToday && "text-slate-300",
                )}>
                  {format(day, "d")}
                </div>
                {dayItems.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {dayItems.slice(0, 4).map((item, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_DOT[(item as Record<string, unknown>).status as string] ?? "bg-slate-500",
                        )}
                      />
                    ))}
                    {dayItems.length > 4 && (
                      <span className="text-[9px] text-slate-500">+{dayItems.length - 4}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {[
          { color: "bg-violet-500", label: "Aguardando aprovação" },
          { color: "bg-emerald-500", label: "Aprovado" },
          { color: "bg-green-500", label: "Publicado" },
          { color: "bg-blue-500", label: "Em produção" },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", l.color)} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Painel do dia selecionado */}
      {selected && selectedItems.length > 0 && (
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-slate-300">
            {format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
          {selectedItems.map(item => {
            const i = item as Record<string, unknown>;
            return (
              <div
                key={i.id as string}
                className="flex items-center gap-3 p-2 rounded-lg bg-[#1E293B] hover:bg-[#243044] cursor-pointer transition-colors"
                onClick={() => onItemClick?.(i.id as string)}
              >
                <div className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT[i.status as string] ?? "bg-slate-500")} />
                <p className="text-sm text-slate-200 truncate flex-1">{i.title as string}</p>
                {i.status === "aguardando_aprovacao" && (
                  <Badge variant="outline" className="text-[10px] border-violet-500/50 text-violet-300 shrink-0">
                    Aprovar
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (
        <p className="text-center text-xs text-slate-500 py-2">Carregando...</p>
      )}
    </div>
  );
}

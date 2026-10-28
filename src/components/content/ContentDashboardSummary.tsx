/**
 * ContentDashboardSummary
 * Cards de sumário de conteúdo. Reutilizável na visão geral e no hub do cliente.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Progress }          from "@/components/ui/progress";
import { Skeleton }          from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryData {
  /** Total de itens no mês / planejados */
  total_items:           number;
  in_production:         number;
  awaiting_approval:     number;
  published:             number;
  /** Publicados no mês anterior (para comparação) */
  published_prev_month?: number;
  overdue_production:    number;
  /** Para o card "Entregáveis do mês": itens publicados / meta mensal */
  monthly_goal?:         number;
}

interface ContentDashboardSummaryProps {
  data:    SummaryData | null;
  loading: boolean;
}

function TrendBadge({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === 0) return null;
  const diff = current - previous;
  const pct  = Math.round(Math.abs(diff / previous) * 100);
  if (diff === 0) return <span className="text-[11px] text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />igual ao mês anterior</span>;
  if (diff > 0)   return <span className="text-[11px] text-emerald-500 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{pct}% vs. mês anterior</span>;
  return              <span className="text-[11px] text-red-400 flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />-{pct}% vs. mês anterior</span>;
}

export function ContentDashboardSummary({ data, loading }: ContentDashboardSummaryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const goal          = data.monthly_goal ?? data.total_items;
  const publishedPct  = goal > 0 ? Math.round((data.published / goal) * 100) : 0;

  const cards = [
    {
      label:     "Entregáveis do mês",
      value:     `${data.published} / ${goal}`,
      sub:       `${publishedPct}% concluído`,
      progress:  publishedPct,
      highlight: false,
    },
    {
      label:     "Em produção",
      value:     data.in_production,
      sub:       data.overdue_production > 0
                   ? <span className="text-red-400">⚠ {data.overdue_production} atrasado{data.overdue_production !== 1 ? "s" : ""}</span>
                   : "Em dia",
      highlight: false,
    },
    {
      label:     "Aguardando cliente",
      value:     data.awaiting_approval,
      sub:       data.awaiting_approval > 0
                   ? <span className="text-violet-400">{data.awaiting_approval} aprovação{data.awaiting_approval !== 1 ? "s" : ""} pendente{data.awaiting_approval !== 1 ? "s" : ""}</span>
                   : "Nenhuma pendência",
      highlight: data.awaiting_approval > 0,
    },
    {
      label:     "Publicados",
      value:     data.published,
      sub:       <TrendBadge current={data.published} previous={data.published_prev_month} />,
      highlight: false,
    },
    {
      label:     "Total de itens",
      value:     data.total_items,
      sub:       "ativos no módulo",
      highlight: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card, i) => (
        <Card
          key={i}
          className={cn(
            "border-border/60 transition-colors",
            card.highlight && "border-violet-500/40 bg-violet-50/30 dark:bg-violet-900/10",
          )}
        >
          <CardContent className="p-4 space-y-1.5">
            <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
            <p className="text-2xl font-black text-foreground tabular-nums">{card.value}</p>
            {card.progress !== undefined ? (
              <div className="space-y-1">
                <Progress value={card.progress} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">{card.sub}</p>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground min-h-[16px]">{card.sub}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

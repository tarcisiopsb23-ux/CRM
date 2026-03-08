import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeadsPerStage } from "@/hooks/useSalesAnalytics";

const FUNNEL_COLORS: Record<string, string> = {
  leads_recebidos: "#6A2DBD",
  qualificados: "#8B5CF6",
  reuniao_agendada: "#A78BFA",
  emissao_contrato: "#C4B5FD",
  efetivados: "#22c55e",
  desqualificado: "#ef4444",
  reuniao_sem_sucesso: "#f97316",
};

interface PipelineFunnelProps {
  data: LeadsPerStage[];
  loading?: boolean;
}

export function PipelineFunnel({ data, loading }: PipelineFunnelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-muted-foreground">Visão do Pipeline</h3>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-muted-foreground">Visão do Pipeline</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item) => {
            const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            const color = FUNNEL_COLORS[item.stage] ?? "var(--primary)";
            return (
              <div key={item.stage} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {item.count} leads
                    {item.revenue > 0 && (
                      <span className="ml-2">
                        R$ {item.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-8 rounded-md bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2")}
                    style={{
                      width: `${Math.max(pct, item.count > 0 ? 8 : 0)}%`,
                      backgroundColor: color,
                      color: item.count > 0 ? "#fff" : "transparent",
                    }}
                  >
                    {item.count > 0 && (
                      <span className="text-xs font-medium tabular-nums">{item.count}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-4">Total: {total} leads</p>
      </CardContent>
    </Card>
  );
}

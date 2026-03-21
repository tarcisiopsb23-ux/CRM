import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import type { LeadsPerStage } from "@/hooks/useSalesAnalytics";

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

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-muted-foreground">Visão do Pipeline</h3>
      </CardHeader>
      <CardContent>
        <ModernFunnel 
          steps={data.map((item, idx) => ({
            label: item.label,
            value: `${item.count} leads`,
            color: item.stage === 'efetivados' ? "bg-emerald-500/10" : 
                   item.stage === 'desqualificado' ? "bg-red-500/10" : 
                   "bg-blue-500/5",
            width: `${100 - (idx * 5)}%`,
            percentage: idx < data.length - 1 ? 
              (data[idx].count > 0 ? ((data[idx+1].count / data[idx].count) * 100).toFixed(1) + "%" : "0%") : undefined,
            rateLabel: "Conv."
          }))}
        />
        <p className="text-xs text-muted-foreground mt-4 text-center">Total acumulado: {total} leads</p>
      </CardContent>
    </Card>
  );
}

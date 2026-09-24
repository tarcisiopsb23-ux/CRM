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
      <Card className="mb-6">
        <CardContent className="pt-10 pb-10">
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card className="mb-6">
      <CardContent className="pt-10 pb-10">
        <ModernFunnel 
          horizontal
          steps={data.map((item, idx) => ({
            label: item.label,
            value: `${item.count} leads`,
            color: item.stage === 'efetivados' ? "bg-emerald-100 dark:bg-emerald-900/30" : 
                   item.stage === 'desqualificado' ? "bg-red-100 dark:bg-red-900/30" : 
                   "bg-blue-100 dark:bg-blue-900/30",
            percentage: idx < data.length - 1 ? 
              (data[idx].count > 0 ? ((data[idx+1].count / data[idx].count) * 100).toFixed(1) + "%" : "0%") : undefined,
            rateLabel: "Conv.",
            isLast: idx === data.length - 1
          }))}
        />
        <p className="text-xs text-muted-foreground mt-6 text-center">Total acumulado: {total} leads</p>
      </CardContent>
    </Card>
  );
}

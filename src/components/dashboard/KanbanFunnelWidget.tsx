import { ModernFunnel } from "@/components/ui/modern-funnel";
import { DashboardWidget } from "./DashboardWidget";
import type { KanbanFunnelItem } from "@/hooks/useDashboard";

interface KanbanFunnelWidgetProps {
  data: KanbanFunnelItem[];
  loading?: boolean;
}

export function KanbanFunnelWidget({ data, loading }: KanbanFunnelWidgetProps) {
  if (loading) {
    return (
      <DashboardWidget title="Funil Kanban">
        <div className="h-[240px] flex items-center justify-center text-gray-400">
          Carregando...
        </div>
      </DashboardWidget>
    );
  }
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <DashboardWidget title="Funil Kanban">
      <ModernFunnel 
        steps={data.map((item, idx) => ({
          label: item.label,
          value: `${item.count} leads`,
          color: idx === 0 ? "bg-slate-50" : 
                 idx === data.length - 1 ? "bg-emerald-500/10" : "bg-blue-500/5",
          width: `${100 - (idx * 5)}%`,
          percentage: idx < data.length - 1 ? 
            (data[idx].count > 0 ? ((data[idx+1].count / data[idx].count) * 100).toFixed(1) + "%" : "0%") : undefined,
          rateLabel: idx < data.length - 1 ? "Conv." : undefined,
          isLast: idx === data.length - 1,
        }))}
      />
      <p className="text-xs text-gray-500 mt-4 text-center">
        Total acumulado: {total} leads
      </p>
    </DashboardWidget>
  );
}

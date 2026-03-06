import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { DashboardWidget } from "./DashboardWidget";
import type { KanbanFunnelItem } from "@/hooks/useDashboard";

const COLORS = [
  "#6A2DBD",
  "#8B5CF6",
  "#A78BFA",
  "#C4B5FD",
  "#DDD6FE",
  "#EDE9FE",
  "#F5F3FF",
];

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
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fontSize: 11 }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Total: {total} leads
      </p>
    </DashboardWidget>
  );
}

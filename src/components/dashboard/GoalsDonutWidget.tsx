import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { DashboardWidget } from "./DashboardWidget";

const COLORS = ["#6A2DBD", "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE"];

interface DonutItem {
  name: string;
  value: number;
  total: number;
  fill?: string;
}

interface GoalsDonutWidgetProps {
  data: DonutItem[];
  loading?: boolean;
}

export function GoalsDonutWidget({ data, loading }: GoalsDonutWidgetProps) {
  if (loading) {
    return (
      <DashboardWidget title="Metas da Agência">
        <div className="h-[220px] flex items-center justify-center text-gray-400">
          Carregando...
        </div>
      </DashboardWidget>
    );
  }
  const chartData = data.map((d, i) => ({
    name: d.name,
    value: d.value,
    fill: COLORS[i % COLORS.length],
  }));
  return (
    <DashboardWidget title="Metas da Agência">
      {chartData.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
          Nenhuma meta no período
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={chartData[i].fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number | undefined) => (v ?? 0).toLocaleString("pt-BR") } />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardWidget>
  );
}

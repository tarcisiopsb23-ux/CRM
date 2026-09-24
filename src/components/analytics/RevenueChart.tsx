import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { LeadsPerStage } from "@/hooks/useSalesAnalytics";

const COLORS = [
  "#6A2DBD",
  "#8B5CF6",
  "#A78BFA",
  "#C4B5FD",
  "#22c55e",
  "#ef4444",
  "#f97316",
];

interface RevenueChartProps {
  data: LeadsPerStage[];
  loading?: boolean;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

export function RevenueChart({ data, loading }: RevenueChartProps) {
  const chartData = data.filter((d) => d.revenue > 0);

  if (loading) {
    return (
      <Card className="h-full mb-6">
        <CardHeader className="pb-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Receita por Estágio
          </h3>
        </CardHeader>
        <CardContent className="h-full pt-0 pb-4">
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="h-full mb-6">
        <CardHeader className="pb-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Receita por Estágio
          </h3>
        </CardHeader>
        <CardContent className="h-full pt-0 pb-4">
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Nenhuma receita nos estágios.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full mb-6">
      <CardHeader className="pb-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          Receita por Estágio
        </h3>
      </CardHeader>
      <CardContent className="h-full pt-0 pb-4">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tickFormatter={(v) => formatCurrency(v)}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={100}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: number) => [
                  formatCurrency(value),
                  "Receita",
                ]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

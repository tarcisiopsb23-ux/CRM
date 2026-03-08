import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface LeadsByMonthChartProps {
  data: { month: string; count: number }[];
  loading?: boolean;
}

function formatMonth(key: string): string {
  const [y, m] = key.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const i = parseInt(m, 10) - 1;
  return i >= 0 && i < 12 ? `${months[i]}/${y?.slice(-2) ?? ""}` : key;
}

export function LeadsByMonthChart({ data, loading }: LeadsByMonthChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatMonth(d.month) }));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-sm font-medium text-muted-foreground">
            Leads criados por mês
          </h3>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-medium text-muted-foreground">
          Leads criados por mês
        </h3>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [value, "Leads"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" fill="#6A2DBD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const data = [
  { name: "Atingido", value: 68 },
  { name: "Restante", value: 32 },
];

export function GoalDonut() {
  return (
    <div className="stat-card flex flex-col items-center">
      <h3 className="font-display text-lg font-semibold text-foreground mb-2 self-start">Meta da Agência</h3>
      <p className="text-sm text-muted-foreground self-start mb-4">R$ 340.000 / R$ 500.000</p>
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill="hsl(265, 62%, 46%)" />
              <Cell fill="hsl(228, 25%, 93%)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-display text-foreground">68%</span>
          <span className="text-xs text-muted-foreground">atingido</span>
        </div>
      </div>
    </div>
  );
}

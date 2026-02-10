import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const data = [
  { stage: "Recebidos", value: 142 },
  { stage: "Qualificados", value: 87 },
  { stage: "Reunião", value: 34 },
  { stage: "Contrato", value: 21 },
  { stage: "Fechados", value: 14 },
];

const COLORS = [
  "hsl(265, 62%, 46%)",
  "hsl(265, 62%, 52%)",
  "hsl(265, 62%, 58%)",
  "hsl(265, 62%, 64%)",
  "hsl(152, 60%, 42%)",
];

export function FunnelChart() {
  return (
    <div className="stat-card">
      <h3 className="font-display text-lg font-semibold text-foreground mb-4">Funil de Vendas</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "hsl(215, 16%, 47%)" }} />
          <YAxis dataKey="stage" type="category" tick={{ fontSize: 12, fill: "hsl(215, 16%, 47%)" }} width={90} />
          <Tooltip
            contentStyle={{
              background: "hsl(0, 0%, 100%)",
              border: "1px solid hsl(220, 20%, 90%)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={32}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

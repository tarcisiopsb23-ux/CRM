// src/components/comercial/ComercialFunil.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, FunnelChart, Funnel, Tooltip, Cell, LabelList } from "recharts";
import type { FunnelStep } from "@/hooks/useComercialDashboard";

const FUNNEL_COLORS = ["#6366f1", "#3b82f6", "#f59e0b", "#10b981"];

interface ComercialFunilProps {
  steps: FunnelStep[];
}

export function ComercialFunil({ steps }: ComercialFunilProps) {
  const data = steps.map((step, index) => ({
    ...step,
    fill: FUNNEL_COLORS[index % FUNNEL_COLORS.length],
  }));

  return (
    <Card className="mb-4">
      <CardHeader className="pb-4">
        <CardTitle>Funil de Propostas</CardTitle>
      </CardHeader>
      <CardContent className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip />
              <Funnel data={data} dataKey="count">
                <LabelList position="right" fill="#000" stroke="none" dataKey="label" />
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
  );
}

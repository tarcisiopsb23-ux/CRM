import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

const items = [
  { label: "A Receber (mês)", value: "R$ 85.000", icon: TrendingUp, color: "text-success" },
  { label: "A Pagar (mês)", value: "R$ 42.000", icon: TrendingDown, color: "text-destructive" },
  { label: "Inadimplência", value: "R$ 12.300", icon: AlertTriangle, color: "text-warning" },
];

export function FinancialSummary() {
  return (
    <div className="stat-card">
      <h3 className="font-display text-lg font-semibold text-foreground mb-4">Resumo Financeiro</h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold font-display text-foreground">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

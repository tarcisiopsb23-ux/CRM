import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcValueComparison } from "@/lib/proposalValueCalc";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface ServiceItem {
  name: string;
  value: number;
  is_bonus: boolean;
}

interface Props {
  services: ServiceItem[];
  planValue: number;
  mode: "editor" | "viewer";
}

export function PropostaValueComparison({ services, planValue, mode }: Props) {
  const { totalIndividual, savings, savingsPercent } = calcValueComparison(
    services,
    planValue
  );

  if (services.length === 0) return null;

  return (
    <Card
      className={
        mode === "viewer" ? "border-primary/20 bg-card/80 backdrop-blur" : ""
      }
    >
      <CardHeader>
        <CardTitle className="text-base">Comparativo de Valor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {services.map((svc, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <div className="flex items-start gap-2">
              {svc.is_bonus ? (
                <span className="mt-0.5">🎁</span>
              ) : (
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              )}
              <span className={svc.is_bonus ? "text-amber-700" : ""}>
                {svc.name}
              </span>
            </div>
            {svc.is_bonus ? (
              <div className="text-right shrink-0">
                {mode === "viewer" ? (
                  <>
                    <span className="line-through text-muted-foreground text-xs">
                      {fmtCurrency(svc.value)}
                    </span>
                    <span className="ml-2 font-bold text-emerald-600">
                      R$&nbsp;0,00
                    </span>
                    <span className="ml-1 text-xs text-amber-600">
                      (Bônus Exclusivo)
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {fmtCurrency(svc.value)}
                  </span>
                )}
              </div>
            ) : (
              <span className="font-semibold shrink-0">
                {fmtCurrency(svc.value)}
              </span>
            )}
          </div>
        ))}

        <div className="border-t pt-3 space-y-2 mt-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor individual:</span>
            <span
              className={
                mode === "viewer"
                  ? "line-through text-muted-foreground"
                  : "font-semibold"
              }
            >
              {fmtCurrency(totalIndividual)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>Valor do plano:</span>
            <span className="text-primary text-lg">
              {fmtCurrency(planValue)}
            </span>
          </div>
          {savings > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
              <p className="text-xs text-emerald-600 font-medium">
                Economia total
              </p>
              <p className="text-2xl font-bold text-emerald-600">
                {fmtCurrency(savings)}
              </p>
              <p className="text-xs text-emerald-500">
                {savingsPercent.toFixed(0)}% de desconto
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

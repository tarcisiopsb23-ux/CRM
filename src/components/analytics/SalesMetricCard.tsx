import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SalesMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
  loading?: boolean;
  format?: "number" | "currency";
}

export function SalesMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  loading,
  format = "number",
}: SalesMetricCardProps) {
  const variantStyles = {
    default: "text-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-12 flex items-center text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {Icon && (
                <div className="p-2 rounded-lg bg-muted">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              )}
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  variantStyles[variant]
                )}
              >
                {typeof value === "number"
                  ? format === "currency"
                    ? `R$ ${value.toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}`
                    : value.toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })
                  : value}
              </span>
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

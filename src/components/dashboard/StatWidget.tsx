import { DashboardWidget } from "./DashboardWidget";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatWidgetProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
  loading?: boolean;
}

export function StatWidget({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  loading,
}: StatWidgetProps) {
  const variantStyles = {
    default: "text-gray-dark",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };
  return (
    <DashboardWidget title={title}>
      {loading ? (
        <div className="h-12 flex items-center text-gray-400">Carregando...</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="p-2 rounded-lg bg-gray-100">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            )}
            <span className={cn("text-2xl font-bold", variantStyles[variant])}>
              {typeof value === "number"
                ? value.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : value}
            </span>
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </>
      )}
    </DashboardWidget>
  );
}

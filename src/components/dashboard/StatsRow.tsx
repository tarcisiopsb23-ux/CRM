import { Users, UserCheck, CalendarCheck, FileText, CheckCircle } from "lucide-react";
import { useLeadFunnel } from "@/hooks/useLeadsBySource";
import { useOrganization } from "@/hooks/useOrganization";

const ICONS = [Users, UserCheck, CalendarCheck, FileText, CheckCircle];

export function StatsRow() {
  const organizationId = useOrganization();
  const { data: stages = [], isLoading } = useLeadFunnel(organizationId);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {stages.map((s, i) => {
        const Icon = ICONS[i] ?? Users;
        const prev = stages[i - 1]?.count ?? null;
        const change = prev !== null && prev > 0
          ? `${(((s.count - prev) / prev) * 100).toFixed(0)}%`
          : null;
        return (
          <div key={s.id} className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                <Icon className="h-5 w-5 text-accent-foreground" />
              </div>
              {change !== null && (
                <span className="text-xs font-medium text-success">{change}</span>
              )}
            </div>
            <p className="text-2xl font-bold font-display text-foreground">
              {isLoading ? "—" : s.count}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        );
      })}
    </div>
  );
}

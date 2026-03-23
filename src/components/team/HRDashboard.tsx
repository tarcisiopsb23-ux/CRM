import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Users, DollarSign, TrendingUp, Bell } from "lucide-react";
import { useProfiles } from "@/hooks/useProfiles";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatBRL } from "@/lib/formatters";
import { Dashboard360Widget } from "@/components/avaliacao360/Dashboard360Widget";

interface Props {
  organizationId: string;
}

function useAllAbsences(orgId: string) {
  return useQuery({
    queryKey: ["employee_absences_all", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_absences")
        .select("*")
        .eq("organization_id", orgId)
        .eq("status", "pendente");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });
}

export function HRDashboard({ organizationId }: Props) {
  const { data: profiles = [] } = useProfiles(organizationId);
  const { data: absences = [] } = useAllAbsences(organizationId);
  const { data: goals = [] } = useGoals(organizationId);

  const activeProfiles = useMemo(() => profiles.filter((p) => p.is_active), [profiles]);

  const totalFolha = useMemo(() =>
    activeProfiles.reduce((sum, p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      return sum + (Number(meta.base_salary) || 0);
    }, 0),
    [activeProfiles]
  );

  // Alertas: férias pendentes vencendo em 30 dias
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alertsFerias = absences.filter((a) => {
    if (a.tipo !== "ferias") return false;
    const fim = new Date(a.data_fim);
    return fim <= in30Days;
  });

  // Metas próximas do prazo (7 dias)
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const alertsMetas = goals.filter((g) => {
    const end = new Date(g.period_end);
    return end <= in7Days && end >= today && g.current_value < g.target_value;
  });

  const totalAlerts = alertsFerias.length + alertsMetas.length;

  // Ranking de performance (por nota_final média das avaliações)
  // Simplificado: usar commission_rate como proxy de performance quando não há avaliações
  const ranking = useMemo(() =>
    activeProfiles
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        score: Number((p as any).commission_rate ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
    [activeProfiles]
  );

  return (
    <div className="space-y-6">
      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Colaboradores Ativos"
          value={String(activeProfiles.length)}
          color="text-blue-600"
        />
        <MetricCard
          icon={DollarSign}
          label="Custo Total Folha"
          value={formatBRL(totalFolha)}
          color="text-emerald-600"
        />
        <MetricCard
          icon={TrendingUp}
          label="Metas Ativas"
          value={String(goals.filter((g) => new Date(g.period_end) >= today).length)}
          color="text-purple-600"
        />
        <MetricCard
          icon={Bell}
          label="Alertas Ativos"
          value={String(totalAlerts)}
          color={totalAlerts > 0 ? "text-amber-600" : "text-muted-foreground"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Ranking de performance */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              Colaboradores
            </p>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum colaborador ativo</p>
            ) : (
              <div className="space-y-2">
                {ranking.map((r, i) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                      <span className="font-medium">{r.name}</span>
                    </div>
                    {r.score > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {r.score}% comissão
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              Alertas
            </p>
            {totalAlerts === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta ativo</p>
            ) : (
              <div className="space-y-2">
                {alertsFerias.map((a) => {
                  const profile = profiles.find((p) => p.id === a.collaborator_id);
                  return (
                    <div key={a.id} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        Férias de <strong>{profile?.full_name ?? "colaborador"}</strong> vence em{" "}
                        {new Date(a.data_fim).toLocaleDateString("pt-BR")} (pendente)
                      </span>
                    </div>
                  );
                })}
                {alertsMetas.map((g) => (
                  <div key={g.id} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      Meta <strong>{g.title}</strong> encerra em{" "}
                      {new Date(g.period_end).toLocaleDateString("pt-BR")} —{" "}
                      {Math.round((g.current_value / g.target_value) * 100)}% atingido
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Widget Avaliação 360 */}
      <Dashboard360Widget organizationId={organizationId} />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 shrink-0 ${color}`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

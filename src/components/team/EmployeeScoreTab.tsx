import { useMemo } from "react";
import { useEmployeeEvaluations } from "@/hooks/useEmployeeEvaluations";
import { useCommissionEntries } from "@/hooks/useCommissionEntries";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { Loader2, TrendingUp } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import type { ProfileRow } from "@/hooks/useProfiles";

interface Props {
  profile: ProfileRow;
}

// Score composto: 50% nota_final média + 30% % metas atingidas + 20% comportamento médio
function calcScore(notaFinal: number, goalPct: number, comportamento: number): number {
  return Math.round((notaFinal * 0.5 + goalPct / 10 * 0.3 + comportamento * 0.2) * 10) / 10;
}

export function EmployeeScoreTab({ profile }: Props) {
  const orgId = useOrganization();
  const { data: evaluations = [], isLoading: loadingEvals } = useEmployeeEvaluations(profile.id);
  const { data: entries = [], isLoading: loadingEntries } = useCommissionEntries(profile.id);
  const { data: goals = [], isLoading: loadingGoals } = useGoals(orgId);

  const isLoading = loadingEvals || loadingEntries || loadingGoals;

  const score = useMemo(() => {
    if (evaluations.length === 0) return null;

    const avgNota = evaluations.reduce((s, e) => s + e.nota_final, 0) / evaluations.length;
    const avgComportamento = evaluations.reduce((s, e) => s + e.comportamento, 0) / evaluations.length;

    const profileGoals = goals.filter((g) => g.assigned_to === profile.id && g.target_value > 0);
    const avgGoalPct = profileGoals.length > 0
      ? profileGoals.reduce((s, g) => s + Math.min((g.current_value / g.target_value) * 100, 150), 0) / profileGoals.length
      : 0;

    return calcScore(avgNota, avgGoalPct, avgComportamento);
  }, [evaluations, goals, profile.id]);

  const timeline = useMemo(() => {
    return evaluations.slice(0, 6).map((e) => ({
      label: e.periodo,
      nota: e.nota_final,
      comportamento: e.comportamento,
    }));
  }, [evaluations]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Score atual */}
      <div className="flex flex-col items-center py-6 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <TrendingUp className="h-4 w-4" />
          <span>Collaborator Score</span>
        </div>
        {score !== null ? (
          <span className="text-5xl font-bold text-foreground">{score.toFixed(1)}</span>
        ) : (
          <span className="text-muted-foreground text-sm">Sem avaliações suficientes</span>
        )}
        {score !== null && (
          <p className="text-xs text-muted-foreground">
            Composição: 50% desempenho · 30% metas · 20% comportamento
          </p>
        )}
      </div>

      {/* Histórico de avaliações */}
      {timeline.length > 0 && (
        <section>
          <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Evolução por Período</p>
          <div className="space-y-2">
            {timeline.map((t) => (
              <div key={t.label} className="flex items-center justify-between text-sm border rounded-lg px-4 py-2">
                <span className="font-medium">{t.label}</span>
                <div className="flex gap-4 text-muted-foreground text-xs">
                  <span>Nota: <strong className="text-foreground">{t.nota}</strong></span>
                  <span>Comportamento: <strong className="text-foreground">{t.comportamento}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comissões como linha do tempo de eventos */}
      {entries.length > 0 && (
        <section>
          <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Histórico de Comissões</p>
          <div className="space-y-2">
            {entries.slice(0, 6).map((e) => {
              const [y, mo] = e.month_reference.split("-");
              const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
              const label = `${months[Number(mo) - 1]}/${y}`;
              return (
                <div key={e.id} className="flex items-center justify-between text-sm border rounded-lg px-4 py-2">
                  <span className="font-medium">{label}</span>
                  <div className="flex gap-4 text-muted-foreground text-xs">
                    {e.goal_achieved_pct != null && (
                      <span>Meta: <strong className="text-foreground">{e.goal_achieved_pct}%</strong></span>
                    )}
                    <span>Status: <strong className="text-foreground capitalize">{e.status}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useCiclos, useResultados } from "@/hooks/useAvaliacao360";
import { useProfiles } from "@/hooks/useProfiles";

interface Props {
  organizationId: string;
}

export function Dashboard360Widget({ organizationId }: Props) {
  const { data: ciclos = [], isLoading: loadingCiclos } = useCiclos(organizationId);
  const { data: profiles = [] } = useProfiles(organizationId);

  // Último ciclo encerrado
  const ultimoCiclo = useMemo(
    () => ciclos.filter((c) => c.status === "encerrado")[0] ?? null,
    [ciclos]
  );

  const { data: resultados = [], isLoading: loadingResultados } = useResultados(ultimoCiclo?.id);

  const ranking = useMemo(() => {
    return resultados
      .filter((r) => r.score_final !== null)
      .sort((a, b) => (b.score_final ?? 0) - (a.score_final ?? 0))
      .slice(0, 5)
      .map((r) => {
        const profile = profiles.find((p) => p.id === r.avaliado_id);
        const gap =
          r.media_autoavaliacao !== null && r.media_geral !== null
            ? r.media_autoavaliacao - r.media_geral
            : null;
        return { ...r, name: profile?.full_name ?? "—", gap };
      });
  }, [resultados, profiles]);

  const isLoading = loadingCiclos || loadingResultados;

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Avaliação 360° — {ultimoCiclo ? ultimoCiclo.nome : "Último Ciclo"}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !ultimoCiclo ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum ciclo encerrado ainda.
          </p>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum resultado consolidado.
          </p>
        ) : (
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5 text-right text-xs">{i + 1}.</span>
                  <span className="font-medium">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    Score: {r.score_final?.toFixed(2)}
                  </Badge>
                  {r.gap !== null && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${r.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}
                    >
                      Gap: {r.gap > 0 ? "+" : ""}{r.gap.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

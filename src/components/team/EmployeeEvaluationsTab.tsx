import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Star } from "lucide-react";
import { useResultadoDoColaborador } from "@/hooks/useAvaliacao360";
import { useAvaliacoesTecnicas } from "@/hooks/useAvaliacoesTecnicas";
import { useAuth } from "@/contexts/AuthContext";
import { AvaliacaoTecnicaDialog } from "./AvaliacaoTecnicaDialog";
import { CLASSIFICACAO_CONFIG } from "@/types/avaliacao360";
import type { ProfileRow } from "@/hooks/useProfiles";

interface Props {
  profile: ProfileRow;
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export function EmployeeEvaluationsTab({ profile }: Props) {
  const { profile: currentProfile } = useAuth();
  const { data: resultados = [], isLoading: loadingResultados } = useResultadoDoColaborador(profile.id);
  const { data: avaliacoesTecnicas = [], isLoading: loadingTecnicas } = useAvaliacoesTecnicas(profile.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canCreateTecnica =
    currentProfile?.role === "admin" || currentProfile?.role === "owner";

  return (
    <div className="space-y-6">
      {/* ── Seção: Avaliações 360 ── */}
      <section>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Avaliações 360
        </p>

        {loadingResultados ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum resultado de Avaliação 360° registrado.
          </p>
        ) : (
          <div className="space-y-2">
            {resultados.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{(r as any).ciclo?.nome ?? "Ciclo"}</p>
                      <p className="text-xs text-muted-foreground">
                        {(r as any).ciclo?.data_inicio
                          ? new Date((r as any).ciclo.data_inicio).toLocaleDateString("pt-BR")
                          : ""}{" "}
                        –{" "}
                        {(r as any).ciclo?.data_fim
                          ? new Date((r as any).ciclo.data_fim).toLocaleDateString("pt-BR")
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.classificacao && CLASSIFICACAO_CONFIG[r.classificacao] && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${CLASSIFICACAO_CONFIG[r.classificacao].bg} ${CLASSIFICACAO_CONFIG[r.classificacao].color}`}>
                          {CLASSIFICACAO_CONFIG[r.classificacao].label}
                        </span>
                      )}
                      {r.score_final !== null && (
                        <Badge variant="secondary" className="text-xs">
                          Score: {r.score_final.toFixed(1)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs text-muted-foreground">
                    <div><span>Auto: </span><strong>{r.media_autoavaliacao?.toFixed(1) ?? "—"}</strong></div>
                    <div><span>Pares: </span><strong>{r.media_pares?.toFixed(1) ?? "—"}</strong></div>
                    <div><span>Gestor: </span><strong>{r.media_gestor?.toFixed(1) ?? "—"}</strong></div>
                    <div><span>Geral: </span><strong>{r.media_geral?.toFixed(1) ?? "—"}</strong></div>
                  </div>

                  {r.feedback_final && (
                    <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                      <p className="font-medium mb-0.5">Feedback do Gestor</p>
                      <p className="text-muted-foreground">{r.feedback_final}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <hr className="border-border" />

      {/* ── Seção: Avaliações Técnicas ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Avaliações Técnicas
          </p>
          {canCreateTecnica && (
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Avaliação Técnica
            </Button>
          )}
        </div>

        {loadingTecnicas ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : avaliacoesTecnicas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma avaliação técnica registrada.
          </p>
        ) : (
          <div className="space-y-2">
            {avaliacoesTecnicas.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.data).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRating value={a.nota_geral} />
                      <Badge variant="outline" className="text-xs">{a.nota_geral}/5</Badge>
                    </div>
                  </div>

                  {a.criterios.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {a.criterios.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{c.nome}</span>
                          <div className="flex items-center gap-1">
                            <StarRating value={c.nota} />
                            <span>{c.nota}/5</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {a.observacoes && (
                    <p className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                      {a.observacoes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {canCreateTecnica && profile.organization_id && (
        <AvaliacaoTecnicaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          colaboradorId={profile.id}
          organizationId={profile.organization_id}
          colaboradorNome={profile.full_name}
        />
      )}
    </div>
  );
}

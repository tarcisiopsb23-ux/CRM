import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { useSaveFeedbackFinal } from "@/hooks/useAvaliacao360";
import { useAuth } from "@/contexts/AuthContext";
import { CLASSIFICACAO_CONFIG } from "@/types/avaliacao360";
import type { ResultadoFinal360 } from "@/types/avaliacao360";

interface Props {
  resultado: ResultadoFinal360;
  canEditFeedback: boolean;
  profileName?: string;
}

function ScoreBadge({ value, max = 10 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = value / max;
  const color =
    pct >= 0.8 ? "bg-emerald-100 text-emerald-700" :
    pct >= 0.6 ? "bg-blue-100 text-blue-700" :
    pct >= 0.4 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {value.toFixed(1)}
    </span>
  );
}

function GapIndicator({ gap }: { gap: number }) {
  if (Math.abs(gap) < 0.5) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (gap > 0) return <TrendingUp className="h-3 w-3 text-amber-500" />;
  return <TrendingDown className="h-3 w-3 text-emerald-500" />;
}

export function ResultadoCard({ resultado, canEditFeedback, profileName }: Props) {
  const { profile } = useAuth();
  const saveFeedback = useSaveFeedbackFinal();
  const [editingFeedback, setEditingFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState(resultado.feedback_final ?? "");

  const gap =
    resultado.media_autoavaliacao !== null && resultado.media_geral !== null
      ? resultado.media_autoavaliacao - resultado.media_geral
      : null;

  const classificacaoConfig = resultado.classificacao
    ? CLASSIFICACAO_CONFIG[resultado.classificacao]
    : null;

  const handleSaveFeedback = async () => {
    await saveFeedback.mutateAsync({
      resultadoId: resultado.id,
      feedbackFinal: feedbackText,
      updatedBy: profile!.id,
    });
    toast.success("Feedback salvo");
    setEditingFeedback(false);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header com nome e classificação */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {profileName && <p className="font-semibold text-sm">{profileName}</p>}
          {classificacaoConfig && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${classificacaoConfig.bg} ${classificacaoConfig.color}`}>
              {classificacaoConfig.label}
            </span>
          )}
        </div>

        {/* Score principal */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Score Final</p>
            <span className="text-2xl font-bold">
              {resultado.score_final?.toFixed(1) ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">/10</span>
          </div>
          {resultado.score_360 && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Score 360°</p>
              <ScoreBadge value={resultado.score_360} />
            </div>
          )}
          {gap !== null && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Gap Auto vs Externo</p>
              <div className="flex items-center gap-1">
                <GapIndicator gap={gap} />
                <Badge variant="outline" className="text-xs">
                  {gap > 0 ? "+" : ""}{gap.toFixed(1)}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Médias por tipo de avaliador */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Autoavaliação</p>
            <ScoreBadge value={resultado.media_autoavaliacao} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pares</p>
            <ScoreBadge value={resultado.media_pares} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gestor</p>
            <ScoreBadge value={resultado.media_gestor} />
          </div>
          {resultado.media_liderado !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Liderados</p>
              <ScoreBadge value={resultado.media_liderado} />
            </div>
          )}
        </div>

        {/* Médias por categoria (360 e probatório) */}
        {(resultado.media_comportamental || resultado.media_performance || resultado.media_desenvolvimento) && (
          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Comportamental</p>
              <p className="text-xs font-medium mt-0.5">30%</p>
              <ScoreBadge value={resultado.media_comportamental} />
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Performance</p>
              <p className="text-xs font-medium mt-0.5">40%</p>
              <ScoreBadge value={resultado.media_performance} />
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Desenvolvimento</p>
              <p className="text-xs font-medium mt-0.5">30%</p>
              <ScoreBadge value={resultado.media_desenvolvimento} />
            </div>
          </div>
        )}

        {/* Feedback final */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Feedback Final
          </p>
          {editingFeedback ? (
            <div className="space-y-2">
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={3}
                placeholder="Escreva o feedback final para este colaborador..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveFeedback} disabled={saveFeedback.isPending}>
                  {saveFeedback.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  <Save className="h-3 w-3 mr-1" />
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingFeedback(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {resultado.feedback_final ?? "Nenhum feedback registrado."}
              </p>
              {canEditFeedback && (
                <Button size="sm" variant="ghost" onClick={() => setEditingFeedback(true)}>
                  Editar
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

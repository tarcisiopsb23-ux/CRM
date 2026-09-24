import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useSubmitAvaliacao } from "@/hooks/useAvaliacao360";
import {
  CRITERIOS_360,
  CRITERIOS_PROBATORIO,
  CRITERIOS_CHECKIN,
  requiresJustificativa,
  type Avaliacao360,
  type Criterio,
  type CicloTipo,
  type DecisaoProbatorio,
} from "@/types/avaliacao360";

interface Props {
  avaliacao: Avaliacao360;
  cicloTipo: CicloTipo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliadoNome?: string;
}

const TIPO_LABEL: Record<string, string> = {
  autoavaliacao: "Autoavaliação",
  gestor: "Avaliação de Gestor",
  pares: "Avaliação de Par",
  liderado: "Avaliação de Liderado",
};

const DECISAO_OPTIONS: { value: DecisaoProbatorio; label: string; color: string }[] = [
  { value: 'efetivado',         label: 'Efetivar',           color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'periodo_estendido', label: 'Estender Período',   color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'desligado',         label: 'Desligar',           color: 'bg-red-100 text-red-700 border-red-300' },
];

function NoteButton({ value, selected, onClick }: { value: number; selected: boolean; onClick: () => void }) {
  const color = selected
    ? value <= 3
      ? "bg-red-500 text-white border-red-500"
      : value <= 6
      ? "bg-yellow-500 text-white border-yellow-500"
      : "bg-emerald-500 text-white border-emerald-500"
    : "border-border hover:border-primary hover:text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-9 h-9 rounded-full border text-sm font-semibold transition-colors ${color}`}
    >
      {value}
    </button>
  );
}

export function AvaliacaoForm({ avaliacao, cicloTipo, open, onOpenChange, avaliadoNome }: Props) {
  const submit = useSubmitAvaliacao();

  const criterios = cicloTipo === 'checkin'
    ? CRITERIOS_CHECKIN
    : cicloTipo === 'probatorio'
    ? CRITERIOS_PROBATORIO
    : CRITERIOS_360;

  const [notas, setNotas] = useState<Record<string, number | null>>(
    Object.fromEntries(criterios.map((c) => [c.key, null]))
  );
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [pontoForte, setPontoForte] = useState("");
  const [pontoMelhoria, setPontoMelhoria] = useState("");
  const [decisao, setDecisao] = useState<DecisaoProbatorio | null>(null);

  const isCheckin = cicloTipo === 'checkin';
  const isProbatorio = cicloTipo === 'probatorio';
  const is360 = cicloTipo === '360';

  const handleSubmit = async () => {
    // Validar notas
    const invalidos = criterios.filter((c) => notas[c.key] === null);
    if (invalidos.length > 0) {
      toast.error(`Preencha a nota para: ${invalidos.map((c) => c.label).join(", ")}`);
      return;
    }

    // Validar justificativas obrigatórias
    for (const c of criterios) {
      const nota = notas[c.key]!;
      if (requiresJustificativa(nota) && !justificativas[c.key]?.trim()) {
        const motivo = nota <= 2 ? "nota baixa (1-2)" : "nota máxima (10)";
        toast.error(`Justificativa obrigatória para "${c.label}" — ${motivo}`);
        return;
      }
    }

    // Validar perguntas abertas (360 e probatório)
    if (!isCheckin) {
      if (!pontoForte.trim()) { toast.error("Informe o principal ponto forte"); return; }
      if (!pontoMelhoria.trim()) { toast.error("Informe o principal ponto de melhoria"); return; }
    }

    // Validar decisão probatória
    if (isProbatorio && avaliacao.tipo === 'gestor' && !decisao) {
      toast.error("Selecione a decisão para o período probatório");
      return;
    }

    await submit.mutateAsync({
      avaliacaoId: avaliacao.id,
      respostas: criterios.map((c) => ({
        criterio: c.key as Criterio,
        nota: notas[c.key]!,
        comentario: justificativas[c.key]?.trim() || null,
        ponto_forte: !isCheckin ? pontoForte.trim() || null : null,
        ponto_melhoria: !isCheckin ? pontoMelhoria.trim() || null : null,
      })),
      decisaoProbatorio: decisao,
    });

    toast.success("Avaliação enviada com sucesso");
    onOpenChange(false);
  };

  // Agrupar critérios por categoria
  const grupos = (() => {
    if (isCheckin) return [{ label: "Dimensões do Check-in", items: CRITERIOS_CHECKIN }];
    if (isProbatorio) {
      return [
        { label: "Adaptação ao Cargo",    items: CRITERIOS_PROBATORIO.filter((c) => c.categoria === 'adaptacao') },
        { label: "Integração Cultural",   items: CRITERIOS_PROBATORIO.filter((c) => c.categoria === 'integracao') },
        { label: "Potencial",             items: CRITERIOS_PROBATORIO.filter((c) => c.categoria === 'potencial') },
      ];
    }
    return [
      { label: "Comportamental (30%)",   items: CRITERIOS_360.filter((c) => c.categoria === 'comportamental') },
      { label: "Performance (40%)",      items: CRITERIOS_360.filter((c) => c.categoria === 'performance') },
      { label: "Desenvolvimento (30%)",  items: CRITERIOS_360.filter((c) => c.categoria === 'desenvolvimento') },
    ];
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {TIPO_LABEL[avaliacao.tipo] ?? avaliacao.tipo}
            <Badge variant="outline" className="text-xs font-normal">
              {isCheckin ? "Check-in" : isProbatorio ? "Probatório" : "360°"}
            </Badge>
          </DialogTitle>
          {avaliadoNome && (
            <div className="mt-1 px-3 py-2 rounded-md bg-primary/8 border border-primary/20">
              <p className="text-xs text-muted-foreground">Avaliando</p>
              <p className="text-base font-semibold text-primary leading-tight">{avaliadoNome}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {isCheckin
              ? "Escala 1-5 • Sem score formal"
              : "Escala 1-10 • Justificativa obrigatória para notas 1, 2 ou 10"}
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {grupos.map((grupo) => (
            <div key={grupo.label} className="space-y-4">
              <div className="flex items-center gap-2">
                <Separator className="flex-1" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {grupo.label}
                </span>
                <Separator className="flex-1" />
              </div>

              {grupo.items.map((criterio) => {
                const nota = notas[criterio.key];
                const needsJustif = nota !== null && requiresJustificativa(nota) && !isCheckin;
                const pergunta = 'pergunta' in criterio ? criterio.pergunta : criterio.label;
                const maxNota = isCheckin ? 5 : 10;

                return (
                  <div key={criterio.key} className="space-y-2">
                    <p className="text-sm font-medium">{pergunta}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {Array.from({ length: maxNota }, (_, i) => i + 1).map((n) => (
                        <NoteButton
                          key={n}
                          value={n}
                          selected={nota === n}
                          onClick={() => setNotas((prev) => ({ ...prev, [criterio.key]: n }))}
                        />
                      ))}
                    </div>

                    {needsJustif && (
                      <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <Textarea
                          placeholder={nota! <= 2
                            ? "Justifique a nota baixa..."
                            : "Justifique o destaque máximo..."}
                          value={justificativas[criterio.key] ?? ""}
                          onChange={(e) =>
                            setJustificativas((prev) => ({ ...prev, [criterio.key]: e.target.value }))
                          }
                          rows={2}
                          className="text-sm border-0 bg-transparent p-0 resize-none focus-visible:ring-0"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Perguntas abertas — 360 e probatório */}
          {!isCheckin && (
            <>
              <Separator />
              <div className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Perguntas Abertas
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Qual o principal ponto forte deste colaborador? *</p>
                  <Textarea
                    placeholder="Descreva o principal ponto forte..."
                    value={pontoForte}
                    onChange={(e) => setPontoForte(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Qual o principal ponto de melhoria? *</p>
                  <Textarea
                    placeholder="Descreva o principal ponto de melhoria..."
                    value={pontoMelhoria}
                    onChange={(e) => setPontoMelhoria(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </>
          )}

          {/* Decisão probatória — apenas gestor */}
          {isProbatorio && avaliacao.tipo === 'gestor' && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-semibold">Decisão do Período Probatório *</p>
                <div className="flex gap-2 flex-wrap">
                  {DECISAO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDecisao(opt.value)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                        decisao === opt.value
                          ? opt.color + " ring-2 ring-offset-1 ring-current"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Avaliação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// src/components/propostas/wizard/StepResumo.tsx
import { Loader2, Send, Save, CheckCircle2, AlertCircle, User, Package, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SECTION_LABELS, type SectionKey } from "@/types/proposals";
import type { WizardState } from "./wizardTypes";

// Seções variáveis que o closer preenche por proposta
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "diagnostico",
  "objetivos",
  "estrategia",
  "solucao",
  "escopo",
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  state: WizardState;
  isSaving: boolean;
  onSaveDraft: () => void;
  onCreateAndSend: () => void;
  onGoToStep: (step: number) => void;
}

export function StepResumo({ state, isSaving, onSaveDraft, onCreateAndSend, onGoToStep }: Props) {
  const { client, services, planValue, title, heroMessage, closerWhatsapp, schedule, sections } = state;

  const totalIndividual = services.filter((s) => !s.is_bonus).reduce((s, i) => s + i.value, 0);
  const effectiveValue  = planValue > 0 ? planValue : totalIndividual;
  const savings         = planValue > 0 && totalIndividual > planValue ? totalIndividual - planValue : 0;

  const filledSections = CLIENT_SECTION_KEYS.filter(
    (k) => (sections[k]?.content ?? "").trim().length > 0
  );
  const emptySections = CLIENT_SECTION_KEYS.filter(
    (k) => (sections[k]?.content ?? "").trim().length === 0
  );

  // ── Indicadores de completude ────────────────────────────────────────────
  const checks = [
    { ok: !!client,                  label: "Cliente selecionado",    step: 0 },
    { ok: services.length > 0,       label: "Serviços adicionados",   step: 1 },
    { ok: services.every(s => s.value > 0), label: "Valores preenchidos", step: 1 },
    { ok: !!title.trim(),            label: "Título definido",        step: 2 },
    { ok: !!closerWhatsapp.trim(),   label: "WhatsApp do closer",     step: 2 },
    { ok: (schedule.firstValue ?? 0) > 0, label: "Valor da parcela", step: 2 },
  ];

  const allGood = checks.every((c) => c.ok);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tudo certo — revise antes de criar</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Confira as informações abaixo. Clique em qualquer bloco para editar.
        </p>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => !c.ok && onGoToStep(c.step)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
              c.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400 cursor-default"
                : "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 cursor-pointer"
            }`}
          >
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {c.label}
            {!c.ok && <span className="ml-auto text-xs underline">Corrigir</span>}
          </button>
        ))}
      </div>

      {/* Bloco Cliente */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(0)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" /> Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {(client.name ?? "?")[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-sm">{client.name}</p>
                {client.company && (
                  <p className="text-xs text-muted-foreground">{client.company}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive">Nenhum cliente selecionado</p>
          )}
        </CardContent>
      </Card>

      {/* Bloco Serviços */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(1)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> Serviços
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.length === 0 ? (
            <p className="text-sm text-destructive">Nenhum serviço adicionado</p>
          ) : (
            <>
              {services.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate flex-1">
                    {s.name || <em className="text-destructive">Nome em branco</em>}
                    {s.is_bonus && (
                      <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">Bônus</Badge>
                    )}
                  </span>
                  <span className={`font-medium ml-4 shrink-0 ${s.value === 0 ? "text-destructive" : ""}`}>
                    {s.value > 0 ? fmt(s.value) : "Sem valor"}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total individual</span>
                  <span className="font-medium">{fmt(totalIndividual)}</span>
                </div>
                {planValue > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor do plano</span>
                    <span className="font-semibold text-primary">{fmt(planValue)}</span>
                  </div>
                )}
                {savings > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Economia do cliente</span>
                    <span className="font-bold">{fmt(savings)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bloco Proposta */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(2)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Proposta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Título</span>
            <span className={title.trim() ? "font-medium" : "text-destructive italic"}>
              {title.trim() || "Não definido"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">WhatsApp</span>
            <span className={closerWhatsapp.trim() ? "font-medium" : "text-destructive italic"}>
              {closerWhatsapp.trim() || "Não informado"}
            </span>
          </div>
          {heroMessage.trim() && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Mensagem</span>
              <span className="text-muted-foreground line-clamp-2 text-xs">{heroMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco Cronograma */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(2)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" /> Cronograma financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Parcela</p>
            <p className={`font-medium ${schedule.firstValue > 0 ? "" : "text-destructive"}`}>
              {schedule.firstValue > 0 ? fmt(schedule.firstValue) : "Não definida"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Início</p>
            <p className="font-medium">{schedule.firstDate || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Recorrência</p>
            <p className="font-medium capitalize">{schedule.recurrence}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Parcelas</p>
            <p className="font-medium">{schedule.installments}×</p>
          </div>
        </CardContent>
      </Card>

      {/* Bloco Seções */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(3)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Seções específicas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            {CLIENT_SECTION_KEYS.map((key) => {
              const filled = (sections[key]?.content ?? "").trim().length > 0;
              return (
                <Badge
                  key={key}
                  variant={filled ? "default" : "outline"}
                  className={`text-xs ${filled ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground"}`}
                >
                  {filled ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
                  {SECTION_LABELS[key]}
                </Badge>
              );
            })}
          </div>
          {emptySections.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {emptySections.length} seção{emptySections.length !== 1 ? "ões" : ""} em branco — pode preencher depois no editor.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Botões de ação */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          size="lg"
          onClick={onSaveDraft}
          disabled={isSaving || !allGood}
          variant="outline"
          className="flex-1 gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Criar rascunho
        </Button>
        <Button
          size="lg"
          onClick={onCreateAndSend}
          disabled={isSaving || !allGood}
          className="flex-1 gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Criar e enviar
        </Button>
      </div>

      {!allGood && (
        <p className="text-xs text-center text-destructive">
          Corrija os itens marcados acima antes de criar a proposta.
        </p>
      )}
    </div>
  );
}

// src/components/propostas/wizard/StepResumo.tsx
// Step 5 (Revisão) — mostra resumo de tudo, checklist e botões de ação.

import {
  Loader2, Send, Save, CheckCircle2, AlertCircle,
  User, Package, Palette, DollarSign, FileText, Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SECTION_LABELS, type SectionKey } from "@/types/proposals";
import { MODE_LABELS } from "@/lib/financialSchedule";
import type { WizardState } from "./wizardTypes";

// Seções variáveis por cliente
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "diagnostico", "objetivos", "estrategia", "solucao", "escopo",
];

// Seções padrão da agência
const AGENCY_SECTION_KEYS: SectionKey[] = [
  "apresentacao", "metodologia", "diferenciais", "cases",
  "depoimentos", "faq", "garantias", "consideracoes_finais",
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Verifica se o cronograma tem os campos mínimos preenchidos
 * conforme a modalidade escolhida.
 */
function isScheduleValid(state: WizardState): boolean {
  const { schedule, planValue, services } = state;
  const mode = schedule.mode ?? "mensal";
  const hasValue = planValue > 0 || services.filter(s => !s.is_bonus).some(s => s.value > 0);
  if (!hasValue) return false;

  switch (mode) {
    case "integral":          return (schedule.integralValue ?? 0) > 0 || hasValue;
    case "mensal":            return schedule.firstValue > 0;
    case "setup_mensal":      return (schedule.setupValue ?? 0) > 0 || schedule.firstValue > 0;
    case "meio_meio":         return hasValue;
    case "entrada_parcelado": return (schedule.entryValue ?? 0) > 0;
    case "evolutivo":
    case "carencia":          return (schedule.slices?.length ?? 0) > 0;
    default:                  return schedule.firstValue > 0;
  }
}

interface Props {
  state: WizardState;
  isSaving: boolean;
  onSaveDraft: () => void;
  onCreateAndSend: () => void;
  onGoToStep: (step: number) => void;
}

export function StepResumo({
  state,
  isSaving,
  onSaveDraft,
  onCreateAndSend,
  onGoToStep,
}: Props) {
  const {
    client, services, planValue, title, schedule, sections,
    heroTitle, heroWhatsappNumber, heroLogoUrl, heroCtaColor,
  } = state;

  const totalIndividual = services.filter(s => !s.is_bonus).reduce((s, i) => s + i.value, 0);
  const effectivePlan   = planValue > 0 ? planValue : totalIndividual;
  const savings         = planValue > 0 && totalIndividual > planValue ? totalIndividual - planValue : 0;
  const scheduleOk      = isScheduleValid(state);
  const modeLabel       = MODE_LABELS[schedule.mode ?? "mensal"] ?? schedule.mode ?? "—";

  const clientFilled = CLIENT_SECTION_KEYS.filter(k => (sections[k]?.content ?? "").trim().length > 0).length;
  const agencyFilled = AGENCY_SECTION_KEYS.filter(k => (sections[k]?.content ?? "").trim().length > 0).length;

  // ── Checklist de completude ───────────────────────────────────────────────
  // Os steps agora são: 0=Cliente, 1=Serviços, 2=Aparência, 3=Financeiro, 4=Conteúdo
  const checks = [
    { ok: !!client,                     label: "Cliente selecionado",   step: 0 },
    { ok: services.length > 0,          label: "Serviços adicionados",  step: 1 },
    { ok: !!title.trim(),               label: "Título definido",       step: 3 },
    { ok: !!heroWhatsappNumber?.trim(), label: "WhatsApp do closer",    step: 2 },
    { ok: scheduleOk,                   label: "Cronograma configurado",step: 3 },
  ];

  const allGood = checks.every(c => c.ok);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Revise antes de criar</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Confira as informações abaixo. Clique em qualquer bloco para editar.
        </p>
      </div>

      {/* ── Checklist ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map(c => (
          <button
            key={c.label}
            type="button"
            onClick={() => !c.ok && onGoToStep(c.step)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
              c.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 cursor-default"
                : "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 cursor-pointer"
            }`}
          >
            {c.ok
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : <AlertCircle className="h-4 w-4 shrink-0" />}
            {c.label}
            {!c.ok && <span className="ml-auto text-xs underline">Corrigir</span>}
          </button>
        ))}
      </div>

      {/* ── Bloco: Cliente ──────────────────────────────────────────────── */}
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
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
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

      {/* ── Bloco: Serviços ─────────────────────────────────────────────── */}
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
                  <span className="text-muted-foreground">Total dos serviços</span>
                  <span className="font-medium">{fmt(totalIndividual)}</span>
                </div>
                {planValue > 0 && planValue !== totalIndividual && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total da proposta</span>
                    <span className="font-semibold text-primary">{fmt(planValue)}</span>
                  </div>
                )}
                {savings > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Desconto para o cliente</span>
                    <span className="font-bold">{fmt(savings)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Bloco: Aparência ────────────────────────────────────────────── */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(2)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" /> Aparência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Título hero</span>
            <span className="font-medium truncate">
              {heroTitle?.trim() || title?.trim() || <em className="text-muted-foreground">Vazio (usará título)</em>}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-muted-foreground w-24 shrink-0">WhatsApp</span>
            <span className={heroWhatsappNumber?.trim() ? "font-medium" : "text-destructive italic"}>
              {heroWhatsappNumber?.trim() || "Não informado"}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-muted-foreground w-24 shrink-0">Logo</span>
            {heroLogoUrl ? (
              <div className="flex items-center gap-1.5">
                <Image className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {heroLogoUrl}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Sem logo (padrão da agência)</span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-muted-foreground w-24 shrink-0">Cor CTA</span>
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-4 rounded-sm border border-border"
                style={{ backgroundColor: heroCtaColor || "#16a34a" }}
              />
              <span className="text-xs font-mono">{heroCtaColor || "#16a34a"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Bloco: Financeiro ───────────────────────────────────────────── */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(3)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" /> Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Título</span>
            <span className={title?.trim() ? "font-medium" : "text-destructive italic"}>
              {title?.trim() || "Não definido"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Modalidade</span>
            <span className="font-medium">{modeLabel}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Total proposta</span>
            <span className={`font-semibold ${effectivePlan > 0 ? "text-primary" : "text-destructive"}`}>
              {effectivePlan > 0 ? fmt(effectivePlan) : "Não definido"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">1ª cobrança</span>
            <span className="font-medium">{schedule.firstDate || "—"}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Bloco: Conteúdo ─────────────────────────────────────────────── */}
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => onGoToStep(4)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Conteúdo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Por cliente */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Por cliente</p>
            <div className="flex flex-wrap gap-1.5">
              {CLIENT_SECTION_KEYS.map(key => {
                const filled = (sections[key]?.content ?? "").trim().length > 0;
                return (
                  <Badge
                    key={key}
                    variant={filled ? "default" : "outline"}
                    className={`text-xs ${
                      filled
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "text-muted-foreground"
                    }`}
                  >
                    {filled && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {SECTION_LABELS[key]}
                  </Badge>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {clientFilled}/{CLIENT_SECTION_KEYS.length} preenchidas
              {clientFilled < CLIENT_SECTION_KEYS.length && " — pode completar depois no editor."}
            </p>
          </div>

          {/* Padrão */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Padrão da agência</p>
            <div className="flex flex-wrap gap-1.5">
              {AGENCY_SECTION_KEYS.map(key => {
                const entry = sections[key];
                const filled = (entry?.content ?? "").trim().length > 0;
                const visible = entry?.is_visible ?? true;
                return (
                  <Badge
                    key={key}
                    variant="outline"
                    className={`text-xs ${
                      !visible
                        ? "text-muted-foreground/40 line-through"
                        : filled
                        ? "text-emerald-600 border-emerald-300"
                        : "text-amber-600 border-amber-300"
                    }`}
                  >
                    {SECTION_LABELS[key]}
                  </Badge>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {agencyFilled}/{AGENCY_SECTION_KEYS.length} com conteúdo personalizado (template aplicado nas demais).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Botões de ação ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          size="lg"
          variant="outline"
          onClick={onSaveDraft}
          disabled={isSaving || !allGood}
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

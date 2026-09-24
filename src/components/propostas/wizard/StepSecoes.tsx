// src/components/propostas/wizard/StepSecoes.tsx
// Step 4 do wizard: edição de seções da proposta.
//
// Aba "Por cliente":
//   - apresentacao  → ResumoExecutivoForm  (4 cards obrigatórios)
//   - diagnostico   → DiagnosticoForm      (3 colunas × 3 campos obrigatórios)
//   - objetivos     → ObjetivosForm        (3–6 cards, mín. 3 obrigatórios)
//   - estrategia    → EstrategiaForm       (templates fixos por produto, toggle de fases)
//   - solucao, escopo → SectionCard genérico (textarea + IA)
//
// Aba "Padrão da agência":
//   - metodologia, diferenciais, cases, depoimentos,
//     faq, garantias, consideracoes_finais → SectionCard genérico

import { useState } from "react";
import {
  Sparkles, ChevronDown, ChevronUp, Eye, EyeOff,
  SkipForward, Info, Plus, Trash2, AlertCircle,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Textarea }  from "@/components/ui/textarea";
import { Switch }    from "@/components/ui/switch";
import { Label }     from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge }     from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProposalAI } from "@/hooks/useProposalAI";
import {
  SECTION_LABELS, type SectionKey,
  type ResumoExecutivoContent,
  type DiagnosticoContent, type DiagnosticoColuna,
  type ObjetivosContent, type ObjetivoCard,
} from "@/types/proposals";
import type { WizardServiceDraft } from "./wizardTypes";
import type { Client } from "@/types/crm";
import { EstrategiaForm } from "./EstrategiaForm";

// ─── Constantes de seções ────────────────────────────────────────────────────

// Seções com formulário estruturado próprio (não usam SectionCard genérico)
const STRUCTURED_CLIENT_KEYS: SectionKey[] = ["apresentacao", "diagnostico", "objetivos", "estrategia"];

// Seções com textarea genérico (por cliente)
const GENERIC_CLIENT_KEYS: SectionKey[] = ["solucao", "escopo"];

// Todas as seções do cliente (ordem de exibição na aba)
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "apresentacao", "diagnostico", "objetivos",
  "estrategia", "solucao", "escopo",
];

// Seções padrão da agência
const AGENCY_SECTION_KEYS: SectionKey[] = [
  "metodologia", "diferenciais", "cases", "depoimentos",
  "faq", "garantias", "consideracoes_finais",
];

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface SectionEntry {
  content: string;
  is_visible: boolean;
}

interface Props {
  client: Client;
  services: WizardServiceDraft[];
  sections: Partial<Record<SectionKey, SectionEntry>>;
  onSectionsChange: (sections: Partial<Record<SectionKey, SectionEntry>>) => void;
  onNext: () => void;
}

function getEntry(
  sections: Partial<Record<SectionKey, SectionEntry>>,
  key: SectionKey,
): SectionEntry {
  return sections[key] ?? { content: "", is_visible: true };
}

// Tenta parsear JSON de um content string, retornando null se falhar
function tryParse<T>(content: string): T | null {
  try { return content ? (JSON.parse(content) as T) : null; } catch { return null; }
}

// ─── Helpers de validação ───────────────────────────────────────────────────

function isResumoValido(c: ResumoExecutivoContent | null): boolean {
  if (!c) return false;
  return !!(c.contexto?.trim() && c.desafios?.trim() && c.oportunidades?.trim() && c.objetivo_plano?.trim());
}

function isDiagnosticoValido(c: DiagnosticoContent | null): boolean {
  if (!c || !c.colunas?.length) return false;
  return c.colunas.every(
    (col) => col.problema?.trim() && col.impacto?.trim() && col.oportunidade?.trim(),
  );
}

function isObjetivosValido(c: ObjetivosContent | null): boolean {
  if (!c || !c.cards?.length) return false;
  const filled = c.cards.filter((card) => card.titulo?.trim() && card.descricao?.trim());
  return filled.length >= 3;
}

// ─── ResumoExecutivoForm ─────────────────────────────────────────────────────
// 4 cards obrigatórios. Título "Entendemos o seu cenário" é fixo no viewer.

const RESUMO_CARDS: { field: keyof ResumoExecutivoContent; label: string; hint: string }[] = [
  { field: "contexto",       label: "O contexto",           hint: "Descreva o contexto atual da empresa no mercado." },
  { field: "desafios",       label: "Principais desafios",  hint: "Quais são os maiores desafios enfrentados hoje?" },
  { field: "oportunidades",  label: "Oportunidades",        hint: "Que oportunidades foram identificadas?" },
  { field: "objetivo_plano", label: "Objetivo deste plano", hint: "O que este plano pretende alcançar?" },
];

function ResumoExecutivoForm({
  content,
  showErrors,
  onChange,
}: {
  content: string;
  showErrors: boolean;
  onChange: (json: string) => void;
}) {
  const parsed = tryParse<ResumoExecutivoContent>(content) ?? {
    contexto: "", desafios: "", oportunidades: "", objetivo_plano: "",
  };

  function update(field: keyof ResumoExecutivoContent, value: string) {
    onChange(JSON.stringify({ ...parsed, [field]: value }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          O título <strong>"Entendemos o seu cenário"</strong> é fixo na proposta.
          Preencha os 4 cards abaixo — todos obrigatórios.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {RESUMO_CARDS.map(({ field, label, hint }) => {
          const val = parsed[field] ?? "";
          const empty = showErrors && !val.trim();
          return (
            <div key={field} className="space-y-1.5">
              <Label className="text-xs font-semibold">{label} <span className="text-destructive">*</span></Label>
              <Textarea
                rows={3}
                placeholder={hint}
                value={val}
                onChange={(e) => update(field, e.target.value)}
                className={`resize-none text-sm ${empty ? "border-destructive" : ""}`}
              />
              {empty && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Campo obrigatório
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DiagnosticoForm ──────────────────────────────────────────────────────────
// 3 colunas fixas, cada uma com: problema, impacto, oportunidade (todos obrigatórios)

const DIAG_EMPTY_COLUNA: DiagnosticoColuna = { problema: "", impacto: "", oportunidade: "" };

const DIAG_FIELDS: { field: keyof DiagnosticoColuna; label: string; colorClass: string }[] = [
  { field: "problema",     label: "Problema",     colorClass: "text-red-500" },
  { field: "impacto",      label: "Impacto",      colorClass: "text-muted-foreground" },
  { field: "oportunidade", label: "Oportunidade", colorClass: "text-primary" },
];

function DiagnosticoForm({
  content,
  showErrors,
  onChange,
}: {
  content: string;
  showErrors: boolean;
  onChange: (json: string) => void;
}) {
  const parsed = tryParse<DiagnosticoContent>(content);
  const colunas: [DiagnosticoColuna, DiagnosticoColuna, DiagnosticoColuna] = [
    parsed?.colunas?.[0] ?? { ...DIAG_EMPTY_COLUNA },
    parsed?.colunas?.[1] ?? { ...DIAG_EMPTY_COLUNA },
    parsed?.colunas?.[2] ?? { ...DIAG_EMPTY_COLUNA },
  ];

  function updateColuna(idx: number, field: keyof DiagnosticoColuna, value: string) {
    const next = colunas.map((c, i) => i === idx ? { ...c, [field]: value } : c) as
      [DiagnosticoColuna, DiagnosticoColuna, DiagnosticoColuna];
    onChange(JSON.stringify({ colunas: next }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          Preencha as <strong>3 colunas</strong> do diagnóstico. Cada coluna exige
          Problema, Impacto e Oportunidade — todos obrigatórios.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {colunas.map((col, colIdx) => (
          <div key={colIdx} className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Coluna {colIdx + 1}
            </p>
            {DIAG_FIELDS.map(({ field, label, colorClass }) => {
              const val = col[field] ?? "";
              const empty = showErrors && !val.trim();
              return (
                <div key={field} className="space-y-1">
                  <Label className={`text-[11px] font-semibold uppercase tracking-wide ${colorClass}`}>
                    {label} <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    rows={2}
                    placeholder={`${label} nesta área...`}
                    value={val}
                    onChange={(e) => updateColuna(colIdx, field, e.target.value)}
                    className={`resize-none text-xs ${empty ? "border-destructive" : ""}`}
                  />
                  {empty && (
                    <p className="text-[10px] text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Obrigatório
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ObjetivosForm ────────────────────────────────────────────────────────────
// 3–6 cards. Mínimo 3 preenchidos obrigatório.

const OBJ_EMPTY: ObjetivoCard = { titulo: "", descricao: "" };

function gridHint(count: number): string {
  if (count <= 3) return "3 colunas × 1 linha";
  if (count === 4) return "2 colunas × 2 linhas";
  if (count === 5) return "linha 1: 3 cards · linha 2: 2 cards";
  return "3 colunas × 2 linhas";
}

function ObjetivosForm({
  content,
  showErrors,
  onChange,
}: {
  content: string;
  showErrors: boolean;
  onChange: (json: string) => void;
}) {
  const parsed = tryParse<ObjetivosContent>(content);
  const cards: ObjetivoCard[] = parsed?.cards?.length
    ? parsed.cards
    : [{ ...OBJ_EMPTY }, { ...OBJ_EMPTY }, { ...OBJ_EMPTY }];

  function updateCard(idx: number, field: keyof ObjetivoCard, value: string) {
    const next = cards.map((c, i) => i === idx ? { ...c, [field]: value } : c);
    onChange(JSON.stringify({ cards: next }));
  }

  function addCard() {
    if (cards.length >= 6) return;
    onChange(JSON.stringify({ cards: [...cards, { ...OBJ_EMPTY }] }));
  }

  function removeCard(idx: number) {
    if (cards.length <= 3) return;
    const next = cards.filter((_, i) => i !== idx);
    onChange(JSON.stringify({ cards: next }));
  }

  const filledCount = cards.filter((c) => c.titulo?.trim() && c.descricao?.trim()).length;
  const notEnough = showErrors && filledCount < 3;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-2 flex-1">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            Mínimo <strong>3 cards</strong>, máximo 6. Layout automático:{" "}
            <strong>{gridHint(cards.length)}</strong>.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cards.length >= 6}
          onClick={addCard}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {notEnough && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" />
          Preencha ao menos 3 cards (título e descrição).
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, idx) => {
          const empty = showErrors && (!card.titulo?.trim() || !card.descricao?.trim());
          return (
            <div
              key={idx}
              className={`rounded-lg border p-3 space-y-2 bg-muted/20 ${empty ? "border-destructive/60" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Card {idx + 1}
                </span>
                {cards.length > 3 && (
                  <button
                    type="button"
                    onClick={() => removeCard(idx)}
                    className="text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Input
                  placeholder="Título do objetivo *"
                  value={card.titulo}
                  onChange={(e) => updateCard(idx, "titulo", e.target.value)}
                  className={`text-sm h-8 ${showErrors && !card.titulo?.trim() ? "border-destructive" : ""}`}
                />
                <Textarea
                  rows={2}
                  placeholder="Descrição do objetivo *"
                  value={card.descricao}
                  onChange={(e) => updateCard(idx, "descricao", e.target.value)}
                  className={`resize-none text-xs ${showErrors && !card.descricao?.trim() ? "border-destructive" : ""}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SectionCard genérico (textarea + IA) ────────────────────────────────────

interface SectionCardProps {
  sectionKey: SectionKey;
  entry: SectionEntry;
  isGenerating: boolean;
  aiError: string | null;
  placeholder?: string;
  onUpdate: (patch: Partial<SectionEntry>) => void;
  onGenerateAI: () => void;
}

function SectionCard({
  sectionKey,
  entry,
  isGenerating,
  aiError,
  placeholder,
  onUpdate,
  onGenerateAI,
}: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isFilled = entry.content.trim().length > 0;

  return (
    <Card className={!entry.is_visible ? "opacity-50" : ""}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="text-muted-foreground hover:text-foreground transition shrink-0"
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            <span className="font-semibold text-sm truncate">{SECTION_LABELS[sectionKey]}</span>
            {isFilled && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300 shrink-0">
                Preenchida
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost" size="sm" disabled={isGenerating}
              onClick={onGenerateAI} className="text-xs gap-1.5 h-7 px-2"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {isGenerating ? "Gerando..." : "Gerar com IA"}
            </Button>
            <div className="flex items-center gap-1.5">
              {entry.is_visible
                ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              <Switch
                checked={entry.is_visible}
                onCheckedChange={(v) => onUpdate({ is_visible: v })}
                id={`vis-wiz-${sectionKey}`}
              />
              <Label htmlFor={`vis-wiz-${sectionKey}`} className="text-xs text-muted-foreground cursor-pointer">
                {entry.is_visible ? "Visível" : "Oculta"}
              </Label>
            </div>
          </div>
        </div>
        {aiError && <p className="text-xs text-destructive mt-1 pl-6">{aiError}</p>}
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0 px-4 pb-4">
          <Textarea
            rows={6}
            placeholder={placeholder ?? `Conteúdo de "${SECTION_LABELS[sectionKey]}" para esta proposta...`}
            value={entry.content}
            disabled={!entry.is_visible}
            onChange={(e) => onUpdate({ content: e.target.value })}
            className="resize-none text-sm font-mono"
          />
        </CardContent>
      )}
    </Card>
  );
}

// ─── StructuredSectionWrapper ────────────────────────────────────────────────
// Envelope colapsável para os 3 formulários estruturados (com header unificado)

interface StructuredWrapperProps {
  sectionKey: SectionKey;
  isFilled: boolean;
  isValid: boolean;
  showErrors: boolean;
  children: React.ReactNode;
}

function StructuredSectionWrapper({
  sectionKey,
  isFilled,
  isValid,
  showErrors,
  children,
}: StructuredWrapperProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hasError = showErrors && !isValid;

  return (
    <Card className={hasError ? "border-destructive/50" : ""}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted-foreground hover:text-foreground transition shrink-0"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <span className="font-semibold text-sm">{SECTION_LABELS[sectionKey]}</span>
          {isFilled && isValid && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">
              Preenchida
            </Badge>
          )}
          {hasError && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/40 gap-1">
              <AlertCircle className="h-2.5 w-2.5" /> Incompleta
            </Badge>
          )}
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0 px-4 pb-5">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function StepSecoes({
  client,
  services,
  sections,
  onSectionsChange,
  onNext,
}: Props) {
  const {
    isLoading: aiLoading,
    result: aiResult,
    error: aiError,
    generateSection,
    reset: resetAI,
  } = useProposalAI();

  const [generatingKey, setGeneratingKey]   = useState<SectionKey | null>(null);
  const [pendingKey, setPendingKey]         = useState<SectionKey | null>(null);
  // Exibe erros de validação apenas após tentativa de avançar
  const [showErrors, setShowErrors]         = useState(false);

  function updateSection(key: SectionKey, patch: Partial<SectionEntry>) {
    const entry = getEntry(sections, key);
    onSectionsChange({ ...sections, [key]: { ...entry, ...patch } });
  }

  async function handleGenerateAI(key: SectionKey) {
    setGeneratingKey(key);
    setPendingKey(key);
    resetAI();
    await generateSection({
      sectionKey: key,
      clientName: client.name ?? "Cliente",
      company: client.company ?? client.name ?? "Empresa",
      niche: (client as Record<string, unknown>).niche as string | undefined,
      services: services.map((s) => ({ name: s.name, value: s.value })),
    });
  }

  // Injeta resultado da IA na seção pendente
  if (aiResult && pendingKey && !aiLoading) {
    updateSection(pendingKey, { content: aiResult });
    setPendingKey(null);
    resetAI();
  }

  // ── Dados das seções estruturadas ──────────────────────────────────────────
  const resumoContent    = getEntry(sections, "apresentacao").content;
  const diagContent      = getEntry(sections, "diagnostico").content;
  const objContent       = getEntry(sections, "objetivos").content;
  const estrategiaContent = getEntry(sections, "estrategia").content;

  const resumoParsed     = tryParse<ResumoExecutivoContent>(resumoContent);
  const diagParsed       = tryParse<DiagnosticoContent>(diagContent);
  const objParsed        = tryParse<ObjetivosContent>(objContent);

  const resumoValido     = isResumoValido(resumoParsed);
  const diagValido       = isDiagnosticoValido(diagParsed);
  const objValido        = isObjetivosValido(objParsed);

  // Estratégia: válida se tiver JSON com ao menos 3 fases ativas
  const estrategiaValido = (() => {
    try {
      if (!estrategiaContent.trim()) return false;
      const parsed = JSON.parse(estrategiaContent);
      if (!Array.isArray(parsed)) return false;
      const ativos = parsed.filter((p: Record<string, unknown>) => p.ativo !== false);
      return ativos.length >= 3;
    } catch { return false; }
  })();

  const structuredValid  = resumoValido && diagValido && objValido && estrategiaValido;

  // Contagem para badges das abas
  const clientFilled = CLIENT_SECTION_KEYS.filter(
    (k) => (sections[k]?.content ?? "").trim().length > 0
  ).length;
  const agencyFilled = AGENCY_SECTION_KEYS.filter(
    (k) => (sections[k]?.content ?? "").trim().length > 0
  ).length;

  function handleContinue() {
    if (!structuredValid) {
      setShowErrors(true);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Conteúdo da proposta</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Preencha as seções específicas para{" "}
            <strong>{client.name}</strong> e revise as seções padrão da agência.
          </p>
        </div>
        <Button
          variant="ghost" size="sm" onClick={onNext}
          className="gap-1.5 text-muted-foreground shrink-0"
        >
          <SkipForward className="h-3.5 w-3.5" /> Pular
        </Button>
      </div>

      {showErrors && !structuredValid && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">
            Preencha os campos obrigatórios nas seções{" "}
            {[
              !resumoValido && "Resumo Executivo",
              !diagValido && "Diagnóstico",
              !objValido && "Objetivos",
              !estrategiaValido && "Estratégia",
            ].filter(Boolean).join(", ")}{" "}
            antes de continuar.
          </p>
        </div>
      )}

      <Tabs defaultValue="cliente">
        <TabsList className="w-full">
          <TabsTrigger value="cliente" className="flex-1 gap-2">
            Por cliente
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {clientFilled}/{CLIENT_SECTION_KEYS.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="agencia" className="flex-1 gap-2">
            Padrão da agência
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {agencyFilled}/{AGENCY_SECTION_KEYS.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Aba: Por cliente ────────────────────────────────────────────── */}
        <TabsContent value="cliente" className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              As 3 primeiras seções usam formulários estruturados — os campos
              preenchem automaticamente o layout visual da proposta.
              As demais aceitam texto livre ou geração por IA.
            </p>
          </div>

          {/* Resumo Executivo */}
          <StructuredSectionWrapper
            sectionKey="apresentacao"
            isFilled={resumoContent.trim().length > 0}
            isValid={resumoValido}
            showErrors={showErrors}
          >
            <ResumoExecutivoForm
              content={resumoContent}
              showErrors={showErrors}
              onChange={(json) => updateSection("apresentacao", { content: json })}
            />
          </StructuredSectionWrapper>

          {/* Diagnóstico */}
          <StructuredSectionWrapper
            sectionKey="diagnostico"
            isFilled={diagContent.trim().length > 0}
            isValid={diagValido}
            showErrors={showErrors}
          >
            <DiagnosticoForm
              content={diagContent}
              showErrors={showErrors}
              onChange={(json) => updateSection("diagnostico", { content: json })}
            />
          </StructuredSectionWrapper>

          {/* Objetivos */}
          <StructuredSectionWrapper
            sectionKey="objetivos"
            isFilled={objContent.trim().length > 0}
            isValid={objValido}
            showErrors={showErrors}
          >
            <ObjetivosForm
              content={objContent}
              showErrors={showErrors}
              onChange={(json) => updateSection("objetivos", { content: json })}
            />
          </StructuredSectionWrapper>

          {/* Estratégia — template por produto com toggle de fases */}
          <StructuredSectionWrapper
            sectionKey="estrategia"
            isFilled={estrategiaContent.trim().length > 0}
            isValid={estrategiaValido}
            showErrors={showErrors}
          >
            <EstrategiaForm
              content={estrategiaContent}
              services={services}
              showErrors={showErrors}
              onChange={(json) => updateSection("estrategia", { content: json })}
            />
          </StructuredSectionWrapper>

          {/* Seções genéricas restantes */}
          {GENERIC_CLIENT_KEYS.map((key) => (
            <SectionCard
              key={key}
              sectionKey={key}
              entry={getEntry(sections, key)}
              isGenerating={aiLoading && generatingKey === key}
              aiError={aiError && generatingKey === key && !aiLoading ? aiError : null}
              onUpdate={(patch) => updateSection(key, patch)}
              onGenerateAI={() => handleGenerateAI(key)}
            />
          ))}
        </TabsContent>

        {/* ── Aba: Padrão da agência ────────────────────────────────────── */}
        <TabsContent value="agencia" className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Estas seções foram pré-preenchidas com o template padrão da organização.
              Você pode personalizar o conteúdo ou ocultar seções que não se aplicam.
            </p>
          </div>
          {AGENCY_SECTION_KEYS.map((key) => (
            <SectionCard
              key={key}
              sectionKey={key}
              entry={getEntry(sections, key)}
              isGenerating={aiLoading && generatingKey === key}
              aiError={aiError && generatingKey === key && !aiLoading ? aiError : null}
              placeholder={`Conteúdo padrão de "${SECTION_LABELS[key]}"...`}
              onUpdate={(patch) => updateSection(key, patch)}
              onGenerateAI={() => handleGenerateAI(key)}
            />
          ))}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={handleContinue} className="gap-1.5">
          Continuar →
        </Button>
      </div>
    </div>
  );
}

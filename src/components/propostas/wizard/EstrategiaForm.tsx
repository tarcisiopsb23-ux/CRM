// src/components/propostas/wizard/EstrategiaForm.tsx
// Formulário de estratégia no wizard.
//
// Fluxo:
//  1. Ao montar, tenta detectar template pelos serviços selecionados.
//  2. Exibe selector de template (chips) + fases como cards toggleáveis.
//  3. No modo "Personalizado", até 6 fases livres com nome e texto.
//  4. Mínimo de 3 fases ativas — botão de desativar trava quando restar 3.
//  5. Serializa para JSON e chama onChange para persistir no WizardState.

import { useEffect, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, Info, AlertCircle, Sparkles } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import {
  STRATEGY_TEMPLATES,
  CUSTOM_TEMPLATE_ID,
  CUSTOM_TEMPLATE_LABEL,
  MIN_ACTIVE_PHASES,
  MAX_CUSTOM_PHASES,
  detectTemplate,
  serializePhases,
  deserializePhases,
  emptyCustomPhase,
  type StrategyPhase,
  type StrategyTemplate,
} from "./strategyTemplates";
import type { WizardServiceDraft } from "./wizardTypes";

interface Props {
  content: string;
  services: WizardServiceDraft[];
  showErrors: boolean;
  onChange: (json: string) => void;
}

// ─── Chip de seleção de template ─────────────────────────────────────────────
function TemplateChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150"
      style={{
        borderColor: active ? "oklch(0.52 0.24 295)" : "rgba(0,0,0,0.15)",
        backgroundColor: active ? "oklch(0.52 0.24 295 / 0.10)" : "transparent",
        color: active ? "oklch(0.42 0.22 295)" : "#5a5878",
      }}
    >
      {label}
    </button>
  );
}

// ─── Card de fase (modo fixo — apenas toggle) ─────────────────────────────────
function PhaseCard({
  phase, activeCount, onToggle,
}: {
  phase: StrategyPhase;
  activeCount: number;
  onToggle: () => void;
}) {
  const canDeactivate = phase.ativo ? activeCount > MIN_ACTIVE_PHASES : true;

  return (
    <div
      className="rounded-xl border p-3 flex gap-3 items-start transition-all duration-200"
      style={{
        borderColor: phase.ativo ? "oklch(0.52 0.24 295 / 0.35)" : "rgba(0,0,0,0.08)",
        backgroundColor: phase.ativo ? "oklch(0.52 0.24 295 / 0.06)" : "rgba(0,0,0,0.02)",
        opacity: phase.ativo ? 1 : 0.50,
      }}
    >
      {/* Indicador de status */}
      <div
        className="shrink-0 h-6 w-6 rounded-full grid place-items-center text-[11px] font-bold mt-0.5"
        style={{
          backgroundColor: phase.ativo ? "oklch(0.52 0.24 295 / 0.12)" : "rgba(0,0,0,0.06)",
          color: phase.ativo ? "oklch(0.42 0.22 295)" : "oklch(0.60 0.02 280)",
        }}
      >
        {phase.ativo ? "●" : "○"}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-bold leading-snug"
          style={{ color: phase.ativo ? "#1a1830" : "#9e9cb8" }}
        >
          {phase.fase}
        </p>
        <p
          className="text-[11px] leading-relaxed mt-0.5"
          style={{ color: "#5a5878" }}
        >
          {phase.descricao}
        </p>
      </div>

      {/* Botão toggle */}
      <button
        type="button"
        disabled={!canDeactivate}
        onClick={onToggle}
        title={
          !canDeactivate
            ? `Mínimo de ${MIN_ACTIVE_PHASES} etapas`
            : phase.ativo
            ? "Remover etapa"
            : "Incluir etapa"
        }
        className="shrink-0 mt-0.5 transition-opacity"
        style={{ opacity: canDeactivate ? 1 : 0.3 }}
      >
        {phase.ativo ? (
          <ToggleRight className="h-5 w-5" style={{ color: "oklch(0.72 0.22 295)" }} />
        ) : (
          <ToggleLeft className="h-5 w-5" style={{ color: "oklch(0.44 0.02 280)" }} />
        )}
      </button>
    </div>
  );
}

// ─── Card de fase personalizada (editável) ───────────────────────────────────
function CustomPhaseCard({
  phase, index, total, showErrors,
  onUpdate, onRemove,
}: {
  phase: StrategyPhase;
  index: number;
  total: number;
  showErrors: boolean;
  onUpdate: (patch: Partial<StrategyPhase>) => void;
  onRemove: () => void;
}) {
  const canRemove = total > MIN_ACTIVE_PHASES;
  const faseEmpty = showErrors && !phase.fase.trim();
  const descEmpty = showErrors && !phase.descricao.trim();

  return (
    <div
      className="rounded-xl border p-3 space-y-2"
      style={{
        borderColor: (faseEmpty || descEmpty) ? "oklch(0.65 0.18 25 / 0.60)" : "oklch(0.62 0.24 295 / 0.25)",
        backgroundColor: "oklch(0.62 0.24 295 / 0.05)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[11px] font-bold uppercase tracking-widest"
          style={{ color: "oklch(0.62 0.24 295)" }}
        >
          Etapa {index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="transition-opacity hover:opacity-70">
            <Trash2 className="h-3.5 w-3.5" style={{ color: "oklch(0.65 0.18 25)" }} />
          </button>
        )}
      </div>

      <Input
        placeholder="Nome da etapa *"
        value={phase.fase}
        onChange={(e) => onUpdate({ fase: e.target.value })}
        className="h-8 text-sm"
        style={{ borderColor: faseEmpty ? "oklch(0.65 0.18 25)" : undefined }}
      />
      {faseEmpty && (
        <p className="text-[10px] flex items-center gap-1" style={{ color: "oklch(0.65 0.18 25)" }}>
          <AlertCircle className="h-3 w-3" /> Obrigatório
        </p>
      )}

      <Textarea
        rows={2}
        placeholder="Descrição da etapa *"
        value={phase.descricao}
        onChange={(e) => onUpdate({ descricao: e.target.value })}
        className="resize-none text-xs"
        style={{ borderColor: descEmpty ? "oklch(0.65 0.18 25)" : undefined }}
      />
      {descEmpty && (
        <p className="text-[10px] flex items-center gap-1" style={{ color: "oklch(0.65 0.18 25)" }}>
          <AlertCircle className="h-3 w-3" /> Obrigatório
        </p>
      )}
    </div>
  );
}

// ─── Preview da linha de etapas ──────────────────────────────────────────────
function StrategyLinePreview({ phases }: { phases: StrategyPhase[] }) {
  const active = phases.filter((p) => p.ativo);
  if (active.length === 0) return null;

  return (
    <div
      className="rounded-xl border p-4 overflow-x-auto"
      style={{ borderColor: "oklch(0.52 0.24 295 / 0.20)", backgroundColor: "oklch(0.52 0.24 295 / 0.04)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#9e9cb8" }}>
        Preview da linha de estratégia
      </p>
      <div className="flex items-start min-w-max gap-0">
        {active.map((p, i) => (
          <div key={p.id} className="relative flex flex-col items-center" style={{ minWidth: 100, maxWidth: 120 }}>
            {/* Linha conectora */}
            {i < active.length - 1 && (
              <div
                className="absolute top-3 left-1/2 right-0 h-px"
                style={{
                  background: "linear-gradient(90deg, oklch(0.52 0.24 295 / 0.50) 0%, oklch(0.52 0.24 295 / 0.15) 100%)",
                }}
              />
            )}
            {/* Nó */}
            <div
              className="relative z-10 h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold mb-2 shrink-0"
              style={{
                backgroundColor: "#ffffff",
                border: "1.5px solid oklch(0.52 0.24 295)",
                color: "oklch(0.42 0.22 295)",
                boxShadow: "0 0 8px oklch(0.52 0.24 295 / 0.25)",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <p
              className="text-center text-[10px] font-semibold leading-tight px-1"
              style={{ color: "#1a1830" }}
            >
              {p.fase}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function EstrategiaForm({ content, services, showErrors, onChange }: Props) {
  // ── Inicialização ──────────────────────────────────────────────────────────
  function initState(): { templateId: string; phases: StrategyPhase[] } {
    // Se já tem conteúdo salvo, deserializa
    const saved = deserializePhases(content);
    if (saved) {
      // Descobre qual template estava ativo (ou personalizado)
      const matchedTpl = STRATEGY_TEMPLATES.find((t) =>
        t.fases.some((f) => saved.some((s) => s.fase === f.fase)),
      );
      return {
        templateId: matchedTpl ? matchedTpl.id : CUSTOM_TEMPLATE_ID,
        phases: saved,
      };
    }

    // Sem conteúdo: tenta detectar pelo serviço
    const detected = detectTemplate(services.map((s) => s.name));
    if (detected) {
      return {
        templateId: detected.id,
        phases: detected.fases.map((f) => ({ ...f })),
      };
    }

    // Nenhum detectado: começa sem template (exibe selector)
    return { templateId: "", phases: [] };
  }

  const init = initState();
  const [templateId, setTemplateId] = useState<string>(init.templateId);
  const [phases, setPhases]         = useState<StrategyPhase[]>(init.phases);
  const [detected]                  = useState<StrategyTemplate | null>(() =>
    detectTemplate(services.map((s) => s.name)),
  );

  // Serializa sempre que phases mudar
  useEffect(() => {
    if (phases.length > 0) onChange(serializePhases(phases));
  }, [phases]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Aplicar template ───────────────────────────────────────────────────────
  function applyTemplate(tpl: StrategyTemplate) {
    setTemplateId(tpl.id);
    setPhases(tpl.fases.map((f) => ({ ...f })));
  }

  function applyCustom() {
    setTemplateId(CUSTOM_TEMPLATE_ID);
    setPhases(
      Array.from({ length: MIN_ACTIVE_PHASES }, (_, i) => emptyCustomPhase(i)),
    );
  }

  // ── Toggle de fase (modo fixo) ─────────────────────────────────────────────
  function togglePhase(phaseId: string) {
    setPhases((prev) =>
      prev.map((p) => (p.id === phaseId ? { ...p, ativo: !p.ativo } : p)),
    );
  }

  // ── Modo personalizado: operações ─────────────────────────────────────────
  function updateCustomPhase(idx: number, patch: Partial<StrategyPhase>) {
    setPhases((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function addCustomPhase() {
    if (phases.length >= MAX_CUSTOM_PHASES) return;
    setPhases((prev) => [...prev, emptyCustomPhase(prev.length)]);
  }

  function removeCustomPhase(idx: number) {
    if (phases.length <= MIN_ACTIVE_PHASES) return;
    setPhases((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Validação ──────────────────────────────────────────────────────────────
  const activeCount = phases.filter((p) => p.ativo).length;
  const isCustom    = templateId === CUSTOM_TEMPLATE_ID;
  const tooFewActive = showErrors && activeCount < MIN_ACTIVE_PHASES;
  const customIncomplete = isCustom && showErrors &&
    phases.some((p) => !p.fase.trim() || !p.descricao.trim());

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Banner de detecção automática ── */}
      {detected && templateId !== detected.id && templateId === "" && (
        <div
          className="flex items-start gap-2 rounded-xl border px-4 py-3"
          style={{ borderColor: "oklch(0.52 0.24 295 / 0.30)", backgroundColor: "oklch(0.52 0.24 295 / 0.06)" }}
        >
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "oklch(0.52 0.24 295)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "#1a1830" }}>
              Template sugerido: <span style={{ color: "oklch(0.42 0.22 295)" }}>{detected.label}</span>
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#5a5878" }}>
              Detectado com base nos serviços selecionados.
            </p>
          </div>
          <Button
            type="button" size="sm"
            onClick={() => applyTemplate(detected)}
            className="shrink-0 text-xs h-7 px-3"
          >
            Aplicar
          </Button>
        </div>
      )}

      {/* ── Selector de template (chips) ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: "#5a5878" }}>
          Selecione o template de estratégia:
        </p>
        <div className="flex flex-wrap gap-2">
          {STRATEGY_TEMPLATES.map((tpl) => (
            <TemplateChip
              key={tpl.id}
              label={tpl.label}
              active={templateId === tpl.id}
              onClick={() => applyTemplate(tpl)}
            />
          ))}
          <TemplateChip
            label={CUSTOM_TEMPLATE_LABEL}
            active={templateId === CUSTOM_TEMPLATE_ID}
            onClick={applyCustom}
          />
        </div>
      </div>

      {/* ── Erro: poucas fases ativas ── */}
      {tooFewActive && (
        <p className="text-[11px] flex items-center gap-1" style={{ color: "oklch(0.65 0.18 25)" }}>
          <AlertCircle className="h-3.5 w-3.5" />
          Ative ao menos {MIN_ACTIVE_PHASES} etapas para continuar.
        </p>
      )}

      {/* ── Sem template selecionado ── */}
      {templateId === "" && (
        <div
          className="flex items-start gap-2 rounded-xl border px-4 py-3"
          style={{ borderColor: "rgba(0,0,0,0.10)", backgroundColor: "rgba(0,0,0,0.03)" }}
        >
          <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#9e9cb8" }} />
          <p className="text-xs" style={{ color: "#5a5878" }}>
            Selecione um template acima para definir as etapas da estratégia.
          </p>
        </div>
      )}

      {/* ── Fases: modo FIXO ── */}
      {templateId !== "" && !isCustom && phases.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#9e9cb8" }}>
            Etapas — ative ou desative conforme a negociação
          </p>
          <div className="space-y-2">
            {phases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                activeCount={activeCount}
                onToggle={() => togglePhase(phase.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Fases: modo PERSONALIZADO ── */}
      {isCustom && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#9e9cb8" }}>
              Etapas personalizadas ({phases.length}/{MAX_CUSTOM_PHASES})
            </p>
            <Button
              type="button" variant="outline" size="sm"
              disabled={phases.length >= MAX_CUSTOM_PHASES}
              onClick={addCustomPhase}
              className="h-7 text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar etapa
            </Button>
          </div>
          <div className="space-y-2">
            {phases.map((phase, idx) => (
              <CustomPhaseCard
                key={phase.id}
                phase={phase}
                index={idx}
                total={phases.length}
                showErrors={showErrors}
                onUpdate={(patch) => updateCustomPhase(idx, patch)}
                onRemove={() => removeCustomPhase(idx)}
              />
            ))}
          </div>
          {customIncomplete && (
            <p className="text-[11px] flex items-center gap-1" style={{ color: "oklch(0.65 0.18 25)" }}>
              <AlertCircle className="h-3.5 w-3.5" />
              Preencha nome e descrição de todas as etapas.
            </p>
          )}
        </div>
      )}

      {/* ── Preview da linha ── */}
      {phases.length > 0 && templateId !== "" && (
        <StrategyLinePreview phases={phases} />
      )}
    </div>
  );
}

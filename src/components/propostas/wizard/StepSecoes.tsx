// src/components/propostas/wizard/StepSecoes.tsx
import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, Eye, EyeOff, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProposalAI } from "@/hooks/useProposalAI";
import { SECTION_LABELS, type SectionKey } from "@/types/proposals";
import type { WizardServiceDraft } from "./wizardTypes";
import type { Client } from "@/types/crm";

// Seções variáveis por cliente
const CLIENT_SECTION_KEYS: SectionKey[] = [
  "diagnostico",
  "objetivos",
  "estrategia",
  "solucao",
  "escopo",
];

interface SectionEntry {
  content: string;
  is_visible: boolean;
}

interface Props {
  client: Client;
  services: WizardServiceDraft[];
  sections: Partial<Record<SectionKey, SectionEntry>>;
  onSectionsChange: (sections: Partial<Record<SectionKey, SectionEntry>>) => void;
  onNext: () => void; // pular
}

function getEntry(
  sections: Partial<Record<SectionKey, SectionEntry>>,
  key: SectionKey
): SectionEntry {
  return sections[key] ?? { content: "", is_visible: true };
}

export function StepSecoes({ client, services, sections, onSectionsChange, onNext }: Props) {
  const { isLoading: aiLoading, result: aiResult, error: aiError, generateSection, reset: resetAI } =
    useProposalAI();

  const [generatingKey, setGeneratingKey] = useState<SectionKey | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<SectionKey>>(new Set());
  const [pendingKey, setPendingKey] = useState<SectionKey | null>(null);

  function updateSection(key: SectionKey, patch: Partial<SectionEntry>) {
    const entry = getEntry(sections, key);
    onSectionsChange({ ...sections, [key]: { ...entry, ...patch } });
  }

  function toggleCollapse(key: SectionKey) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleGenerateAI(key: SectionKey) {
    setGeneratingKey(key);
    setPendingKey(key);
    resetAI();
    await generateSection({
      sectionKey: key,
      clientName: client.name ?? "Cliente",
      company: client.company ?? client.name ?? "Empresa",
      niche: (client as any).niche ?? undefined,
      services: services.map((s) => ({ name: s.name, value: s.value })),
    });
  }

  // Quando o resultado da IA chega, injeta na seção pendente
  if (aiResult && pendingKey && !aiLoading) {
    updateSection(pendingKey, { content: aiResult });
    setPendingKey(null);
    resetAI();
  }

  const filledCount = CLIENT_SECTION_KEYS.filter(
    (k) => (sections[k]?.content ?? "").trim().length > 0
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Seções específicas da proposta</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Diagnóstico, objetivos, estratégia — conteúdo exclusivo para{" "}
            <strong>{client.name}</strong>. Use a IA para gerar rascunhos.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filledCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {filledCount}/{CLIENT_SECTION_KEYS.length} preenchidas
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onNext} className="gap-1.5 text-muted-foreground">
            <SkipForward className="h-3.5 w-3.5" />
            Pular
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {CLIENT_SECTION_KEYS.map((key) => {
          const entry = getEntry(sections, key);
          const collapsed = collapsedKeys.has(key);
          const isGenerating = aiLoading && generatingKey === key;
          const isFilled = entry.content.trim().length > 0;

          return (
            <Card key={key} className={!entry.is_visible ? "opacity-50" : ""}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(key)}
                      className="text-muted-foreground hover:text-foreground transition"
                    >
                      {collapsed ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                    </button>
                    <span className="font-semibold text-sm">{SECTION_LABELS[key]}</span>
                    {isFilled && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">
                        Preenchida
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isGenerating}
                      onClick={() => handleGenerateAI(key)}
                      className="text-xs gap-1.5 h-7 px-2"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      {isGenerating ? "Gerando..." : "Gerar com IA"}
                    </Button>

                    <div className="flex items-center gap-1.5">
                      {entry.is_visible ? (
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <Switch
                        checked={entry.is_visible}
                        onCheckedChange={(v) => updateSection(key, { is_visible: v })}
                        id={`vis-wiz-${key}`}
                      />
                      <Label
                        htmlFor={`vis-wiz-${key}`}
                        className="text-xs text-muted-foreground cursor-pointer"
                      >
                        {entry.is_visible ? "Visível" : "Oculta"}
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Erro de IA */}
                {aiError && generatingKey === key && !aiLoading && (
                  <p className="text-xs text-destructive mt-1 pl-6">{aiError}</p>
                )}
              </CardHeader>

              {!collapsed && (
                <CardContent className="pt-0 px-4 pb-4">
                  <Textarea
                    rows={6}
                    placeholder={`Conteúdo de "${SECTION_LABELS[key]}" para esta proposta...`}
                    value={entry.content}
                    disabled={!entry.is_visible}
                    onChange={(e) => updateSection(key, { content: e.target.value })}
                    className="resize-none text-sm font-mono"
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="outline" size="sm" onClick={onNext} className="gap-1.5">
          <SkipForward className="h-3.5 w-3.5" />
          {filledCount === 0 ? "Pular — preencher depois" : "Continuar →"}
        </Button>
      </div>
    </div>
  );
}

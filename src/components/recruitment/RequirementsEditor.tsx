/**
 * RequirementsEditor
 * Permite adicionar/editar/remover requisitos pontuados de uma vaga.
 * Cada requisito tem: label, weight (1–10), is_required (eliminatório).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { JobRequirement } from "@/types/recruitment";

// Sugestões rápidas por área
const SUGGESTIONS: Record<string, string[]> = {
  marketing: [
    "Experiência em tráfego pago (Meta/Google Ads)",
    "Experiência em gestão de redes sociais",
    "Conhecimento em copywriting",
    "Experiência com ferramentas de automação",
    "Conhecimento em SEO",
  ],
  comercial: [
    "Experiência em vendas consultivas",
    "Conhecimento em CRM",
    "Habilidade de negociação",
    "Experiência com prospecção ativa",
  ],
  financeiro: [
    "Experiência com sistemas de cobrança",
    "Conhecimento em conciliação bancária",
    "Experiência com Excel/Planilhas",
    "Conhecimento em DRE e fluxo de caixa",
  ],
  ti: [
    "Experiência com desenvolvimento web",
    "Conhecimento em banco de dados",
    "Experiência com APIs REST",
    "Conhecimento em versionamento (Git)",
  ],
};

interface Props {
  value: JobRequirement[];
  onChange: (reqs: JobRequirement[]) => void;
  department?: string | null;
}

function newReq(): JobRequirement {
  return {
    id: crypto.randomUUID(),
    label: "",
    weight: 5,
    is_required: false,
  };
}

export function RequirementsEditor({ value, onChange, department }: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const add = () => onChange([...value, newReq()]);

  const update = (id: string, patch: Partial<JobRequirement>) =>
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) => onChange(value.filter((r) => r.id !== id));

  const addSuggestion = (label: string) => {
    if (value.some((r) => r.label.toLowerCase() === label.toLowerCase())) return;
    onChange([...value, { ...newReq(), label }]);
  };

  // Detecta sugestões pela área/departamento
  const deptKey = Object.keys(SUGGESTIONS).find((k) =>
    (department ?? "").toLowerCase().includes(k)
  );
  const suggestions = deptKey ? SUGGESTIONS[deptKey] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Requisitos pontuados</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            O candidato seleciona quais possui. Cada requisito contribui para a pontuação.
          </p>
        </div>
        <div className="flex gap-2">
          {suggestions.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowSuggestions((v) => !v)}
            >
              {showSuggestions ? "Ocultar sugestões" : "Sugestões"}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Sugestões rápidas */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Clique para adicionar:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const already = value.some((r) => r.label.toLowerCase() === s.toLowerCase());
              return (
                <button
                  key={s}
                  type="button"
                  disabled={already}
                  onClick={() => addSuggestion(s)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={already ? {} : { borderColor: "hsl(var(--border))" }}
                >
                  {already ? "✓ " : "+ "}{s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de requisitos */}
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
          Nenhum requisito configurado. Clique em "Adicionar" para começar.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_auto_auto] gap-2 px-2">
            <span className="text-xs text-muted-foreground">Requisito</span>
            <span className="text-xs text-muted-foreground text-center">Peso (1–10)</span>
            <span className="text-xs text-muted-foreground text-center">Eliminatório</span>
            <span className="w-8" />
          </div>

          {value.map((req) => (
            <div
              key={req.id}
              className="grid grid-cols-[1fr_80px_auto_auto] gap-2 items-center p-2 rounded-lg border bg-muted/10"
            >
              <Input
                value={req.label}
                onChange={(e) => update(req.id, { label: e.target.value })}
                placeholder="Ex: Experiência em tráfego pago"
                className="h-8 text-sm"
              />
              <Input
                type="number"
                min={1}
                max={10}
                value={req.weight}
                onChange={(e) => update(req.id, { weight: Math.min(10, Math.max(1, Number(e.target.value))) })}
                className="h-8 text-sm text-center"
              />
              <div className="flex justify-center">
                <Switch
                  checked={req.is_required}
                  onCheckedChange={(v) => update(req.id, { is_required: v })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => remove(req.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <p className="text-xs text-muted-foreground px-1">
            Pontuação máxima dos requisitos: <strong>{value.reduce((s, r) => s + r.weight * 10, 0)} pts</strong>
            {value.some((r) => r.is_required) && (
              <span className="ml-2 text-destructive">
                · {value.filter((r) => r.is_required).length} eliminatório(s)
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// src/components/propostas/wizard/StepServicos.tsx
import { useState } from "react";
import { Plus, Trash2, Package, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type { WizardServiceDraft } from "./wizardTypes";

interface Props {
  organizationId: string;
  services: WizardServiceDraft[];
  planValue: number;
  onServicesChange: (services: WizardServiceDraft[]) => void;
  onPlanValueChange: (value: number) => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function newManual(): WizardServiceDraft {
  return { name: "", description: null, value: 0, is_bonus: false };
}

export function StepServicos({
  organizationId,
  services,
  planValue,
  onServicesChange,
  onPlanValueChange,
}: Props) {
  const { services: catalog, servicesByCategory, isLoading } = useServiceCatalog(organizationId);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const selectedIds = new Set(services.map((s) => s.catalog_id).filter(Boolean));
  const totalIndividual = services.filter((s) => !s.is_bonus).reduce((s, i) => s + i.value, 0);
  const savings = totalIndividual > 0 && planValue > 0 ? totalIndividual - planValue : 0;

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function toggleCatalogItem(catalogId: string) {
    if (selectedIds.has(catalogId)) {
      onServicesChange(services.filter((s) => s.catalog_id !== catalogId));
    } else {
      const svc = catalog.find((s) => s.id === catalogId);
      if (!svc) return;
      onServicesChange([
        ...services,
        {
          catalog_id: svc.id,
          name: svc.name,
          description: svc.description_text ?? null,
          value: 0,
          is_bonus: false,
        },
      ]);
    }
  }

  function updateService(idx: number, patch: Partial<WizardServiceDraft>) {
    onServicesChange(services.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeService(idx: number) {
    onServicesChange(services.filter((_, i) => i !== idx));
  }

  function addManual() {
    onServicesChange([...services, newManual()]);
  }

  const categories = Object.keys(servicesByCategory).sort();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Quais serviços fazem parte desta proposta?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione do catálogo e defina o valor de cada um. Você também pode adicionar itens manuais.
        </p>
      </div>

      {/* Catálogo */}
      {!isLoading && catalog.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Catálogo de serviços
            </span>
            {selectedIds.size > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {categories.map((cat) => {
                const items = servicesByCategory[cat];
                const isOpen = expandedCategories[cat] !== false; // aberto por padrão
                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {cat}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {items.length} serviço{items.length !== 1 ? "s" : ""}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="divide-y border-t bg-background">
                        {items.map((svc) => {
                          const sel = selectedIds.has(svc.id);
                          return (
                            <button
                              key={svc.id}
                              type="button"
                              onClick={() => toggleCatalogItem(svc.id)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                sel ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/20"
                              )}
                            >
                              <div
                                className={cn(
                                  "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                                  sel
                                    ? "bg-primary border-primary"
                                    : "border-muted-foreground/40"
                                )}
                              >
                                {sel && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{svc.name}</span>
                                {svc.modality && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    · {svc.modality}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {catalog.length === 0 && !isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Package className="h-5 w-5 shrink-0 opacity-50" />
          Nenhum serviço no catálogo. Configure em{" "}
          <span className="underline">Configurações → Serviços/Produtos</span>.
        </div>
      )}

      {/* Itens selecionados + valores inline */}
      {services.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Itens da proposta — defina o valor de cada um
          </p>

          {services.map((svc, idx) => (
            <div
              key={`${svc.catalog_id ?? "manual"}-${idx}`}
              className="flex gap-2 items-start p-3 rounded-lg border bg-muted/10"
            >
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input
                    maxLength={120}
                    placeholder="Nome do serviço"
                    value={svc.name}
                    onChange={(e) => updateService(idx, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    maxLength={500}
                    placeholder="Opcional"
                    value={svc.description ?? ""}
                    onChange={(e) =>
                      updateService(idx, { description: e.target.value || null })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-28"
                    placeholder="0,00"
                    value={svc.value || ""}
                    onChange={(e) =>
                      updateService(idx, {
                        value: Math.min(999999.99, Math.max(0, parseFloat(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-1.5 pb-1">
                  <Switch
                    checked={svc.is_bonus}
                    onCheckedChange={(v) => updateService(idx, { is_bonus: v })}
                    id={`bonus-wiz-${idx}`}
                  />
                  <Label htmlFor={`bonus-wiz-${idx}`} className="text-xs cursor-pointer">
                    🎁 Bônus
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 self-end"
                  onClick={() => removeService(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botão manual */}
      <Button
        variant="outline"
        size="sm"
        onClick={addManual}
        className="border-dashed gap-2 w-full sm:w-auto"
      >
        <Plus className="h-4 w-4" /> Adicionar item manualmente
      </Button>

      {/* Resumo de valores */}
      {services.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total individual</span>
            <span className="font-semibold">{fmt(totalIndividual)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap shrink-0">Valor do plano (R$)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              className="w-36"
              placeholder="0,00"
              value={planValue || ""}
              onChange={(e) => onPlanValueChange(parseFloat(e.target.value) || 0)}
            />
          </div>
          {savings > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
              <span>Economia para o cliente</span>
              <span className="font-bold">
                {fmt(savings)} ({((savings / totalIndividual) * 100).toFixed(0)}%)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// src/components/propostas/wizard/StepServicos.tsx
// Step 1 do wizard — seleção de entregáveis.
// O closer seleciona quais serviços e quais entregáveis de cada serviço
// fazem parte desta proposta. Preço/bônus são definidos no Financeiro.

import { useState } from "react";
import {
  Package, ChevronDown, ChevronRight, Check, X,
  ChevronUp, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type { ServiceCatalogItem, ServiceDeliverable } from "@/types/contracts";
import type { WizardServiceDraft } from "./wizardTypes";

// ─── Helpers de tipo de entrega ──────────────────────────────────────────────
const DELIVERY_TYPE_LABEL: Record<string, string> = {
  recorrente: "Recorrente",
  unico:      "Único",
  pontual:    "Pontual",
};

const DELIVERY_TYPE_COLOR: Record<string, string> = {
  recorrente: "bg-blue-50 text-blue-700 border-blue-200",
  unico:      "bg-purple-50 text-purple-700 border-purple-200",
  pontual:    "bg-amber-50 text-amber-700 border-amber-200",
};

// Formata o texto descritivo de um entregável
function formatDeliverable(d: ServiceDeliverable): string {
  if (d.output_format === "texto" && d.text_value) return d.text_value;
  if (d.output_format === "numero" && d.unit) return `Por ${d.unit}`;
  return "";
}

interface Props {
  organizationId: string;
  services: WizardServiceDraft[];
  onServicesChange: (services: WizardServiceDraft[]) => void;
}

export function StepServicos({ organizationId, services, onServicesChange }: Props) {
  const { services: catalog, servicesByCategory, isLoading } =
    useServiceCatalog(organizationId);

  // Categorias expandidas no catálogo (abertas por padrão)
  const [expandedCategories, setExpandedCategories] =
    useState<Record<string, boolean>>({});

  // Serviços com painel de entregáveis aberto
  const [expandedDeliverables, setExpandedDeliverables] =
    useState<Record<string, boolean>>({});

  const selectedIds = new Set(services.map((s) => s.catalog_id).filter(Boolean));

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function toggleDeliverablesPanel(catalogId: string) {
    setExpandedDeliverables((prev) => ({ ...prev, [catalogId]: !prev[catalogId] }));
  }

  /** Retorna os IDs dos entregáveis incluídos para um serviço do draft */
  function getIncluded(draft: WizardServiceDraft, catalogItem: ServiceCatalogItem): Set<string> {
    // undefined = todos incluídos (padrão)
    if (draft.deliverables_included === undefined) {
      return new Set(catalogItem.deliverables.map((d) => d.id));
    }
    return new Set(draft.deliverables_included);
  }

  function toggleCatalogItem(catalogId: string) {
    if (selectedIds.has(catalogId)) {
      // Desseleciona: remove do draft e fecha painel
      onServicesChange(services.filter((s) => s.catalog_id !== catalogId));
      setExpandedDeliverables((prev) => ({ ...prev, [catalogId]: false }));
    } else {
      const svc = catalog.find((s) => s.id === catalogId);
      if (!svc) return;
      onServicesChange([
        ...services,
        {
          catalog_id:            svc.id,
          name:                  svc.name,
          description:           svc.description_text ?? null,
          value:                 0,
          is_bonus:              false,
          // undefined = todos os entregáveis incluídos por padrão
          deliverables_included: undefined,
        },
      ]);
      // Abre o painel de entregáveis automaticamente se houver algum
      if (svc.deliverables.length > 0) {
        setExpandedDeliverables((prev) => ({ ...prev, [catalogId]: true }));
      }
    }
  }

  /** Toggle de um entregável individual dentro de um serviço selecionado */
  function toggleDeliverable(
    catalogId: string,
    deliverableId: string,
    allDeliverableIds: string[],
  ) {
    onServicesChange(
      services.map((s) => {
        if (s.catalog_id !== catalogId) return s;
        // Resolve o conjunto atual de incluídos
        const current = s.deliverables_included === undefined
          ? new Set(allDeliverableIds)
          : new Set(s.deliverables_included);

        if (current.has(deliverableId)) {
          current.delete(deliverableId);
        } else {
          current.add(deliverableId);
        }
        return { ...s, deliverables_included: Array.from(current) };
      }),
    );
  }

  /** Marca/desmarca todos os entregáveis de um serviço de uma vez */
  function toggleAllDeliverables(catalogId: string, allDeliverableIds: string[], includeAll: boolean) {
    onServicesChange(
      services.map((s) =>
        s.catalog_id !== catalogId
          ? s
          : { ...s, deliverables_included: includeAll ? undefined : [] },
      ),
    );
  }

  function removeService(catalogId: string | undefined, idx: number) {
    if (catalogId) {
      onServicesChange(services.filter((s) => s.catalog_id !== catalogId));
      setExpandedDeliverables((prev) => ({ ...prev, [catalogId]: false }));
    } else {
      onServicesChange(services.filter((_, i) => i !== idx));
    }
  }

  const categories = Object.keys(servicesByCategory).sort();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Quais serviços fazem parte desta proposta?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione os serviços e defina quais entregáveis de cada um serão incluídos.
          Preços e condições são definidos na etapa <strong>Financeiro</strong>.
        </p>
      </div>

      {/* ── Catálogo ── */}
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
                const isOpen = expandedCategories[cat] !== false;
                return (
                  <div key={cat}>
                    {/* Cabeçalho da categoria */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors text-left"
                    >
                      {isOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      {cat}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {items.length} serviço{items.length !== 1 ? "s" : ""}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t bg-background">
                        {items.map((svc) => {
                          const sel = selectedIds.has(svc.id);
                          const draft = services.find((s) => s.catalog_id === svc.id);
                          const hasDeliverables = svc.deliverables.length > 0;
                          const delivPanelOpen = !!expandedDeliverables[svc.id];
                          const allIds = svc.deliverables.map((d) => d.id);
                          const included = draft ? getIncluded(draft, svc) : new Set<string>();
                          const includedCount = draft ? included.size : 0;
                          const allIncluded = includedCount === svc.deliverables.length;

                          return (
                            <div key={svc.id} className={cn("border-b last:border-0", sel && "bg-primary/5")}>
                              {/* Linha do serviço */}
                              <div className="flex items-center gap-3 px-4 py-2.5">
                                {/* Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => toggleCatalogItem(svc.id)}
                                  className="shrink-0"
                                >
                                  <div className={cn(
                                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                                    sel ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary/60"
                                  )}>
                                    {sel && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                                  </div>
                                </button>

                                {/* Nome + modalidade */}
                                <button
                                  type="button"
                                  onClick={() => toggleCatalogItem(svc.id)}
                                  className="flex-1 text-left min-w-0"
                                >
                                  <span className="text-sm font-medium">{svc.name}</span>
                                  {svc.modality && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      · {svc.modality}
                                    </span>
                                  )}
                                </button>

                                {/* Badge de entregáveis + botão expandir */}
                                {sel && hasDeliverables && (
                                  <button
                                    type="button"
                                    onClick={() => toggleDeliverablesPanel(svc.id)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                  >
                                    <span className={cn(
                                      "font-medium tabular-nums",
                                      includedCount < svc.deliverables.length && "text-amber-600"
                                    )}>
                                      {includedCount}/{svc.deliverables.length} entregáveis
                                    </span>
                                    {delivPanelOpen
                                      ? <ChevronUp className="h-3.5 w-3.5" />
                                      : <ChevronDown className="h-3.5 w-3.5" />}
                                  </button>
                                )}

                                {/* Indicador quando não selecionado mas tem entregáveis */}
                                {!sel && hasDeliverables && (
                                  <span className="text-[11px] text-muted-foreground/60 shrink-0 hidden sm:block">
                                    {svc.deliverables.length} entregáveis
                                  </span>
                                )}
                              </div>

                              {/* Painel de entregáveis — só quando selecionado e expandido */}
                              {sel && hasDeliverables && delivPanelOpen && draft && (
                                <div className="px-4 pb-3 pt-1 border-t bg-muted/20">
                                  {/* Cabeçalho do painel */}
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                      Entregáveis incluídos
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleAllDeliverables(svc.id, allIds, !allIncluded)
                                      }
                                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                      {allIncluded ? "Desmarcar todos" : "Marcar todos"}
                                    </button>
                                  </div>

                                  {/* Lista de entregáveis */}
                                  <div className="space-y-1">
                                    {svc.deliverables.map((d) => {
                                      const isIncluded = included.has(d.id);
                                      const desc = formatDeliverable(d);
                                      const typeLabel = DELIVERY_TYPE_LABEL[d.delivery_type] ?? d.delivery_type;
                                      const typeColor = DELIVERY_TYPE_COLOR[d.delivery_type] ?? "bg-gray-50 text-gray-600 border-gray-200";

                                      return (
                                        <button
                                          key={d.id}
                                          type="button"
                                          onClick={() =>
                                            toggleDeliverable(svc.id, d.id, allIds)
                                          }
                                          className={cn(
                                            "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-all",
                                            isIncluded
                                              ? "bg-white border-primary/20 hover:border-primary/40"
                                              : "bg-transparent border-dashed border-muted-foreground/20 opacity-50 hover:opacity-70"
                                          )}
                                        >
                                          {/* Checkbox mini */}
                                          <div className={cn(
                                            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                                            isIncluded
                                              ? "bg-primary border-primary"
                                              : "border-muted-foreground/30"
                                          )}>
                                            {isIncluded && (
                                              <Check className="h-2.5 w-2.5 text-primary-foreground" />
                                            )}
                                          </div>

                                          {/* Conteúdo */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs font-medium leading-tight">
                                                {d.name}
                                              </span>
                                              <span className={cn(
                                                "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                                                typeColor
                                              )}>
                                                {typeLabel}
                                              </span>
                                            </div>
                                            {desc && (
                                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                                {desc}
                                              </p>
                                            )}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
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

      {/* ── Resumo dos selecionados ── */}
      {services.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selecionados ({services.length})
          </p>
          <div className="rounded-lg border divide-y overflow-hidden">
            {services.map((svc, idx) => {
              const catalogItem = catalog.find((c) => c.id === svc.catalog_id);
              const hasDeliverables = catalogItem && catalogItem.deliverables.length > 0;
              const included = catalogItem
                ? getIncluded(svc, catalogItem)
                : new Set<string>();
              const totalDelivs = catalogItem?.deliverables.length ?? 0;
              const allIncl = included.size === totalDelivs;

              return (
                <div
                  key={`${svc.catalog_id ?? "manual"}-${idx}`}
                  className="flex items-center gap-3 px-4 py-2.5 bg-background"
                >
                  <div className="w-2 h-2 rounded-full shrink-0 bg-primary/60" />
                  <span className="flex-1 text-sm font-medium truncate">{svc.name}</span>
                  {hasDeliverables && (
                    <span className={cn(
                      "text-xs tabular-nums shrink-0",
                      !allIncl ? "text-amber-600 font-medium" : "text-muted-foreground"
                    )}>
                      {included.size}/{totalDelivs} entregáveis
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeService(svc.catalog_id, idx)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Valores, bônus e condições de pagamento são definidos na próxima etapa.
          </p>
        </div>
      )}
    </div>
  );
}

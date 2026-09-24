// src/components/contracts/form/ServicesSelectorSection.tsx
// Seletor de serviços para o formulário de contrato.
// Redesign v2: entregáveis com checkbox de inclusão, campos condicionais por
// formato (texto/numero) e prazo configurável por entregável.
// Requirements: 5.1, 5.2, 5.3, 5.6, 5.7

import { useEffect, useRef, useState } from "react";
import {
  X,
  AlertTriangle,
  PackageOpen,
  ChevronDown,
  ChevronUp,
  Tag,
  Target,
  ListChecks,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type {
  SelectedService,
  SelectedDeliverable,
  ServiceCatalogItem,
  ServiceDeliverable,
  DeliverablePeriod,
  DeadlineType,
} from "@/types/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServicesSelectorSectionProps {
  organizationId: string;
  value: SelectedService[];
  onChange: (services: SelectedService[]) => void;
  onValidationChange?: (hasInvalid: boolean) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  recorrente: "Recorrente",
  unico:      "Único",
  pontual:    "Pontual",
};

const PERIOD_OPTIONS: { value: DeliverablePeriod; label: string }[] = [
  { value: "dia",         label: "Por dia" },
  { value: "semana",      label: "Por semana" },
  { value: "mes",         label: "Por mês" },
  { value: "vigencia",    label: "Durante a vigência" },
  { value: "nao_indicar", label: "Não indicar período" },
];

const DEADLINE_TYPE_OPTIONS: { value: DeadlineType; label: string }[] = [
  { value: "dias",        label: "Dias" },
  { value: "meses",       label: "Meses" },
  { value: "data_limite", label: "Data limite" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the initial SelectedDeliverable list for a service when it is first
 * added to the contract. All deliverables start as included = true.
 */
function buildInitialDeliverables(
  catalogDeliverables: ServiceDeliverable[]
): SelectedDeliverable[] {
  return catalogDeliverables.map((d) => ({
    deliverable_id: d.id,
    included: true,
    number_value: null,
    period: null,
    deadline_type: null,
    deadline_value: null,
    execution_format: null,
  }));
}

// ---------------------------------------------------------------------------
// ServicesSelectorSection
// ---------------------------------------------------------------------------

export function ServicesSelectorSection({
  organizationId,
  value,
  onChange,
  onValidationChange,
  disabled,
}: ServicesSelectorSectionProps) {
  const { services, isLoading } = useServiceCatalog(organizationId);

  const availableServices = services.filter(
    (svc) => !value.some((sel) => sel.service_id === svc.id)
  );

  const catalogMap = new Map<string, ServiceCatalogItem>(
    services.map((s) => [s.id, s])
  );

  const hasInvalid = value.some((sel) => !catalogMap.has(sel.service_id));

  const onValidationChangeRef = useRef(onValidationChange);
  onValidationChangeRef.current = onValidationChange;
  useEffect(() => {
    onValidationChangeRef.current?.(hasInvalid);
  }, [hasInvalid]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectService(serviceId: string) {
    const svc = catalogMap.get(serviceId);
    if (!svc) return;

    const newEntry: SelectedService = {
      service_id: svc.id,
      service_name: svc.name,
      selected_deliverables: buildInitialDeliverables(svc.deliverables),
    };
    onChange([...value, newEntry]);
  }

  function handleRemoveService(serviceId: string) {
    onChange(value.filter((sel) => sel.service_id !== serviceId));
  }

  function handleDeliverableChange(
    serviceId: string,
    updated: SelectedDeliverable
  ) {
    onChange(
      value.map((sel) => {
        if (sel.service_id !== serviceId) return sel;
        return {
          ...sel,
          selected_deliverables: sel.selected_deliverables.map((sd) =>
            sd.deliverable_id === updated.deliverable_id ? updated : sd
          ),
        };
      })
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">
        Serviços Contratados <span className="text-destructive">*</span>
      </Label>

      {/* Dropdown para adicionar serviços */}
      <Select
        value=""
        onValueChange={handleSelectService}
        disabled={disabled || isLoading || availableServices.length === 0}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              isLoading
                ? "Carregando serviços..."
                : availableServices.length === 0 && services.length > 0
                ? "Todos os serviços já foram selecionados"
                : availableServices.length === 0
                ? "Nenhum serviço disponível no catálogo"
                : "Adicionar serviço..."
            }
          />
        </SelectTrigger>
        <SelectContent>
          {availableServices.map((svc) => (
            <SelectItem key={svc.id} value={svc.id}>
              {svc.name}
              {svc.category ? (
                <span className="ml-1 text-muted-foreground text-xs">
                  — {svc.category}
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Empty state */}
      {value.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center justify-center">
          <PackageOpen className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">Nenhum serviço selecionado</p>
        </div>
      )}

      {/* Selected services */}
      {value.length > 0 && (
        <div className="space-y-3">
          {value.map((sel) => {
            const catalogItem = catalogMap.get(sel.service_id);
            return (
              <SelectedServiceCard
                key={sel.service_id}
                selected={sel}
                catalogItem={catalogItem}
                isInvalid={!catalogItem}
                disabled={disabled}
                onRemove={() => handleRemoveService(sel.service_id)}
                onDeliverableChange={(updated) =>
                  handleDeliverableChange(sel.service_id, updated)
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectedServiceCard
// ---------------------------------------------------------------------------

interface SelectedServiceCardProps {
  selected: SelectedService;
  catalogItem: ServiceCatalogItem | undefined;
  isInvalid: boolean;
  disabled?: boolean;
  onRemove: () => void;
  onDeliverableChange: (updated: SelectedDeliverable) => void;
}

function SelectedServiceCard({
  selected,
  catalogItem,
  isInvalid,
  disabled,
  onRemove,
  onDeliverableChange,
}: SelectedServiceCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(true);

  return (
    <div
      className={`rounded-lg border bg-card shadow-sm ${
        isInvalid ? "border-destructive/60 bg-destructive/5" : "border-border"
      }`}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium leading-none">
            {selected.service_name}
          </span>
          {catalogItem?.modality && (
            <span className="ml-2 text-xs text-muted-foreground">
              · {catalogItem.modality}
            </span>
          )}
        </div>

        {catalogItem && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailsOpen((v) => !v)}
            className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground shrink-0"
            aria-label={detailsOpen ? "Ocultar entregáveis" : "Ver entregáveis"}
          >
            {detailsOpen ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span className="text-xs">Ocultar</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span className="text-xs">Entregáveis</span>
              </>
            )}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover serviço ${selected.service_name}`}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Informações do serviço + entregáveis ── */}
      {detailsOpen && catalogItem && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-4">

          {/* Escopo (somente leitura) */}
          {catalogItem.scope && (
            <div className="flex items-start gap-1.5">
              <Target className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {catalogItem.scope}
              </p>
            </div>
          )}

          {/* Entregáveis */}
          {catalogItem.deliverables.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Entregáveis
                </span>
              </div>

              <div className="space-y-2">
                {catalogItem.deliverables.map((catalogDel) => {
                  const selDel = selected.selected_deliverables.find(
                    (sd) => sd.deliverable_id === catalogDel.id
                  ) ?? {
                    deliverable_id: catalogDel.id,
                    included: true,
                    number_value: null,
                    period: null,
                    deadline_type: null,
                    deadline_value: null,
                    execution_format: null,
                  };

                  return (
                    <DeliverableContractRow
                      key={catalogDel.id}
                      catalogDeliverable={catalogDel}
                      selected={selDel}
                      isHibrida={catalogItem.modality === "Híbrida (consultiva e executiva)"}
                      disabled={disabled}
                      onChange={onDeliverableChange}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nenhum entregável configurado para este serviço.
            </p>
          )}
        </div>
      )}

      {/* ── Serviço inválido ── */}
      {isInvalid && (
        <div className="px-4 pb-3">
          <Alert variant="destructive" className="py-2 px-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs ml-1">
              Serviço removido do catálogo. Remova-o para salvar.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeliverableContractRow
// Renderiza um entregável dentro do card de serviço no cadastro do contrato.
// ---------------------------------------------------------------------------

interface DeliverableContractRowProps {
  catalogDeliverable: ServiceDeliverable;
  selected: SelectedDeliverable;
  /** Quando true, exibe o campo "Formato de execução" (consultivo / executivo) */
  isHibrida?: boolean;
  disabled?: boolean;
  onChange: (updated: SelectedDeliverable) => void;
}

function DeliverableContractRow({
  catalogDeliverable: cd,
  selected,
  isHibrida,
  disabled,
  onChange,
}: DeliverableContractRowProps) {
  const isRecurrenteNumero =
    cd.delivery_type === "recorrente" && cd.output_format === "numero";

  function update(patch: Partial<SelectedDeliverable>) {
    onChange({ ...selected, ...patch });
  }

  function handleToggleIncluded(checked: boolean) {
    update({ included: checked });
  }

  function handleDeadlineTypeChange(val: string) {
    update({
      deadline_type: val as DeadlineType,
      deadline_value: null,
    });
  }

  return (
    <div
      className={`rounded-md border transition-colors ${
        selected.included
          ? "border-border bg-background"
          : "border-border/40 bg-muted/30 opacity-60"
      }`}
    >
      {/* ── Linha do entregável: checkbox + nome + badges ── */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          checked={selected.included}
          onCheckedChange={handleToggleIncluded}
          disabled={disabled}
          aria-label={`Incluir entregável ${cd.name}`}
          id={`del-${cd.id}`}
        />

        <label
          htmlFor={`del-${cd.id}`}
          className="flex-1 min-w-0 cursor-pointer"
        >
          <span className="text-sm font-medium leading-none">{cd.name}</span>
        </label>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
            {DELIVERY_TYPE_LABELS[cd.delivery_type] ?? cd.delivery_type}
          </Badge>
          {cd.output_format === "texto" ? (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              Texto fixo
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              {cd.unit
                ? cd.unit_plural
                  ? `${cd.unit} / ${cd.unit_plural}`
                  : cd.unit
                : "Quantidade"}
            </Badge>
          )}
          {isHibrida && selected.included && selected.execution_format && (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 capitalize ${
                selected.execution_format === "consultivo"
                  ? "border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-orange-400 text-orange-600 dark:text-orange-400"
              }`}
            >
              {selected.execution_format === "consultivo" ? "Consultivo" : "Executivo"}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Campos de preenchimento (somente quando incluído) ── */}
      {selected.included && (
        <div className="border-t border-border/40 px-3 py-3 space-y-3">

          {/* Formato texto → exibe o texto fixo do catálogo, sem campo editável */}
          {cd.output_format === "texto" && cd.text_value && (
            <div className="rounded-md bg-muted/50 border border-border/60 px-3 py-2">
              <p className="text-xs text-muted-foreground mb-0.5">Descrição do entregável</p>
              <p className="text-sm leading-relaxed">{cd.text_value}</p>
            </div>
          )}

          {/* Formato numero → campo de quantidade */}
          {cd.output_format === "numero" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {cd.unit
                    ? `Quantidade (${cd.unit_plural ?? cd.unit})`
                    : "Quantidade"}
                  <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={cd.unit ? `Qtd. de ${cd.unit_plural ?? cd.unit}` : "Ex: 10"}
                  disabled={disabled}
                  value={selected.number_value ?? ""}
                  onChange={(e) =>
                    update({
                      number_value:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="h-8 text-sm"
                  aria-label={`Quantidade de ${cd.name}`}
                />
              </div>

              {/* Período (somente recorrente) */}
              {isRecurrenteNumero && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Período
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Select
                    value={selected.period ?? ""}
                    onValueChange={(val) =>
                      update({ period: val as DeliverablePeriod })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Formato de execução — somente quando o serviço é Híbrido */}
          {isHibrida && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Formato de execução
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Select
                value={selected.execution_format ?? ""}
                onValueChange={(val) =>
                  update({ execution_format: val as 'consultivo' | 'executivo' })
                }
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecionar formato..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultivo">Consultivo</SelectItem>
                  <SelectItem value="executivo">Executivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Prazo — configurável para todos os formatos */}
          <DeadlineSection
            selected={selected}
            disabled={disabled}
            onDeadlineTypeChange={handleDeadlineTypeChange}
            onUpdate={update}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeadlineSection
// Seção de prazo configurável no contrato — aparece para todos os formatos.
// ---------------------------------------------------------------------------

interface DeadlineSectionProps {
  selected: SelectedDeliverable;
  disabled?: boolean;
  onDeadlineTypeChange: (val: string) => void;
  onUpdate: (patch: Partial<SelectedDeliverable>) => void;
}

function DeadlineSection({
  selected,
  disabled,
  onDeadlineTypeChange,
  onUpdate,
}: DeadlineSectionProps) {
  const hasDeadline = !!selected.deadline_type;

  return (
    <div className="space-y-2">
      <Separator className="opacity-50" />

      {/* Toggle de prazo */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`deadline-toggle-${selected.deliverable_id}`}
          checked={hasDeadline}
          onCheckedChange={(checked) => {
            if (!checked) {
              onUpdate({ deadline_type: null, deadline_value: null });
            } else {
              onUpdate({ deadline_type: "dias", deadline_value: null });
            }
          }}
          disabled={disabled}
          aria-label="Definir prazo para este entregável"
        />
        <label
          htmlFor={`deadline-toggle-${selected.deliverable_id}`}
          className="flex items-center gap-1.5 cursor-pointer"
        >
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Definir prazo para este entregável
          </span>
        </label>
      </div>

      {/* Campos de prazo (somente quando ativado) */}
      {hasDeadline && (
        <div className="grid grid-cols-2 gap-2 pl-6">
          {/* Tipo de prazo */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tipo de prazo</Label>
            <Select
              value={selected.deadline_type ?? ""}
              onValueChange={onDeadlineTypeChange}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {DEADLINE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor do prazo */}
          <div className="space-y-1">
            {selected.deadline_type === "data_limite" ? (
              <>
                <Label className="text-xs text-muted-foreground">Data limite</Label>
                <Input
                  type="date"
                  disabled={disabled}
                  value={
                    typeof selected.deadline_value === "string"
                      ? selected.deadline_value
                      : ""
                  }
                  onChange={(e) =>
                    onUpdate({ deadline_value: e.target.value || null })
                  }
                  className="h-8 text-sm"
                  aria-label="Data limite"
                />
              </>
            ) : (
              <>
                <Label className="text-xs text-muted-foreground">
                  {selected.deadline_type === "dias" ? "Qtd. de dias" : "Qtd. de meses"}
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={selected.deadline_type === "dias" ? "Ex: 30" : "Ex: 3"}
                  disabled={disabled}
                  value={
                    typeof selected.deadline_value === "number"
                      ? selected.deadline_value
                      : ""
                  }
                  onChange={(e) =>
                    onUpdate({
                      deadline_value:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="h-8 text-sm"
                  aria-label={
                    selected.deadline_type === "dias"
                      ? "Quantidade de dias"
                      : "Quantidade de meses"
                  }
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legado — ServiceDetailsPanel mantido para retrocompatibilidade caso
// algum outro local ainda o importe. Pode ser removido quando não houver mais
// referências externas.
// ---------------------------------------------------------------------------

interface ServiceDetailsPanelProps {
  catalogItem: ServiceCatalogItem;
}

/** @deprecated Use SelectedServiceCard directly — detalhes agora inline. */
export function ServiceDetailsPanel({ catalogItem }: ServiceDetailsPanelProps) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
      {catalogItem.modality && (
        <div className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Modalidade:</span>
          <span className="text-xs font-medium">{catalogItem.modality}</span>
        </div>
      )}
      {catalogItem.scope && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Escopo:</span>
          </div>
          <p className="text-xs pl-5 leading-relaxed">{catalogItem.scope}</p>
        </div>
      )}
    </div>
  );
}

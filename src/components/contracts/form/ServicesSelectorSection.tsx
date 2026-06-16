// src/components/contracts/form/ServicesSelectorSection.tsx
// Seletor múltiplo de serviços com sub-serviços tipados para o formulário de contrato.
// Requirements: 5.1, 5.2, 5.3, 5.6, 5.7

import { useEffect, useRef } from "react";
import { X, AlertTriangle, PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import type { SelectedService, ServiceCatalogItem, SubService } from "@/types/contracts";

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

  // ── Derived state ──────────────────────────────────────────────────────────

  /** Services from the catalog that haven't been selected yet */
  const availableServices = services.filter(
    (svc) => !value.some((sel) => sel.service_id === svc.id)
  );

  /** Map service_id → catalog item for quick lookup */
  const catalogMap = new Map<string, ServiceCatalogItem>(
    services.map((s) => [s.id, s])
  );

  /** Identify selected services whose service_id is no longer in the catalog */
  const hasInvalid = value.some((sel) => !catalogMap.has(sel.service_id));

  // ── Notify parent of validation state changes ──────────────────────────────

  // Use a ref to avoid re-registering the effect when onValidationChange identity changes
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
      sub_service_values: {},
    };
    onChange([...value, newEntry]);
  }

  function handleRemoveService(serviceId: string) {
    onChange(value.filter((sel) => sel.service_id !== serviceId));
  }

  function handleSubServiceChange(
    serviceId: string,
    subServiceId: string,
    newValue: string | number | boolean
  ) {
    onChange(
      value.map((sel) => {
        if (sel.service_id !== serviceId) return sel;
        return {
          ...sel,
          sub_service_values: {
            ...sel.sub_service_values,
            [subServiceId]: newValue,
          },
        };
      })
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Label */}
      <Label className="text-sm font-medium">
        Serviços Contratados <span className="text-destructive">*</span>
      </Label>

      {/* Dropdown to add services — Requirement 5.1 */}
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

      {/* Empty state — Requirement 5.6 */}
      {value.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center justify-center">
          <PackageOpen className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">Nenhum serviço selecionado</p>
        </div>
      )}

      {/* Selected services list */}
      {value.length > 0 && (
        <div className="space-y-3">
          {value.map((sel) => {
            const catalogItem = catalogMap.get(sel.service_id);
            const isInvalid = !catalogItem;

            return (
              <SelectedServiceCard
                key={sel.service_id}
                selected={sel}
                catalogItem={catalogItem}
                isInvalid={isInvalid}
                disabled={disabled}
                onRemove={() => handleRemoveService(sel.service_id)}
                onSubServiceChange={(subId, val) =>
                  handleSubServiceChange(sel.service_id, subId, val)
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
// SelectedServiceCard — individual selected service with sub-service fields
// ---------------------------------------------------------------------------

interface SelectedServiceCardProps {
  selected: SelectedService;
  catalogItem: ServiceCatalogItem | undefined;
  isInvalid: boolean;
  disabled?: boolean;
  onRemove: () => void;
  onSubServiceChange: (subServiceId: string, value: string | number | boolean) => void;
}

function SelectedServiceCard({
  selected,
  catalogItem,
  isInvalid,
  disabled,
  onRemove,
  onSubServiceChange,
}: SelectedServiceCardProps) {
  return (
    <div
      className={`rounded-lg border bg-card p-4 space-y-3 ${
        isInvalid ? "border-destructive/60 bg-destructive/5" : "border-border"
      }`}
    >
      {/* Header: service name + remove button — Requirements 5.2, 5.3 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {selected.service_name}
        </span>
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

      {/* Invalid service alert — Requirement 5.7 */}
      {isInvalid && (
        <Alert variant="destructive" className="py-2 px-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs ml-1">
            Serviço removido do catálogo. Remova-o para salvar.
          </AlertDescription>
        </Alert>
      )}

      {/* Sub-service fields — Requirement 5.2 */}
      {catalogItem && catalogItem.sub_services.length > 0 && (
        <div className="space-y-3 pt-1 border-t border-border/50">
          {catalogItem.sub_services.map((sub) => (
            <SubServiceField
              key={sub.id}
              subService={sub}
              value={selected.sub_service_values[sub.id]}
              disabled={disabled}
              onChange={(val) => onSubServiceChange(sub.id, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubServiceField — renders the correct input for each sub-service type
// ---------------------------------------------------------------------------

interface SubServiceFieldProps {
  subService: SubService;
  value: string | number | boolean | undefined;
  disabled?: boolean;
  onChange: (value: string | number | boolean) => void;
}

function SubServiceField({ subService, value, disabled, onChange }: SubServiceFieldProps) {
  const { id, name, type, options } = subService;
  const labelId = `sub-svc-${id}`;

  return (
    <div className="space-y-1">
      {type !== "boolean" && (
        <Label htmlFor={labelId} className="text-xs text-muted-foreground">
          {name}
        </Label>
      )}

      {type === "text" && (
        <Input
          id={labelId}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={name}
          className="h-8 text-sm"
        />
      )}

      {type === "number" && (
        <Input
          id={labelId}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            const parsed = e.target.value === "" ? "" : Number(e.target.value);
            onChange(parsed as number);
          }}
          disabled={disabled}
          placeholder="0"
          className="h-8 text-sm"
        />
      )}

      {type === "boolean" && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={labelId}
            checked={typeof value === "boolean" ? value : false}
            onCheckedChange={(checked) => onChange(Boolean(checked))}
            disabled={disabled}
          />
          <Label
            htmlFor={labelId}
            className="text-sm cursor-pointer select-none"
          >
            {name}
          </Label>
        </div>
      )}

      {type === "select" && options && options.length > 0 && (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(val) => onChange(val)}
          disabled={disabled}
        >
          <SelectTrigger id={labelId} className="h-8 text-sm">
            <SelectValue placeholder={`Selecionar ${name}...`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

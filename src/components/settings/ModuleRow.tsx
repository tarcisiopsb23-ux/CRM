import { ChevronRight, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { PermFlags, PermissionModule } from "@/hooks/usePermissions";
import { ScopeRow } from "./ScopeRow";

const PERM_FIELDS: Array<{ field: keyof PermFlags; label: string }> = [
  { field: "can_view", label: "Ver" },
  { field: "can_create", label: "Criar" },
  { field: "can_edit", label: "Editar" },
  { field: "can_delete", label: "Excluir" },
];

interface ModuleRowProps {
  module: { id: PermissionModule; label: string };
  flags: PermFlags | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleFlag: (field: keyof PermFlags, value: boolean) => void;
  onMarkAll: () => void;
  onReset: () => void;
  disabled: boolean;
  scopes: Array<{ id: string; label: string }>;
  getScopeFlags: (scopeId: string) => PermFlags | undefined;
  hasScopeOverride: (scopeId: string) => boolean;
  getInheritedFlags: (scopeId: string) => PermFlags;
  onToggleScopeFlag: (scopeId: string, field: keyof PermFlags, value: boolean) => void;
  onMarkAllScope: (scopeId: string) => void;
  onResetScope: (scopeId: string) => void;
  isClientOnly: boolean;
  accessScope: "cargo" | "user";
}

export function ModuleRow({
  module,
  flags,
  isExpanded,
  onToggleExpand,
  onToggleFlag,
  onMarkAll,
  onReset,
  disabled,
  scopes,
  getScopeFlags,
  hasScopeOverride,
  getInheritedFlags,
  onToggleScopeFlag,
  onMarkAllScope,
  onResetScope,
  isClientOnly,
  accessScope,
}: ModuleRowProps) {
  return (
    <>
      <tr className="border-b hover:bg-muted/30">
        <td className="py-2 px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Colapsar" : "Expandir"} ${module.label}`}
              className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
              {module.label}
            </button>
            {isClientOnly && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Frontend only
              </span>
            )}
          </div>
        </td>
        {PERM_FIELDS.map(({ field, label }) => (
          <td key={field} className="py-2 px-3 text-center">
            <Checkbox
              aria-label={`${label} — ${module.label}`}
              checked={flags?.[field] ?? false}
              onCheckedChange={(v) => onToggleFlag(field, !!v)}
              disabled={disabled || isClientOnly}
            />
          </td>
        ))}
        <td className="py-2 px-4">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onMarkAll}
              disabled={disabled || isClientOnly}
              title="Marcar tudo"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={onReset}
              disabled={disabled || isClientOnly}
              title="Resetar"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <>
          {scopes.length === 0 ? (
            <tr className="border-b bg-muted/10">
              <td colSpan={6} className="py-2 pl-10 pr-4 text-xs text-muted-foreground italic">
                Sem sub-escopos configuráveis para este módulo.
              </td>
            </tr>
          ) : (
            scopes.map((scope) => (
              <ScopeRow
                key={scope.id}
                scopeId={scope.id}
                label={scope.label}
                flags={getScopeFlags(scope.id)}
                inheritedFlags={getInheritedFlags(scope.id)}
                hasOverride={hasScopeOverride(scope.id)}
                onToggleFlag={(field, value) => onToggleScopeFlag(scope.id, field, value)}
                onMarkAll={() => onMarkAllScope(scope.id)}
                onReset={() => onResetScope(scope.id)}
                disabled={disabled || isClientOnly}
                showInheritance={accessScope === "user"}
              />
            ))
          )}
        </>
      )}
    </>
  );
}

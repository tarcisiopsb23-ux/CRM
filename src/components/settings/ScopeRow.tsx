import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import type { PermFlags } from "@/hooks/usePermissions";
import { InheritanceBadge } from "./InheritanceBadge";

const PERM_LABELS: Array<{ field: keyof PermFlags; label: string }> = [
  { field: "can_view", label: "Ver" },
  { field: "can_create", label: "Criar" },
  { field: "can_edit", label: "Editar" },
  { field: "can_delete", label: "Excluir" },
];

interface ScopeRowProps {
  scopeId: string;
  label: string;
  flags: PermFlags | undefined;
  inheritedFlags: PermFlags;
  hasOverride: boolean;
  onToggleFlag: (field: keyof PermFlags, value: boolean) => void;
  onMarkAll: () => void;
  onReset: () => void;
  disabled: boolean;
  showInheritance: boolean;
}

export function ScopeRow({
  label,
  flags,
  inheritedFlags,
  hasOverride,
  onToggleFlag,
  onMarkAll,
  onReset,
  disabled,
  showInheritance,
}: ScopeRowProps) {
  const effective = (field: keyof PermFlags): boolean =>
    hasOverride ? (flags?.[field] ?? false) : inheritedFlags[field];

  const isInherited = !hasOverride;

  return (
    <tr className={`border-b last:border-0 bg-muted/20 ${isInherited ? "opacity-80" : ""}`}>
      <td className="py-2 pl-10 pr-4">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isInherited ? "text-muted-foreground" : ""}`}>{label}</span>
          {showInheritance && <InheritanceBadge hasOverride={hasOverride} />}
        </div>
      </td>
      {PERM_LABELS.map(({ field, label: permLabel }) => (
        <td key={field} className="py-2 px-3 text-center">
          <Checkbox
            aria-label={`${permLabel} — ${label}`}
            checked={effective(field)}
            onCheckedChange={(v) => onToggleFlag(field, !!v)}
            disabled={disabled}
            className={isInherited ? "opacity-60" : ""}
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
            disabled={disabled}
            title="Marcar tudo"
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onReset}
            disabled={disabled}
            title="Resetar"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

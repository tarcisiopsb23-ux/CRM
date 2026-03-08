import { useState } from "react";
import { SettingsSection } from "./SettingsSection";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useUserPermissions, MODULES, type PermissionModule } from "@/hooks/usePermissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const PERM_LABELS = {
  can_view: "Ver",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
} as const;

export function PermissionsSection() {
  const organizationId = useOrganization();
  const { data: profiles = [] } = useProfiles(organizationId);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: permissions = [], isLoading, upsert } = useUserPermissions(
    organizationId,
    selectedUserId
  );

  const permByModule = Object.fromEntries(
    permissions.map((p) => [p.module, p])
  ) as Record<PermissionModule, (typeof permissions)[0] | undefined>;

  const handleToggle = (
    module: PermissionModule,
    field: keyof Pick<(typeof permissions)[0], "can_view" | "can_create" | "can_edit" | "can_delete">,
    value: boolean
  ) => {
    if (!selectedUserId) return;
    const current = permByModule[module];
    upsert.mutate({
      module,
      can_view: field === "can_view" ? value : (current?.can_view ?? false),
      can_create: field === "can_create" ? value : (current?.can_create ?? false),
      can_edit: field === "can_edit" ? value : (current?.can_edit ?? false),
      can_delete: field === "can_delete" ? value : (current?.can_delete ?? false),
    });
  };

  return (
    <SettingsSection
      title="Permissões por usuário"
      description="Configure o que cada usuário pode fazer em cada módulo. Owner e admin têm acesso total."
    >
      <div className="space-y-4">
        <div>
          <Label>Selecionar usuário</Label>
          <Select
            value={selectedUserId ?? ""}
            onValueChange={(v) => setSelectedUserId(v || null)}
          >
            <SelectTrigger className="mt-1 max-w-md">
              <SelectValue placeholder="Escolha um usuário..." />
            </SelectTrigger>
            <SelectContent>
              {profiles
                .filter((p) => p.role !== "owner")
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} ({p.email}) — {p.role}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Apenas owner e admin podem alterar permissões.
          </p>
        </div>

        {selectedUserId && (
          <div className="border rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium">Módulo</th>
                      <th className="text-center py-3 px-3">{PERM_LABELS.can_view}</th>
                      <th className="text-center py-3 px-3">{PERM_LABELS.can_create}</th>
                      <th className="text-center py-3 px-3">{PERM_LABELS.can_edit}</th>
                      <th className="text-center py-3 px-3">{PERM_LABELS.can_delete}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => {
                      const p = permByModule[m.id];
                      return (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-4 font-medium">{m.label}</td>
                          {(["can_view", "can_create", "can_edit", "can_delete"] as const).map(
                            (field) => (
                              <td key={field} className="py-2 px-3 text-center">
                                <Checkbox
                                  checked={p?.[field] ?? false}
                                  onCheckedChange={(checked) =>
                                    handleToggle(m.id, field, !!checked)
                                  }
                                  disabled={upsert.isPending}
                                />
                              </td>
                            )
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {selectedUserId && profiles.find((p) => p.id === selectedUserId)?.role === "owner" && (
          <p className="text-sm text-muted-foreground">
            Usuários owner têm acesso total e não precisam de permissões configuradas.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}

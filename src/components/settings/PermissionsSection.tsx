import React, { useEffect, useMemo, useState } from "react";
import { SettingsSection } from "./SettingsSection";
import { useOrganization } from "@/hooks/useOrganization";
import { useProfiles } from "@/hooks/useProfiles";
import { useJobTitlePermissionScopes, useJobTitlePermissions, useJobTitleRoleMappings, useUserPermissionScopes, useUserPermissions, MODULES, type PermissionModule } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { getJobTitleFromProfileMetadata } from "@/lib/jobTitles";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Search, Loader2, Pencil, Trash2, Check, X, Shield } from "lucide-react";
import { UserRole } from "@/types/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

const PERM_LABELS = {
  can_view: "Ver",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
} as const;

const MODULE_VIEWS: Partial<Record<PermissionModule, Array<{ id: string; label: string }>>> = {
  financial: [
    { id: "dashboard", label: "Dashboard" },
    { id: "cashflow", label: "Fluxo de Caixa" },
    { id: "suppliers", label: "Fornecedores" },
    { id: "expenses", label: "Despesas" },
    { id: "receivables", label: "Contas a Receber" },
    { id: "payables", label: "Contas a Pagar" },
    { id: "payroll", label: "Folha de Pagamento" },
    { id: "contracts", label: "Contratos" },
    { id: "dre", label: "DRE" },
    { id: "reports", label: "Relatórios" },
  ],
  team: [
    { id: "employees", label: "Colaboradores" },
    { id: "teams", label: "Equipes" },
    { id: "payroll", label: "Folha de Pagamento" },
    { id: "timeclock", label: "Controle de Ponto" },
    { id: "timeclock_edit", label: "Editar/Excluir Registros de Ponto" },
  ],
  settings: [
    { id: "permissions", label: "Cargos e Permissões" },
    { id: "integrations", label: "Integrações" },
    { id: "general", label: "Configurações gerais" },
  ],
};

type PermFlags = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

function normalizeFlags(flags: PermFlags) {
  const next = { ...flags };
  if (!next.can_view) {
    next.can_create = false;
    next.can_edit = false;
    next.can_delete = false;
    return next;
  }
  if (next.can_create || next.can_edit || next.can_delete) {
    next.can_view = true;
  }
  return next;
}

function getFieldValue(flags: PermFlags | null | undefined, field: keyof PermFlags) {
  return flags?.[field] ?? false;
}

export function PermissionsSection() {
  const organizationId = useOrganization();
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";
  const { data: profiles = [] } = useProfiles(organizationId);
  const [mode, setMode] = useState<"cargos" | "permissoes" | "acessos">("cargos");

  const cargoCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of profiles) {
      const jt = getJobTitleFromProfileMetadata(p.metadata);
      if (!jt) continue;
      map.set(jt, (map.get(jt) ?? 0) + 1);
    }
    return map;
  }, [profiles]);

  const catalog = useJobTitleCatalog(organizationId);

  const mappings = useJobTitleRoleMappings(organizationId);

  const mappingByTitle = useMemo(() => {
    const map = new Map<string, UserRole | null>();
    for (const m of mappings.data ?? []) map.set(m.job_title, m.mapped_role);
    return map;
  }, [mappings.data]);

  const cargoOptions = useMemo(() => {
    return (catalog.data ?? []).map((r) => r.job_title);
  }, [catalog.data]);

  const [newCargo, setNewCargo] = useState("");
  const [editingCargo, setEditingCargo] = useState<string | null>(null);
  const [editingCargoValue, setEditingCargoValue] = useState("");

  const saveNewCargo = async () => {
    try {
      const title = newCargo.trim();
      if (!title) throw new Error("Informe um cargo");
      await catalog.create.mutateAsync({ job_title: title });
      setNewCargo("");
      toast.success("Cargo cadastrado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar cargo");
    }
  };

  const startEditCargo = (title: string) => {
    setEditingCargo(title);
    setEditingCargoValue(title);
  };

  const saveEditCargo = async () => {
    try {
      if (!editingCargo) return;
      const oldTitle = editingCargo.trim();
      const newTitle = editingCargoValue.trim();
      if (!oldTitle || !newTitle) throw new Error("Informe um cargo");
      if (oldTitle === newTitle) {
        setEditingCargo(null);
        return;
      }
      await catalog.rename.mutateAsync({ old_title: oldTitle, new_title: newTitle });
      setEditingCargo(null);
      toast.success("Cargo atualizado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar cargo");
    }
  };

  const deleteCargo = async (title: string) => {
    try {
      await catalog.remove.mutateAsync({ job_title: title });
      toast.success("Cargo removido");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover cargo");
    }
  };

  const [accessScope, setAccessScope] = useState<"cargo" | "user">("cargo");
  const [selectedCargo, setSelectedCargo] = useState<string | null>(cargoOptions[0] ?? null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const jobTitlePerms = useJobTitlePermissions(organizationId, accessScope === "cargo" ? selectedCargo : null);
  const jobTitlePermsData = jobTitlePerms.data;
  const jobTitleScopePerms = useJobTitlePermissionScopes(organizationId, accessScope === "cargo" ? selectedCargo : null);
  const userScopePerms = useUserPermissionScopes(organizationId, accessScope === "user" ? selectedUserId : null);
  const jobTitleScopePermsData = jobTitleScopePerms.data;
  const userScopePermsData = userScopePerms.data;

  useEffect(() => {
    if (accessScope !== "cargo") return;
    if (selectedCargo) return;
    if (!cargoOptions[0]) return;
    setSelectedCargo(cargoOptions[0]);
  }, [accessScope, cargoOptions, selectedCargo]);

  const { data: permissions = [], isLoading, upsert, remove: removeUserPerm } = useUserPermissions(
    organizationId,
    selectedUserId
  );

  const permByModule = useMemo(() => {
    const map = new Map<PermissionModule, (typeof permissions)[0]>();
    for (const p of permissions) map.set(p.module, p);
    return map;
  }, [permissions]);

  const jobPermByModule = useMemo(() => {
    const map = new Map<PermissionModule, (typeof jobTitlePermsData)[0]>();
    for (const p of jobTitlePermsData ?? []) map.set(p.module, p);
    return map;
  }, [jobTitlePermsData]);

  const jobScopeByKey = useMemo(() => {
    const map = new Map<string, (typeof jobTitleScopePermsData)[0]>();
    for (const r of jobTitleScopePermsData ?? []) {
      map.set(`${r.module}::${r.scope}`, r);
    }
    return map;
  }, [jobTitleScopePermsData]);

  const userScopeByKey = useMemo(() => {
    const map = new Map<string, (typeof userScopePermsData)[0]>();
    for (const r of userScopePermsData ?? []) {
      map.set(`${r.module}::${r.scope}`, r);
    }
    return map;
  }, [userScopePermsData]);

  const clearUserOverridesForCargo = async (module: PermissionModule, scopeId?: string) => {
    if (!organizationId) return;
    if (!selectedCargo) return;

    const supabaseUntyped = supabase as unknown as SupabaseClient;

    const ids = new Set<string>();
    const { data: byJobTitle } = await supabaseUntyped
      .from("profiles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("metadata->>job_title", selectedCargo)
      .limit(10000);
    for (const r of (byJobTitle ?? []) as Array<{ id: string }>) ids.add(r.id);

    const { data: byCargo } = await supabaseUntyped
      .from("profiles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("metadata->>cargo", selectedCargo)
      .limit(10000);
    for (const r of (byCargo ?? []) as Array<{ id: string }>) ids.add(r.id);

    const userIds = Array.from(ids);
    if (userIds.length === 0) return;

    const chunkSize = 250;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);

      if (scopeId) {
        const { error } = await supabaseUntyped
          .from("user_permission_scopes")
          .delete()
          .eq("organization_id", organizationId)
          .eq("module", module)
          .eq("scope", scopeId)
          .in("user_id", chunk);
        if (error) throw error;
      } else {
        const { error: e1 } = await supabaseUntyped
          .from("user_permissions")
          .delete()
          .eq("organization_id", organizationId)
          .eq("module", module)
          .in("user_id", chunk);
        if (e1) throw e1;

        const { error: e2 } = await supabaseUntyped
          .from("user_permission_scopes")
          .delete()
          .eq("organization_id", organizationId)
          .eq("module", module)
          .in("user_id", chunk);
        if (e2) throw e2;
      }
    }
  };

  const handleToggle = async (
    module: PermissionModule,
    field: keyof Pick<(typeof permissions)[0], "can_view" | "can_create" | "can_edit" | "can_delete">,
    value: boolean
  ) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        const current = permByModule.get(module);
        const next = normalizeFlags({
          can_view: field === "can_view" ? value : (current?.can_view ?? false),
          can_create: field === "can_create" ? value : (current?.can_create ?? false),
          can_edit: field === "can_edit" ? value : (current?.can_edit ?? false),
          can_delete: field === "can_delete" ? value : (current?.can_delete ?? false),
        });
        await upsert.mutateAsync({ module, ...next });
        return;
      }

      if (!selectedCargo) return;
      const current = jobPermByModule.get(module);
      const next = normalizeFlags({
        can_view: field === "can_view" ? value : (current?.can_view ?? false),
        can_create: field === "can_create" ? value : (current?.can_create ?? false),
        can_edit: field === "can_edit" ? value : (current?.can_edit ?? false),
        can_delete: field === "can_delete" ? value : (current?.can_delete ?? false),
      });
      await jobTitlePerms.upsert.mutateAsync({ module, ...next });
      await clearUserOverridesForCargo(module);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissões");
    }
  };

  const handleMarkAllInModule = async (module: PermissionModule) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        const current = permByModule.get(module) as unknown as PermFlags | undefined;
        const next = normalizeFlags({
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: isOwner ? true : (current?.can_delete ?? false),
        });
        await upsert.mutateAsync({ module, ...next });
        return;
      }

      if (!selectedCargo) return;
      const current = jobPermByModule.get(module) as unknown as PermFlags | undefined;
      const next = normalizeFlags({
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: isOwner ? true : (current?.can_delete ?? false),
      });
      await jobTitlePerms.upsert.mutateAsync({ module, ...next });
      await clearUserOverridesForCargo(module);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissões");
    }
  };

  const handleResetModule = async (module: PermissionModule) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        await removeUserPerm.mutateAsync({ module });
        return;
      }
      if (!selectedCargo) return;
      await jobTitlePerms.remove.mutateAsync({ module });
      await clearUserOverridesForCargo(module);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissões");
    }
  };

  const handleToggleScope = async (
    module: PermissionModule,
    scopeId: string,
    field: keyof PermFlags,
    value: boolean
  ) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        const current = userScopeByKey.get(`${module}::${scopeId}`) as unknown as PermFlags | undefined;
        const next = normalizeFlags({
          can_view: field === "can_view" ? value : getFieldValue(current ?? null, "can_view"),
          can_create: field === "can_create" ? value : getFieldValue(current ?? null, "can_create"),
          can_edit: field === "can_edit" ? value : getFieldValue(current ?? null, "can_edit"),
          can_delete: field === "can_delete" ? value : getFieldValue(current ?? null, "can_delete"),
        });
        await userScopePerms.upsert.mutateAsync({ module, scope: scopeId, ...next });
        return;
      }

      if (!selectedCargo) return;
      const current = jobScopeByKey.get(`${module}::${scopeId}`) as unknown as PermFlags | undefined;
      const next = normalizeFlags({
        can_view: field === "can_view" ? value : getFieldValue(current ?? null, "can_view"),
        can_create: field === "can_create" ? value : getFieldValue(current ?? null, "can_create"),
        can_edit: field === "can_edit" ? value : getFieldValue(current ?? null, "can_edit"),
        can_delete: field === "can_delete" ? value : getFieldValue(current ?? null, "can_delete"),
      });
      await jobTitleScopePerms.upsert.mutateAsync({ module, scope: scopeId, ...next });
      await clearUserOverridesForCargo(module, scopeId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissões");
    }
  };

  const handleMarkAllInScope = async (module: PermissionModule, scopeId: string, canDeleteFallback: boolean) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        const next = normalizeFlags({
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: isOwner ? true : canDeleteFallback,
        });
        await userScopePerms.upsert.mutateAsync({ module, scope: scopeId, ...next });
        return;
      }

      if (!selectedCargo) return;
      const next = normalizeFlags({
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: isOwner ? true : canDeleteFallback,
      });
      await jobTitleScopePerms.upsert.mutateAsync({ module, scope: scopeId, ...next });
      await clearUserOverridesForCargo(module, scopeId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissões");
    }
  };

  const handleResetScope = async (module: PermissionModule, scopeId: string) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        await userScopePerms.remove.mutateAsync({ module, scope: scopeId });
        return;
      }
      if (!selectedCargo) return;
      await jobTitleScopePerms.remove.mutateAsync({ module, scope: scopeId });
      await clearUserOverridesForCargo(module, scopeId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissões");
    }
  };

  return (
    <SettingsSection
      title="Cargos e Permissões"
      description="Cadastre cargos, vincule cargos a user_role e defina acessos por cargo/colaborador."
      icon={<Shield className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="space-y-4">
          <TabsList className="w-full flex flex-wrap justify-start">
            <TabsTrigger value="cargos">Cargos</TabsTrigger>
            <TabsTrigger value="permissoes">Permissões</TabsTrigger>
            <TabsTrigger value="acessos">Acessos</TabsTrigger>
          </TabsList>

          <TabsContent value="cargos" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>Cargo</Label>
                <Input value={newCargo} onChange={(e) => setNewCargo(e.target.value)} placeholder="Ex: SDR, Atendimento, Mídia" />
              </div>
              <div>
                <Button onClick={saveNewCargo} disabled={!isAdmin || catalog.create.isPending}>
                  Salvar
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              {catalog.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-4 font-medium">Cargo (Add colaborador)</th>
                          <th className="text-left py-3 px-4 font-medium">Permissão</th>
                          <th className="text-left py-3 px-4 font-medium">Colaboradores</th>
                          <th className="text-right py-3 px-4 font-medium">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                      {(catalog.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-4">
                            {editingCargo === r.job_title ? (
                              <Input value={editingCargoValue} onChange={(e) => setEditingCargoValue(e.target.value)} />
                            ) : (
                              <span className="font-medium">{r.job_title}</span>
                            )}
                          </td>
                          <td className="py-2 px-4">
                            <Select
                              value={r.role ?? "member"}
                              onValueChange={(v) => catalog.update.mutate({ id: r.id, job_title: r.job_title, role: v as UserRole })}
                              disabled={!isAdmin || catalog.update.isPending}
                            >
                              <SelectTrigger className="max-w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Proprietário</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="manager">Gestor</SelectItem>
                                <SelectItem value="member">Membro</SelectItem>
                                <SelectItem value="viewer">Visualizador</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-4 text-muted-foreground">{cargoCounts.get(r.job_title) ?? 0}</td>
                          <td className="py-2 px-4">
                            <div className="flex justify-end gap-2">
                              {editingCargo === r.job_title ? (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => setEditingCargo(null)} disabled={!isAdmin || catalog.rename.isPending}>
                                    Cancelar
                                  </Button>
                                  <Button size="sm" onClick={saveEditCargo} disabled={!isAdmin || catalog.rename.isPending}>
                                    Salvar
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => startEditCargo(r.job_title)} disabled={!isAdmin}>
                                    Alterar
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => deleteCargo(r.job_title)}
                                    disabled={!isAdmin || catalog.remove.isPending}
                                  >
                                    Excluir
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!catalog.isLoading && (catalog.data ?? []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-muted-foreground">
                            Nenhum cargo cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="permissoes" className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              {mappings.isLoading || catalog.isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-3 px-4 font-medium">Cargo</th>
                        <th className="text-left py-3 px-4 font-medium">Colaboradores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargoOptions.map((title) => {
                        return (
                          <tr key={title} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 px-4 font-medium">{title}</td>
                            <td className="py-2 px-4 text-muted-foreground">{cargoCounts.get(title) ?? 0}</td>
                          </tr>
                        );
                      })}
                      {cargoOptions.length === 0 && (
                        <tr>
                          <td colSpan={2} className="py-8 text-center text-muted-foreground">
                            Cadastre cargos na aba Cargos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="acessos" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Escopo</Label>
                <Select
                  value={accessScope}
                  onValueChange={(v) => {
                    setAccessScope(v as typeof accessScope);
                    setSelectedUserId(null);
                    setSelectedCargo((p) => p ?? cargoOptions[0] ?? null);
                  }}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cargo">Cargo</SelectItem>
                    <SelectItem value="user">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {accessScope === "cargo" ? (
                <div className="space-y-1">
                  <Label>Selecionar cargo</Label>
                  <Select value={selectedCargo ?? ""} onValueChange={(v) => setSelectedCargo(v || null)}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Escolha um cargo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cargoOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Selecionar colaborador</Label>
                  <Select value={selectedUserId ?? ""} onValueChange={(v) => setSelectedUserId(v || null)}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Escolha um usuário..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles
                        .filter((p) => p.role !== "owner")
                        .map((p) => {
                          const meta = (p.metadata ?? {}) as Record<string, unknown>;
                          const cargo = String((meta.job_title ?? meta.cargo ?? "") as string).trim();
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name} — {cargo || "sem cargo"} ({p.email})
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {accessScope === "cargo" && selectedCargo && (
              <p className="text-xs text-muted-foreground">
                As permissões por colaborador (override) prevalecem sobre as permissões do cargo.
              </p>
            )}

            {(accessScope === "cargo" ? !!selectedCargo : !!selectedUserId) && (
              <div className="border rounded-lg overflow-hidden">
                {accessScope === "user" && (isLoading || userScopePerms.isLoading) ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : accessScope === "cargo" && (jobTitlePerms.isLoading || jobTitleScopePerms.isLoading) ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <div className="max-h-[70vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="sticky top-0 z-30 bg-muted text-left py-3 px-4 font-medium border-b shadow-sm">Módulo</th>
                          <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">{PERM_LABELS.can_view}</th>
                          <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">{PERM_LABELS.can_create}</th>
                          <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">{PERM_LABELS.can_edit}</th>
                          <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">{PERM_LABELS.can_delete}</th>
                          <th className="sticky top-0 z-30 bg-muted text-right py-3 px-4 font-medium border-b shadow-sm">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MODULES.map((m) => {
                          const row = accessScope === "user" ? permByModule.get(m.id) : jobPermByModule.get(m.id);
                          const busy =
                            accessScope === "user"
                              ? upsert.isPending || userScopePerms.upsert.isPending || userScopePerms.remove.isPending
                              : jobTitlePerms.upsert.isPending || jobTitleScopePerms.upsert.isPending || jobTitleScopePerms.remove.isPending;
                          const disabled = !isAdmin || busy;
                          const flags = row as unknown as PermFlags | undefined;
                          const views = MODULE_VIEWS[m.id] ?? [];

                          const scopeRow = (scopeId: string) => {
                            const key = `${m.id}::${scopeId}`;
                            return (accessScope === "user" ? userScopeByKey.get(key) : jobScopeByKey.get(key)) as unknown as
                              | (PermFlags & { id: string })
                              | undefined;
                          };

                          const effective = (scopeId: string, field: keyof PermFlags) => {
                            const r = scopeRow(scopeId);
                            if (r) return r[field];
                            return flags?.[field] ?? false;
                          };

                          return (
                            <React.Fragment key={m.id}>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="py-2 px-4 font-medium">{m.label}</td>
                                {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((field) => (
                                  <td key={field} className="py-2 px-3 text-center">
                                    <Checkbox
                                      checked={flags?.[field] ?? false}
                                      onCheckedChange={(checked) => handleToggle(m.id, field, !!checked)}
                                      disabled={disabled || (field === "can_delete" && !isOwner)}
                                    />
                                  </td>
                                ))}
                                <td className="py-2 px-4 text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleMarkAllInModule(m.id)}
                                      disabled={disabled}
                                    >
                                      Marcar tudo
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleResetModule(m.id)}
                                      disabled={!flags || disabled}
                                    >
                                      Resetar
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              {views.length > 0 && (
                                <tr className="border-b last:border-0">
                                  <td colSpan={6} className="p-0">
                                    <div className="px-4 py-3 bg-muted/20">
                                      <div className="text-xs text-muted-foreground mb-2">Sub-opções</div>
                                      <div className="max-h-[260px] overflow-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b">
                                              <th className="sticky top-0 z-20 bg-muted text-left py-2 pr-3 font-medium border-b">Janela/View</th>
                                              <th className="sticky top-0 z-20 bg-muted text-center py-2 px-2 border-b">{PERM_LABELS.can_view}</th>
                                              <th className="sticky top-0 z-20 bg-muted text-center py-2 px-2 border-b">{PERM_LABELS.can_create}</th>
                                              <th className="sticky top-0 z-20 bg-muted text-center py-2 px-2 border-b">{PERM_LABELS.can_edit}</th>
                                              <th className="sticky top-0 z-20 bg-muted text-center py-2 px-2 border-b">{PERM_LABELS.can_delete}</th>
                                              <th className="sticky top-0 z-20 bg-muted text-right py-2 pl-3 font-medium border-b">Ações</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {views.map((v) => {
                                              const r = scopeRow(v.id);
                                              const hasOverride = !!r;
                                              const canDeleteFallback = effective(v.id, "can_delete");
                                              return (
                                                <tr key={v.id} className="border-b last:border-0">
                                                  <td className="py-2 pr-3 font-medium">{v.label}</td>
                                                  {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((field) => (
                                                    <td key={field} className="py-2 px-2 text-center">
                                                      <Checkbox
                                                        checked={effective(v.id, field)}
                                                        onCheckedChange={(checked) => handleToggleScope(m.id, v.id, field, !!checked)}
                                                        disabled={disabled || (field === "can_delete" && !isOwner)}
                                                      />
                                                    </td>
                                                  ))}
                                                  <td className="py-2 pl-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleMarkAllInScope(m.id, v.id, canDeleteFallback)}
                                                        disabled={disabled}
                                                      >
                                                        Marcar tudo
                                                      </Button>
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleResetScope(m.id, v.id)}
                                                        disabled={!hasOverride || disabled}
                                                      >
                                                        Resetar
                                                      </Button>
                                                    </div>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </SettingsSection>
  );
}

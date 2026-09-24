import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ChevronsUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MODULES,
  MODULE_VIEWS,
  CLIENT_ONLY_MODULES,
  useJobTitlePermissions,
  useJobTitlePermissionScopes,
  useUserPermissions,
  useUserPermissionScopes,
  type PermissionModule,
  type PermFlags,
} from "@/hooks/usePermissions";
import { useProfiles } from "@/hooks/useProfiles";
import { useJobTitleCatalog } from "@/hooks/useJobTitleCatalog";
import { ModuleRow } from "./ModuleRow";

// Re-export CLIENT_ONLY_MODULES check helper
const isClientOnlyModule = (m: PermissionModule) =>
  (CLIENT_ONLY_MODULES as Set<PermissionModule>).has(m);

function normalizeFlags(flags: PermFlags): PermFlags {
  const next = { ...flags };
  if (!next.can_view) {
    next.can_create = false;
    next.can_edit = false;
    next.can_delete = false;
  }
  return next;
}

interface AccessesTabProps {
  organizationId: string | undefined;
  isAdmin: boolean;
  isOwner: boolean;
}

export function AccessesTab({ organizationId, isAdmin, isOwner }: AccessesTabProps) {
  const { data: profiles = [] } = useProfiles(organizationId);
  const catalog = useJobTitleCatalog(organizationId);
  const cargoOptions = useMemo(() => (catalog.data ?? []).map((r) => r.job_title), [catalog.data]);

  const [accessScope, setAccessScope] = useState<"cargo" | "user">("cargo");
  const [selectedCargo, setSelectedCargo] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<PermissionModule>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (accessScope !== "cargo") return;
    if (selectedCargo) return;
    if (!cargoOptions[0]) return;
    setSelectedCargo(cargoOptions[0]);
  }, [accessScope, cargoOptions, selectedCargo]);

  // ── Data hooks ──────────────────────────────────────────────────────────────
  const jobTitlePerms = useJobTitlePermissions(organizationId, accessScope === "cargo" ? selectedCargo : null);
  const jobTitleScopePerms = useJobTitlePermissionScopes(organizationId, accessScope === "cargo" ? selectedCargo : null);
  const { data: userPerms = [], isLoading: loadingUserPerms, upsert: upsertUserPerm, remove: removeUserPerm } =
    useUserPermissions(organizationId, accessScope === "user" ? selectedUserId : null);
  const userScopePerms = useUserPermissionScopes(organizationId, accessScope === "user" ? selectedUserId : null);

  const isLoading =
    accessScope === "cargo"
      ? jobTitlePerms.isLoading || jobTitleScopePerms.isLoading
      : loadingUserPerms || userScopePerms.isLoading;

  const isBusy =
    accessScope === "cargo"
      ? jobTitlePerms.upsert.isPending || jobTitlePerms.remove.isPending ||
        jobTitleScopePerms.upsert.isPending || jobTitleScopePerms.remove.isPending
      : upsertUserPerm.isPending || removeUserPerm.isPending ||
        userScopePerms.upsert.isPending || userScopePerms.remove.isPending;

  // ── Derived maps ────────────────────────────────────────────────────────────
  const jobPermByModule = useMemo(() => {
    const map = new Map<PermissionModule, PermFlags>();
    for (const p of jobTitlePerms.data ?? []) {
      map.set(p.module, { can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit, can_delete: p.can_delete });
    }
    return map;
  }, [jobTitlePerms.data]);

  const jobScopeByKey = useMemo(() => {
    const map = new Map<string, PermFlags>();
    for (const r of jobTitleScopePerms.data ?? []) {
      map.set(`${r.module}::${r.scope}`, { can_view: r.can_view, can_create: r.can_create, can_edit: r.can_edit, can_delete: r.can_delete });
    }
    return map;
  }, [jobTitleScopePerms.data]);

  const userPermByModule = useMemo(() => {
    const map = new Map<PermissionModule, PermFlags>();
    for (const p of userPerms) {
      map.set(p.module, { can_view: p.can_view, can_create: p.can_create, can_edit: p.can_edit, can_delete: p.can_delete });
    }
    return map;
  }, [userPerms]);

  const userScopeByKey = useMemo(() => {
    const map = new Map<string, PermFlags>();
    for (const r of userScopePerms.data ?? []) {
      map.set(`${r.module}::${r.scope}`, { can_view: r.can_view, can_create: r.can_create, can_edit: r.can_edit, can_delete: r.can_delete });
    }
    return map;
  }, [userScopePerms.data]);

  // ── Search / filter ─────────────────────────────────────────────────────────
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MODULES;
    return MODULES.filter((m) => {
      const moduleMatch = m.label.toLowerCase().includes(q);
      const scopeMatch = MODULE_VIEWS[m.id]?.some((s) => s.label.toLowerCase().includes(q)) ?? false;
      return moduleMatch || scopeMatch;
    });
  }, [searchQuery]);

  const searchExpandedModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<PermissionModule>();
    return new Set<PermissionModule>(
      MODULES.filter((m) =>
        MODULE_VIEWS[m.id]?.some((s) => s.label.toLowerCase().includes(q))
      ).map((m) => m.id)
    );
  }, [searchQuery]);

  const isExpanded = (moduleId: PermissionModule) =>
    expandedModules.has(moduleId) || searchExpandedModules.has(moduleId);

  const toggleModule = (moduleId: PermissionModule) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const expandAll = () => setExpandedModules(new Set(MODULES.map((m) => m.id)));
  const collapseAll = () => setExpandedModules(new Set());

  // ── Override detection ───────────────────────────────────────────────────────
  const hasModuleOverride = (moduleId: PermissionModule) => userPermByModule.has(moduleId);
  const hasScopeOverride = (moduleId: PermissionModule, scopeId: string) =>
    userScopeByKey.has(`${moduleId}::${scopeId}`);

  // ── Effective flags ──────────────────────────────────────────────────────────
  const getModuleFlags = (moduleId: PermissionModule): PermFlags | undefined => {
    if (accessScope === "user") return userPermByModule.get(moduleId) ?? jobPermByModule.get(moduleId);
    return jobPermByModule.get(moduleId);
  };

  const getScopeFlags = (moduleId: PermissionModule, scopeId: string): PermFlags | undefined => {
    const key = `${moduleId}::${scopeId}`;
    if (accessScope === "user") return userScopeByKey.get(key) ?? jobScopeByKey.get(key);
    return jobScopeByKey.get(key);
  };

  const getInheritedFlags = (moduleId: PermissionModule, scopeId: string): PermFlags => {
    const key = `${moduleId}::${scopeId}`;
    return (
      jobScopeByKey.get(key) ??
      jobPermByModule.get(moduleId) ?? {
        can_view: false, can_create: false, can_edit: false, can_delete: false,
      }
    );
  };

  // ── Clear user overrides when cargo perm changes ─────────────────────────────
  const clearUserOverridesForCargo = async (module: PermissionModule, scopeId?: string) => {
    if (!organizationId || !selectedCargo) return;
    const supabaseUntyped = supabase as unknown as SupabaseClient;
    const ids = new Set<string>();
    const { data: byJobTitle } = await supabaseUntyped
      .from("profiles").select("id")
      .eq("organization_id", organizationId).eq("metadata->>job_title", selectedCargo).limit(10000);
    for (const r of (byJobTitle ?? []) as Array<{ id: string }>) ids.add(r.id);
    const { data: byCargo } = await supabaseUntyped
      .from("profiles").select("id")
      .eq("organization_id", organizationId).eq("metadata->>cargo", selectedCargo).limit(10000);
    for (const r of (byCargo ?? []) as Array<{ id: string }>) ids.add(r.id);
    const userIds = Array.from(ids);
    if (userIds.length === 0) return;
    const chunkSize = 250;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      if (scopeId) {
        await supabaseUntyped.from("user_permission_scopes").delete()
          .eq("organization_id", organizationId).eq("module", module).eq("scope", scopeId).in("user_id", chunk);
      } else {
        await supabaseUntyped.from("user_permissions").delete()
          .eq("organization_id", organizationId).eq("module", module).in("user_id", chunk);
        await supabaseUntyped.from("user_permission_scopes").delete()
          .eq("organization_id", organizationId).eq("module", module).in("user_id", chunk);
      }
    }
  };

  // ── Module flag handlers ─────────────────────────────────────────────────────
  const handleToggleModuleFlag = async (moduleId: PermissionModule, field: keyof PermFlags, value: boolean) => {
    try {
      if (isClientOnlyModule(moduleId)) {
        toast.info("Este módulo é controlado apenas no frontend.");
        return;
      }
      if (accessScope === "user") {
        if (!selectedUserId) return;
        const current = userPermByModule.get(moduleId);
        const next = normalizeFlags({ ...(current ?? { can_view: false, can_create: false, can_edit: false, can_delete: false }), [field]: value });
        await upsertUserPerm.mutateAsync({ module: moduleId, ...next });
      } else {
        if (!selectedCargo) return;
        const current = jobPermByModule.get(moduleId);
        const next = normalizeFlags({ ...(current ?? { can_view: false, can_create: false, can_edit: false, can_delete: false }), [field]: value });
        await jobTitlePerms.upsert.mutateAsync({ module: moduleId, ...next });
        await clearUserOverridesForCargo(moduleId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissão");
    }
  };

  const handleMarkAllModule = async (moduleId: PermissionModule) => {
    try {
      if (isClientOnlyModule(moduleId)) return;
      const next = normalizeFlags({ can_view: true, can_create: true, can_edit: true, can_delete: true });
      if (accessScope === "user") {
        if (!selectedUserId) return;
        await upsertUserPerm.mutateAsync({ module: moduleId, ...next });
      } else {
        if (!selectedCargo) return;
        await jobTitlePerms.upsert.mutateAsync({ module: moduleId, ...next });
        await clearUserOverridesForCargo(moduleId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissão");
    }
  };

  const handleResetModule = async (moduleId: PermissionModule) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        await removeUserPerm.mutateAsync({ module: moduleId });
      } else {
        if (!selectedCargo) return;
        await jobTitlePerms.remove.mutateAsync({ module: moduleId });
        await clearUserOverridesForCargo(moduleId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao resetar permissão");
    }
  };

  // ── Scope flag handlers ──────────────────────────────────────────────────────
  const handleToggleScopeFlag = async (moduleId: PermissionModule, scopeId: string, field: keyof PermFlags, value: boolean) => {
    try {
      if (isClientOnlyModule(moduleId)) {
        toast.info("Este módulo é controlado apenas no frontend.");
        return;
      }
      const key = `${moduleId}::${scopeId}`;
      if (accessScope === "user") {
        if (!selectedUserId) return;
        const current = userScopeByKey.get(key);
        const next = normalizeFlags({ ...(current ?? { can_view: false, can_create: false, can_edit: false, can_delete: false }), [field]: value });
        await userScopePerms.upsert.mutateAsync({ module: moduleId, scope: scopeId, ...next });
      } else {
        if (!selectedCargo) return;
        const current = jobScopeByKey.get(key);
        const next = normalizeFlags({ ...(current ?? { can_view: false, can_create: false, can_edit: false, can_delete: false }), [field]: value });
        await jobTitleScopePerms.upsert.mutateAsync({ module: moduleId, scope: scopeId, ...next });
        await clearUserOverridesForCargo(moduleId, scopeId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissão");
    }
  };

  const handleMarkAllScope = async (moduleId: PermissionModule, scopeId: string) => {
    try {
      if (isClientOnlyModule(moduleId)) return;
      const next = normalizeFlags({ can_view: true, can_create: true, can_edit: true, can_delete: true });
      if (accessScope === "user") {
        if (!selectedUserId) return;
        await userScopePerms.upsert.mutateAsync({ module: moduleId, scope: scopeId, ...next });
      } else {
        if (!selectedCargo) return;
        await jobTitleScopePerms.upsert.mutateAsync({ module: moduleId, scope: scopeId, ...next });
        await clearUserOverridesForCargo(moduleId, scopeId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar permissão");
    }
  };

  const handleResetScope = async (moduleId: PermissionModule, scopeId: string) => {
    try {
      if (accessScope === "user") {
        if (!selectedUserId) return;
        await userScopePerms.remove.mutateAsync({ module: moduleId, scope: scopeId });
      } else {
        if (!selectedCargo) return;
        await jobTitleScopePerms.remove.mutateAsync({ module: moduleId, scope: scopeId });
        await clearUserOverridesForCargo(moduleId, scopeId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao resetar permissão");
    }
  };

  const hasSelection = accessScope === "cargo" ? !!selectedCargo : !!selectedUserId;

  return (
    <div className="space-y-4">
      {/* Seleção de escopo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Escopo</Label>
          <Select
            value={accessScope}
            onValueChange={(v) => {
              setAccessScope(v as typeof accessScope);
              setSelectedUserId(null);
              setSelectedCargo(cargoOptions[0] ?? null);
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
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>Selecionar colaborador</Label>
            <Select value={selectedUserId ?? ""} onValueChange={(v) => setSelectedUserId(v || null)}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Escolha um colaborador..." />
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

      {hasSelection && (
        <>
          {/* Busca + controles de expand */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar módulo ou sub-escopo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll} className="gap-1">
                <ChevronsUpDown className="h-3.5 w-3.5" />
                Expandir todos
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} className="gap-1">
                <ChevronsUpDown className="h-3.5 w-3.5 rotate-90" />
                Colapsar todos
              </Button>
            </div>
          </div>

          {/* Tabela */}
          <div className="border rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredModules.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum módulo ou sub-escopo encontrado para "{searchQuery}".
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="sticky top-0 z-30 bg-muted text-left py-3 px-4 font-medium border-b shadow-sm">Módulo</th>
                      <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">Ver</th>
                      <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">Criar</th>
                      <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">Editar</th>
                      <th className="sticky top-0 z-30 bg-muted text-center py-3 px-3 border-b shadow-sm">Excluir</th>
                      <th className="sticky top-0 z-30 bg-muted text-right py-3 px-4 font-medium border-b shadow-sm">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModules.map((m) => {
                      const scopes = MODULE_VIEWS[m.id] ?? [];
                      const clientOnly = isClientOnlyModule(m.id);
                      return (
                        <ModuleRow
                          key={m.id}
                          module={m}
                          flags={getModuleFlags(m.id)}
                          isExpanded={isExpanded(m.id)}
                          onToggleExpand={() => toggleModule(m.id)}
                          onToggleFlag={(field, value) => handleToggleModuleFlag(m.id, field, value)}
                          onMarkAll={() => handleMarkAllModule(m.id)}
                          onReset={() => handleResetModule(m.id)}
                          disabled={!isAdmin || isBusy}
                          scopes={scopes}
                          getScopeFlags={(scopeId) => getScopeFlags(m.id, scopeId)}
                          hasScopeOverride={(scopeId) => hasScopeOverride(m.id, scopeId)}
                          getInheritedFlags={(scopeId) => getInheritedFlags(m.id, scopeId)}
                          onToggleScopeFlag={(scopeId, field, value) => handleToggleScopeFlag(m.id, scopeId, field, value)}
                          onMarkAllScope={(scopeId) => handleMarkAllScope(m.id, scopeId)}
                          onResetScope={(scopeId) => handleResetScope(m.id, scopeId)}
                          isClientOnly={clientOnly}
                          accessScope={accessScope}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

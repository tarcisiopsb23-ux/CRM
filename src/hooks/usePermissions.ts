import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PermissionModule = Database["public"]["Enums"]["permission_module"] | "performance" | "integrations";
export type UserRole = Database["public"]["Enums"]["user_role"];

export interface UserPermissionRow {
  id: string;
  user_id: string;
  organization_id: string;
  module: PermissionModule;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export const MODULES: { id: PermissionModule; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "kanban", label: "Kanban" },
  { id: "crm", label: "CRM" },
  { id: "sales_analytics", label: "Analytics Vendas" },
  { id: "clients", label: "Clientes" },
  { id: "financial", label: "Financeiro" },
  { id: "projects", label: "Projetos" },
  { id: "agenda", label: "Agenda" },
  { id: "goals", label: "Metas" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "meetings", label: "Reuniões IA" },
  { id: "team", label: "Equipe" },
  { id: "settings", label: "Configurações" },
  { id: "reports", label: "Relatórios" },
  { id: "campaigns", label: "Campanhas" },
  { id: "audit", label: "Auditoria" },
  { id: "timeclock", label: "Ponto Eletrônico" },
  { id: "performance", label: "Dashboard de Performance" },
  { id: "integrations", label: "Integrações" },
];

export interface JobTitleRoleMappingRow {
  id: string;
  organization_id: string;
  job_title: string;
  mapped_role: UserRole | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface JobTitlePermissionRow {
  id: string;
  organization_id: string;
  job_title: string;
  module: PermissionModule;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface UserPermissionScopeRow {
  id: string;
  user_id: string;
  organization_id: string;
  module: PermissionModule;
  scope: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface JobTitlePermissionScopeRow {
  id: string;
  organization_id: string;
  job_title: string;
  module: PermissionModule;
  scope: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string | null;
  updated_at: string | null;
}

const ROUTE_TO_MODULE: Record<string, PermissionModule> = {
  "/": "dashboard",
  "/kanban": "kanban",
  "/leads": "crm",
  "/clients": "clients",
  "/suppliers": "clients",
  "/financial": "financial",
  "/projects": "projects",
  "/agenda": "agenda",
  "/goals": "goals",
  "/whatsapp": "whatsapp",
  "/meetings": "meetings",
  "/team": "team",
  "/settings": "settings",
  "/reports": "reports",
  "/general-reports": "reports",
  "/campaign-reports": "campaigns",
  "/sales-analytics": "sales_analytics",
  "/audit": "audit",
  "/timeclock": "timeclock",
  "/performance": "performance",
  "/integrations": "integrations",
};

export type PermissionResult = { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };

export function baselineFor(role: UserRole, module: PermissionModule | null, scope?: string | null): PermissionResult {
  if (!module) return { canView: true, canCreate: true, canEdit: true, canDelete: true };

  // Owner nunca tem restrição
  if (role === "owner") return { canView: true, canCreate: true, canEdit: true, canDelete: true };
  
  if (role === "admin") return { canView: true, canCreate: true, canEdit: true, canDelete: true };

  // Settings: apenas admin/owner (bloqueio total aqui)
  if (module === "settings") return { canView: false, canCreate: false, canEdit: false, canDelete: false };

  // Auditoria: manager pode ver, outros não
  if (module === "audit") {
    if (role === "manager") return { canView: true, canCreate: false, canEdit: false, canDelete: false };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Financeiro: restritivo para member/viewer
  if (module === "financial") {
    if (role === "manager") {
      if (scope === "reports") return { canView: false, canCreate: false, canEdit: false, canDelete: false };
      return { canView: true, canCreate: true, canEdit: true, canDelete: false };
    }
    if (role === "member") {
      if (scope === "contracts") return { canView: true, canCreate: true, canEdit: false, canDelete: false };
      return { canView: false, canCreate: false, canEdit: false, canDelete: false };
    }
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Analytics de Vendas, Dashboard Global, Performance Hub e Integrações: restritivo
  if (module === "sales_analytics" || module === "dashboard" || module === "performance" || module === "integrations") {
    if (role === "manager") return { canView: true, canCreate: true, canEdit: true, canDelete: false };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  if (role === "viewer") {
    if (module === "team") {
      if (!scope) return { canView: true, canCreate: false, canEdit: false, canDelete: false };
      if (scope === "payroll") return { canView: true, canCreate: false, canEdit: false, canDelete: false };
      return { canView: false, canCreate: false, canEdit: false, canDelete: false };
    }
    if (module === "timeclock") return { canView: true, canCreate: true, canEdit: false, canDelete: false };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  if (role === "manager") return { canView: true, canCreate: true, canEdit: true, canDelete: false };
  
  // Default para member (CRM, Projetos etc. são abertos por padrão)
  return { canView: true, canCreate: true, canEdit: true, canDelete: false };
}

export function applyHardOverrides(role: UserRole, module: PermissionModule | null, scope: string | null, perms: PermissionResult): PermissionResult {
  if (!module) return perms;

  if (module === "settings" && role !== "owner" && role !== "admin") {
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  if (module === "financial" && scope === "reports" && role !== "owner" && role !== "admin") {
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  if (module === "audit" && role !== "owner" && role !== "admin" && role !== "manager") {
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  if ((module === "performance" || module === "integrations") && role !== "owner" && role !== "admin" && role !== "manager") {
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  return perms;
}

/** Hook para checar permissão de módulo. Owner tem acesso total irrestrito. */
export function useModulePermission(module: PermissionModule | null) {
  const { profile } = useAuth();

  const isOwner = profile?.role === "owner";
  const isAdminOrOwner = isOwner || profile?.role === "admin";

  const jobTitle = (() => {
    const meta = (profile?.metadata ?? {}) as Record<string, unknown>;
    const raw = (meta.job_title ?? meta.cargo ?? "") as string;
    return String(raw ?? "").trim();
  })();

  const { data: userPermissions = [] } = useQuery({
    queryKey: ["user_permissions", profile?.id, profile?.organization_id],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id) return [];
      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", profile.id)
        .eq("organization_id", profile.organization_id!);
      if (error) return [];
      return (data ?? []) as UserPermissionRow[];
    },
    enabled: !!profile?.id && !!profile?.organization_id && !isAdminOrOwner && module !== null,
  });

  const { data: jobTitlePermissions = [] } = useQuery({
    queryKey: ["job_title_permissions", profile?.organization_id, jobTitle],
    queryFn: async () => {
      if (!profile?.organization_id || !jobTitle) return [];
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { data, error } = await supabaseUntyped
        .from("job_title_permissions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("job_title", jobTitle);
      if (error) return [];
      return (data ?? []) as unknown as JobTitlePermissionRow[];
    },
    enabled: !!profile?.organization_id && !!jobTitle && !isAdminOrOwner && module !== null,
  });

  const userPerm = module ? userPermissions.find((p) => p.module === module) : null;
  const jobPerm = module ? jobTitlePermissions.find((p) => p.module === module) : null;
  const base = profile?.role ? baselineFor(profile.role as UserRole, module) : { canView: false, canCreate: false, canEdit: false, canDelete: false };

  const supabaseUntyped = supabase as unknown as SupabaseClient;

  const { data: userScopeCanView = false } = useQuery({
    queryKey: ["user_permission_scopes", profile?.id, profile?.organization_id, module, "any_view"],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id || !module) return false;
      const { data, error } = await supabaseUntyped
        .from("user_permission_scopes")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", profile.id)
        .eq("module", module)
        .eq("can_view", true)
        .limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },
    enabled: !!profile?.id && !!profile?.organization_id && !!module && !isAdminOrOwner,
  });

  const { data: jobScopeCanView = false } = useQuery({
    queryKey: ["job_title_permission_scopes", profile?.organization_id, jobTitle, module, "any_view"],
    queryFn: async () => {
      if (!profile?.organization_id || !jobTitle || !module) return false;
      const { data, error } = await supabaseUntyped
        .from("job_title_permission_scopes")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("job_title", jobTitle)
        .eq("module", module)
        .eq("can_view", true)
        .limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },
    enabled: !!profile?.organization_id && !!jobTitle && !!module && !isAdminOrOwner,
  });

  // Módulo null => acesso total. Owner => acesso total SEMPRE (ignora hard overrides).
  if (!module || isOwner) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isAdminOrOwner: true,
    };
  }

  // Admin ainda passa pelos overrides (ex: bloqueio de settings se for explicitamente definido, embora baseline dê true)
  if (isAdminOrOwner) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isAdminOrOwner: true,
    };
  }

  const role = (profile?.role as UserRole | undefined) ?? "viewer";

  const effective = applyHardOverrides(role, module, null, {
    canView: (userPerm?.can_view ?? jobPerm?.can_view ?? base.canView) || userScopeCanView || jobScopeCanView,
    canCreate: userPerm?.can_create ?? jobPerm?.can_create ?? base.canCreate,
    canEdit: userPerm?.can_edit ?? jobPerm?.can_edit ?? base.canEdit,
    canDelete: userPerm?.can_delete ?? jobPerm?.can_delete ?? base.canDelete,
  });

  return {
    ...effective,
    isAdminOrOwner: false,
  };
}

/** Retorna módulo para uma rota (ex: /kanban -> kanban) */
export function getModuleForRoute(pathname: string): PermissionModule | null {
  if (pathname === "/") return "dashboard";
  const exact = ROUTE_TO_MODULE[pathname];
  if (exact) return exact;
  for (const [route, mod] of Object.entries(ROUTE_TO_MODULE)) {
    if (route === "/") continue;
    if (pathname.startsWith(route)) return mod;
  }
  return null;
}

/** Hook para checar permissão por rota (pathname). Rotas sem módulo = permitido. */
export function usePermissionForRoute(pathname: string) {
  const module = getModuleForRoute(pathname);
  return useModulePermission(module);
}

export function useUserPermissions(organizationId: string | undefined, userId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["user_permissions", organizationId, userId],
    queryFn: async () => {
      if (!organizationId || !userId) return [];
      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("module");
      if (error) throw error;
      return (data ?? []) as UserPermissionRow[];
    },
    enabled: !!organizationId && !!userId,
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      module: PermissionModule;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }) => {
      if (!organizationId || !userId) throw new Error("Sem organização ou usuário");
      const { error } = await supabase.from("user_permissions").upsert(
        {
          user_id: userId,
          organization_id: organizationId,
          module: input.module,
          can_view: input.can_view,
          can_create: input.can_create,
          can_edit: input.can_edit,
          can_delete: input.can_delete,
        },
        { onConflict: "user_id,organization_id,module" }
      );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["user_permissions", organizationId, userId] }),
  });

  const remove = useMutation({
    mutationFn: async (input: { module: PermissionModule }) => {
      if (!organizationId || !userId) throw new Error("Sem organização ou usuário");
      const { error } = await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .eq("module", input.module);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["user_permissions", organizationId, userId] }),
  });

  return { ...query, upsert, remove };
}

export function useUserPermissionScopes(organizationId: string | undefined, userId: string | null) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  const query = useQuery({
    queryKey: ["user_permission_scopes", organizationId, userId],
    queryFn: async () => {
      if (!organizationId || !userId) return [];
      const { data, error } = await supabaseUntyped
        .from("user_permission_scopes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as unknown as UserPermissionScopeRow[];
    },
    enabled: !!organizationId && !!userId,
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      module: PermissionModule;
      scope: string;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }) => {
      if (!organizationId || !userId) throw new Error("Sem organização ou usuário");
      const { error } = await supabaseUntyped
        .from("user_permission_scopes")
        .upsert(
          {
            user_id: userId,
            organization_id: organizationId,
            module: input.module,
            scope: input.scope,
            can_view: input.can_view,
            can_create: input.can_create,
            can_edit: input.can_edit,
            can_delete: input.can_delete,
          },
          { onConflict: "user_id,organization_id,module,scope" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_permission_scopes", organizationId, userId] }),
  });

  const remove = useMutation({
    mutationFn: async (input: { module: PermissionModule; scope: string }) => {
      if (!organizationId || !userId) throw new Error("Sem organização ou usuário");
      const { error } = await supabaseUntyped
        .from("user_permission_scopes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("module", input.module)
        .eq("scope", input.scope);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_permission_scopes", organizationId, userId] }),
  });

  return { ...query, upsert, remove };
}

export function useJobTitleRoleMappings(organizationId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["job_title_role_mappings", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { data, error } = await supabaseUntyped
        .from("job_title_role_mappings")
        .select("*")
        .eq("organization_id", organizationId)
        .order("job_title");
      if (error) throw error;
      return (data ?? []) as unknown as JobTitleRoleMappingRow[];
    },
    enabled: !!organizationId,
  });

  const upsert = useMutation({
    mutationFn: async (input: { job_title: string; mapped_role: UserRole | null }) => {
      if (!organizationId) throw new Error("Sem organização");
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { error } = await supabaseUntyped
        .from("job_title_role_mappings")
        .upsert(
          { organization_id: organizationId, job_title: input.job_title, mapped_role: input.mapped_role },
          { onConflict: "organization_id,job_title" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_title_role_mappings", organizationId] }),
  });

  return { ...query, upsert };
}

export function useJobTitlePermissions(organizationId: string | undefined, jobTitle: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["job_title_permissions", organizationId, jobTitle],
    queryFn: async () => {
      if (!organizationId || !jobTitle) return [];
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { data, error } = await supabaseUntyped
        .from("job_title_permissions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("job_title", jobTitle)
        .order("module");
      if (error) throw error;
      return (data ?? []) as unknown as JobTitlePermissionRow[];
    },
    enabled: !!organizationId && !!jobTitle,
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      module: PermissionModule;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }) => {
      if (!organizationId || !jobTitle) throw new Error("Sem organização ou cargo");
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { error } = await supabaseUntyped
        .from("job_title_permissions")
        .upsert(
          {
            organization_id: organizationId,
            job_title: jobTitle,
            module: input.module,
            can_view: input.can_view,
            can_create: input.can_create,
            can_edit: input.can_edit,
            can_delete: input.can_delete,
          },
          { onConflict: "organization_id,job_title,module" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_title_permissions", organizationId, jobTitle] });
      qc.invalidateQueries({ queryKey: ["user_permissions"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (input: { module: PermissionModule }) => {
      if (!organizationId || !jobTitle) throw new Error("Sem organização ou cargo");
      const supabaseUntyped = supabase as unknown as SupabaseClient;
      const { error } = await supabaseUntyped
        .from("job_title_permissions")
        .delete()
        .eq("organization_id", organizationId)
        .eq("job_title", jobTitle)
        .eq("module", input.module);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_title_permissions", organizationId, jobTitle] });
      qc.invalidateQueries({ queryKey: ["user_permissions"] });
    },
  });

  return { ...query, upsert, remove };
}

export function useJobTitlePermissionScopes(organizationId: string | undefined, jobTitle: string | null) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  const query = useQuery({
    queryKey: ["job_title_permission_scopes", organizationId, jobTitle],
    queryFn: async () => {
      if (!organizationId || !jobTitle) return [];
      const { data, error } = await supabaseUntyped
        .from("job_title_permission_scopes")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("job_title", jobTitle);
      if (error) throw error;
      return (data ?? []) as unknown as JobTitlePermissionScopeRow[];
    },
    enabled: !!organizationId && !!jobTitle,
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      module: PermissionModule;
      scope: string;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }) => {
      if (!organizationId || !jobTitle) throw new Error("Sem organização ou cargo");
      const { error } = await supabaseUntyped
        .from("job_title_permission_scopes")
        .upsert(
          {
            organization_id: organizationId,
            job_title: jobTitle,
            module: input.module,
            scope: input.scope,
            can_view: input.can_view,
            can_create: input.can_create,
            can_edit: input.can_edit,
            can_delete: input.can_delete,
          },
          { onConflict: "organization_id,job_title,module,scope" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_title_permission_scopes", organizationId, jobTitle] }),
  });

  const remove = useMutation({
    mutationFn: async (input: { module: PermissionModule; scope: string }) => {
      if (!organizationId || !jobTitle) throw new Error("Sem organização ou cargo");
      const { error } = await supabaseUntyped
        .from("job_title_permission_scopes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("job_title", jobTitle)
        .eq("module", input.module)
        .eq("scope", input.scope);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_title_permission_scopes", organizationId, jobTitle] }),
  });

  return { ...query, upsert, remove };
}

export function usePermissionForScope(module: PermissionModule | null, scope: string | null) {
  const { profile } = useAuth();

  const isAdminOrOwner = profile?.role === "owner" || profile?.role === "admin";
  const jobTitle = (() => {
    const meta = (profile?.metadata ?? {}) as Record<string, unknown>;
    const raw = (meta.job_title ?? meta.cargo ?? "") as string;
    return String(raw ?? "").trim();
  })();

  const supabaseUntyped = supabase as unknown as SupabaseClient;

  const { data: userPermissions = [] } = useQuery({
    queryKey: ["user_permissions", profile?.id, profile?.organization_id, module],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id || !module) return [];
      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", profile.id)
        .eq("organization_id", profile.organization_id)
        .eq("module", module);
      if (error) return [];
      return (data ?? []) as UserPermissionRow[];
    },
    enabled: !!profile?.id && !!profile?.organization_id && !!module && !isAdminOrOwner,
  });

  const { data: jobPermissions = [] } = useQuery({
    queryKey: ["job_title_permissions", profile?.organization_id, jobTitle, module],
    queryFn: async () => {
      if (!profile?.organization_id || !jobTitle || !module) return [];
      const { data, error } = await supabaseUntyped
        .from("job_title_permissions")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("job_title", jobTitle)
        .eq("module", module);
      if (error) return [];
      return (data ?? []) as unknown as JobTitlePermissionRow[];
    },
    enabled: !!profile?.organization_id && !!jobTitle && !!module && !isAdminOrOwner,
  });

  const { data: userScopePerms = [] } = useQuery({
    queryKey: ["user_permission_scopes", profile?.id, profile?.organization_id, module, scope],
    queryFn: async () => {
      if (!profile?.id || !profile?.organization_id || !module || !scope) return [];
      const { data, error } = await supabaseUntyped
        .from("user_permission_scopes")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", profile.id)
        .eq("module", module)
        .eq("scope", scope)
        .limit(1);
      if (error) return [];
      return (data ?? []) as unknown as UserPermissionScopeRow[];
    },
    enabled: !!profile?.id && !!profile?.organization_id && !!module && !!scope && !isAdminOrOwner,
  });

  const { data: jobScopePerms = [] } = useQuery({
    queryKey: ["job_title_permission_scopes", profile?.organization_id, jobTitle, module, scope],
    queryFn: async () => {
      if (!profile?.organization_id || !jobTitle || !module || !scope) return [];
      const { data, error } = await supabaseUntyped
        .from("job_title_permission_scopes")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("job_title", jobTitle)
        .eq("module", module)
        .eq("scope", scope)
        .limit(1);
      if (error) return [];
      return (data ?? []) as unknown as JobTitlePermissionScopeRow[];
    },
    enabled: !!profile?.organization_id && !!jobTitle && !!module && !!scope && !isAdminOrOwner,
  });

  if (!module || isAdminOrOwner) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isAdminOrOwner: true,
    };
  }

  const role = (profile?.role as UserRole | undefined) ?? "viewer";

  const baseUser = userPermissions[0] ?? null;
  const baseJob = jobPermissions[0] ?? null;
  const baseline = profile?.role ? baselineFor(profile.role as UserRole, module, scope) : { canView: false, canCreate: false, canEdit: false, canDelete: false };
  const base = {
    canView: baseUser?.can_view ?? baseJob?.can_view ?? baseline.canView,
    canCreate: baseUser?.can_create ?? baseJob?.can_create ?? baseline.canCreate,
    canEdit: baseUser?.can_edit ?? baseJob?.can_edit ?? baseline.canEdit,
    canDelete: baseUser?.can_delete ?? baseJob?.can_delete ?? baseline.canDelete,
  };

  if (!scope) {
    return { ...applyHardOverrides(role, module, null, base), isAdminOrOwner: false };
  }

  const userScope = userScopePerms[0] ?? null;
  const jobScope = jobScopePerms[0] ?? null;
  const scoped = {
    canView: userScope?.can_view ?? jobScope?.can_view ?? base.canView,
    canCreate: userScope?.can_create ?? jobScope?.can_create ?? base.canCreate,
    canEdit: userScope?.can_edit ?? jobScope?.can_edit ?? base.canEdit,
    canDelete: userScope?.can_delete ?? jobScope?.can_delete ?? base.canDelete,
  };

  return { ...applyHardOverrides(role, module, scope, scoped), isAdminOrOwner: false };
}

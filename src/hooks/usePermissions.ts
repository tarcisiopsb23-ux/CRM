import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PermissionModule = Database["public"]["Enums"]["permission_module"] | "performance" | "integrations" | "comercial";
export type UserRole = Database["public"]["Enums"]["user_role"];

// Módulos que existem apenas no frontend — não fazem parte do enum permission_module
// no banco. Queries com esses valores causam erro 22P02 (invalid enum input).
export const CLIENT_ONLY_MODULES = new Set<PermissionModule>(["performance", "integrations", "comercial" as PermissionModule]);

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
  { id: "c8control" as PermissionModule, label: "C8 Control" },
  { id: "fiscal" as PermissionModule, label: "Fiscal / NFS-e" },
  { id: "recruitment" as PermissionModule, label: "Recrutamento e Seleção" },
  { id: "comercial", label: "Comercial (Propostas e Contratos)" },
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
  "/c8control": "c8control" as PermissionModule,
  "/fiscal": "fiscal" as PermissionModule,
  "/recruitment": "recruitment" as PermissionModule,
  "/comercial/propostas": "comercial",
  "/comercial/dashboard": "comercial",
  "/comercial/configuracoes/contratos": "comercial",
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

  // C8 Control: acesso total para manager, fechado para member/viewer por padrão
  if (module === "c8control") {
    if (role === "manager") return { canView: true, canCreate: true, canEdit: true, canDelete: true };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Fiscal / NFS-e: manager pode emitir e editar, mas não excluir; demais roles sem acesso por padrão
  if (module === ("fiscal" as PermissionModule)) {
    if (role === "manager") return { canView: true, canCreate: true, canEdit: true, canDelete: false };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Recrutamento: manager pode ver/criar/editar, mas não excluir; demais roles sem acesso por padrão
  if (module === ("recruitment" as PermissionModule)) {
    if (role === "manager") return { canView: true, canCreate: true, canEdit: true, canDelete: false };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Comercial (Propostas e Contratos): manager pode ver/criar/editar, mas não excluir; demais roles sem acesso por padrão
  if (module === "comercial") {
    if (role === "manager") return { canView: true, canCreate: true, canEdit: true, canDelete: false };
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // Módulos operacionais liberados por padrão para todos os roles não-admin
  // (timeclock e agenda são necessários para qualquer colaborador)
  // NOTA: module=timeclock = acesso à página de ponto (sempre true)
  //       scope team/timeclock = ISENÇÃO do ponto (false por padrão, só owner/admin via applyHardOverrides)
  if (module === "timeclock") {
    if (scope === "timeclock") return { canView: false, canCreate: false, canEdit: false, canDelete: false };
    return { canView: true, canCreate: true, canEdit: false, canDelete: false };
  }
  if (module === "agenda") {
    if (role === "viewer") return { canView: true, canCreate: false, canEdit: false, canDelete: false };
    return { canView: true, canCreate: true, canEdit: true, canDelete: false };
  }

  // team/timeclock scope = isenção do ponto — false por padrão para todos não-admin
  if (module === "team" && scope === "timeclock") {
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // viewer: fechado por padrão exceto team (pode ver equipe e folha)
  if (role === "viewer") {
    if (module === "team") {
      if (!scope) return { canView: true, canCreate: false, canEdit: false, canDelete: false };
      if (scope === "payroll") return { canView: true, canCreate: false, canEdit: false, canDelete: false };
      return { canView: false, canCreate: false, canEdit: false, canDelete: false };
    }
    return { canView: false, canCreate: false, canEdit: false, canDelete: false };
  }

  // manager: fechado por padrão — acesso deve ser concedido explicitamente.
  // Módulos operacionais (timeclock, agenda) já foram liberados acima.
  if (role === "manager") return { canView: false, canCreate: false, canEdit: false, canDelete: false };

  // member: fechado por padrão — acesso deve ser concedido explicitamente via
  // user_permissions ou job_title_permissions.
  return { canView: false, canCreate: false, canEdit: false, canDelete: false };
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

/**
 * Pure helper that determines if a data-fetch query should be enabled.
 * Returns true only when canView is true AND isLoading is false.
 * Useful for property-based testing of data-fetch gates.
 */
export function resolveQueryEnabled(canView: boolean, isLoading: boolean): boolean {
  return canView === true && isLoading === false;
}

/**
 * Pure helper that represents the UI gate pattern.
 * A UI element controlled by canView should be visible if and only if canView === true.
 * This is the identity function for the UI gate pattern.
 */
export function resolveUIGate(canView: boolean): boolean {
  return canView;
}

/**
 * Pure helper that mirrors the hook resolution logic without React hooks.
 * Applies user_permissions overrides first, then job_title_permissions, then falls back to baselineFor.
 * Useful for property-based testing.
 */
export function resolvePermission(
  role: UserRole,
  module: PermissionModule | null,
  userPerms: Pick<UserPermissionRow, "module" | "can_view" | "can_create" | "can_edit" | "can_delete">[],
  jobPerms: Pick<JobTitlePermissionRow, "module" | "can_view" | "can_create" | "can_edit" | "can_delete">[]
): PermissionResult {
  const base = baselineFor(role, module);
  if (!module) return base;

  const userPerm = userPerms.find((p) => p.module === module) ?? null;
  const jobPerm = jobPerms.find((p) => p.module === module) ?? null;

  const resolved: PermissionResult = {
    canView: userPerm?.can_view ?? jobPerm?.can_view ?? base.canView,
    canCreate: userPerm?.can_create ?? jobPerm?.can_create ?? base.canCreate,
    canEdit: userPerm?.can_edit ?? jobPerm?.can_edit ?? base.canEdit,
    canDelete: userPerm?.can_delete ?? jobPerm?.can_delete ?? base.canDelete,
  };

  return applyHardOverrides(role, module, null, resolved);
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
  const jobPerm = module ? jobTitlePermissions.find((p) => p.module === module) : null;
  const base = profile?.role ? baselineFor(profile.role as UserRole, module) : { canView: false, canCreate: false, canEdit: false, canDelete: false };

  const supabaseUntyped = supabase as unknown as SupabaseClient;

  // Módulos client-only não existem no enum do banco — pular queries de scope para evitar erro 22P02
  const canQueryDB = !!module && !CLIENT_ONLY_MODULES.has(module);

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
    enabled: !!profile?.id && !!profile?.organization_id && canQueryDB && !isAdminOrOwner,
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
    enabled: !!profile?.organization_id && !!jobTitle && canQueryDB && !isAdminOrOwner,
  });

  const userPerm = module ? userPermissions.find((p) => p.module === module) : null;

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
  // Rotas pessoais/operacionais sem restrição de módulo
  if (pathname === "/team/me" || pathname.startsWith("/team/me?")) return null;
  if (pathname.startsWith("/timeclock/punch")) return null;
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

  // Módulos client-only não existem no enum do banco — pular queries para evitar erro 22P02
  const canQueryDB = !!module && !CLIENT_ONLY_MODULES.has(module);

  const { data: userPermissions = [], isLoading: loadingUserPerms } = useQuery({
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
    enabled: !!profile?.id && !!profile?.organization_id && canQueryDB && !isAdminOrOwner,
  });

  const { data: jobPermissions = [], isLoading: loadingJobPerms } = useQuery({
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
    enabled: !!profile?.organization_id && !!jobTitle && canQueryDB && !isAdminOrOwner,
  });

  const { data: userScopePerms = [], isLoading: loadingUserScope } = useQuery({
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
    enabled: !!profile?.id && !!profile?.organization_id && canQueryDB && !!scope && !isAdminOrOwner,
  });

  const { data: jobScopePerms = [], isLoading: loadingJobScope } = useQuery({
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
    enabled: !!profile?.organization_id && !!jobTitle && canQueryDB && !!scope && !isAdminOrOwner,
  });

  const isLoading = loadingUserPerms || loadingJobPerms || loadingUserScope || loadingJobScope;

  if (!module || isAdminOrOwner) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isAdminOrOwner: true,
      isLoading: false,
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
    return { ...applyHardOverrides(role, module, null, base), isAdminOrOwner: false, isLoading };
  }

  const userScope = userScopePerms[0] ?? null;
  const jobScope = jobScopePerms[0] ?? null;
  const scoped = {
    canView: userScope?.can_view ?? jobScope?.can_view ?? base.canView,
    canCreate: userScope?.can_create ?? jobScope?.can_create ?? base.canCreate,
    canEdit: userScope?.can_edit ?? jobScope?.can_edit ?? base.canEdit,
    canDelete: userScope?.can_delete ?? jobScope?.can_delete ?? base.canDelete,
  };

  return { ...applyHardOverrides(role, module, scope, scoped), isAdminOrOwner: false, isLoading };
}

export type PermFlags = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export const MODULE_VIEWS: Record<PermissionModule, Array<{ id: string; label: string }>> = {
  dashboard: [
    { id: "overview", label: "Visão Geral" },
    { id: "widgets", label: "Widgets" },
    { id: "public_link", label: "Link Público" },
  ],
  kanban: [
    { id: "pipeline", label: "Pipeline" },
    { id: "lead_details", label: "Detalhes do Lead" },
    { id: "lead_create", label: "Criar Lead" },
  ],
  crm: [
    { id: "leads", label: "Leads" },
    { id: "contacts", label: "Contatos" },
    { id: "pipeline_stages", label: "Etapas do Pipeline" },
  ],
  sales_analytics: [
    { id: "sales_dashboard", label: "Dashboard de Vendas" },
    { id: "funnel", label: "Funil" },
    { id: "conversion", label: "Conversão" },
  ],
  clients: [
    { id: "client_list", label: "Lista de Clientes" },
    { id: "client_details", label: "Detalhes do Cliente" },
    { id: "contracts", label: "Contratos" },
  ],
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
  projects: [
    { id: "project_list", label: "Lista de Projetos" },
    { id: "project_details", label: "Detalhes do Projeto" },
    { id: "tasks", label: "Tarefas" },
  ],
  agenda: [
    { id: "events", label: "Eventos" },
    { id: "calendar_view", label: "Visualização de Calendário" },
  ],
  goals: [
    { id: "goals_list", label: "Lista de Metas" },
    { id: "assignments", label: "Atribuições" },
    { id: "tracking", label: "Acompanhamento" },
  ],
  whatsapp: [
    { id: "conversations", label: "Conversas" },
    { id: "contacts", label: "Contatos" },
    { id: "broadcasts", label: "Transmissões" },
  ],
  meetings: [
    { id: "meeting_list", label: "Lista de Reuniões" },
    { id: "ai_summaries", label: "Resumos por IA" },
    { id: "recordings", label: "Gravações" },
  ],
  team: [
    { id: "employees", label: "Colaboradores" },
    { id: "teams", label: "Equipes" },
    { id: "payroll", label: "Folha de Pagamento" },
    { id: "timeclock", label: "Controle de Ponto" },
    { id: "timeclock_edit", label: "Editar/Excluir Registros de Ponto" },
    { id: "evaluations_360", label: "Avaliações 360°" },
    { id: "technical_evaluations", label: "Avaliações Técnicas" },
    { id: "absences", label: "Ausências" },
    { id: "trainings", label: "Treinamentos" },
    { id: "documents", label: "Documentos" },
    { id: "commissions", label: "Comissões" },
    { id: "score", label: "Score" },
  ],
  settings: [
    { id: "permissions", label: "Cargos e Permissões" },
    { id: "integrations", label: "Integrações" },
    { id: "general", label: "Configurações Gerais" },
  ],
  reports: [
    { id: "general_reports", label: "Relatórios Gerais" },
    { id: "campaign_reports", label: "Relatórios de Campanhas" },
  ],
  campaigns: [
    { id: "campaign_list", label: "Lista de Campanhas" },
    { id: "campaign_reports", label: "Relatórios de Campanhas" },
  ],
  audit: [
    { id: "audit_logs", label: "Logs de Auditoria" },
  ],
  timeclock: [
    { id: "punch", label: "Registro de Ponto" },
    { id: "history", label: "Histórico" },
    { id: "timeclock_edit", label: "Editar Registros" },
  ],
  performance: [
    { id: "hub_dashboard", label: "Dashboard de Performance" },
    { id: "individual_metrics", label: "Métricas Individuais" },
  ],
  integrations: [
    { id: "api_keys", label: "Chaves de API" },
    { id: "webhooks", label: "Webhooks" },
    { id: "third_party", label: "Integrações de Terceiros" },
  ],
  c8control: [
    { id: "tenants", label: "Tenants" },
    { id: "payments", label: "Pagamentos" },
    { id: "dashboard", label: "Dashboard" },
  ],
  fiscal: [
    { id: "invoices", label: "Notas Fiscais" },
    { id: "emit", label: "Emissão de NFS-e" },
  ],
  comercial: [],
} as Record<PermissionModule, Array<{ id: string; label: string }>>;

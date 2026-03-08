import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/types/supabase";

export type PermissionModule = Database["public"]["Enums"]["permission_module"];

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
  { id: "kanban", label: "Kanban" },
  { id: "clients", label: "Clientes" },
  { id: "financial", label: "Financeiro" },
  { id: "projects", label: "Projetos" },
  { id: "agenda", label: "Agenda" },
  { id: "goals", label: "Metas" },
  { id: "team", label: "Equipe" },
  { id: "settings", label: "Configurações" },
];

const ROUTE_TO_MODULE: Record<string, PermissionModule> = {
  "/kanban": "kanban",
  "/clients": "clients",
  "/suppliers": "clients",
  "/financial": "financial",
  "/projects": "projects",
  "/agenda": "agenda",
  "/goals": "goals",
  "/team": "team",
  "/settings": "settings",
};

/** Owner e admin têm acesso total; outros verificam user_permissions. module=null => acesso total. */
export function useModulePermission(module: PermissionModule | null) {
  const { profile } = useAuth();

  const isAdminOrOwner =
    profile?.role === "owner" || profile?.role === "admin";

  const { data: permissions = [] } = useQuery({
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

  const perm = module ? permissions.find((p) => p.module === module) : null;

  if (!module || isAdminOrOwner) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isAdminOrOwner: true,
    };
  }

  return {
    canView: perm?.can_view ?? false,
    canCreate: perm?.can_create ?? false,
    canEdit: perm?.can_edit ?? false,
    canDelete: perm?.can_delete ?? false,
    isAdminOrOwner: false,
  };
}

/** Retorna módulo para uma rota (ex: /kanban -> kanban) */
export function getModuleForRoute(pathname: string): PermissionModule | null {
  const exact = ROUTE_TO_MODULE[pathname];
  if (exact) return exact;
  for (const [route, mod] of Object.entries(ROUTE_TO_MODULE)) {
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

  return { ...query, upsert };
}

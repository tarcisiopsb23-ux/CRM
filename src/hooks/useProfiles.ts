import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Database } from "@/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role"];
const VALID_ROLES: UserRole[] = ["owner", "admin", "manager", "member", "viewer"];
const asUserRole = (s: string | undefined): UserRole | undefined =>
  s && VALID_ROLES.includes(s as UserRole) ? (s as UserRole) : undefined;

export interface ProfileRow {
  id: string;
  organization_id: string | null;
  code?: number | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  phone: string | null;
  is_active: boolean;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  commission_rate: number;
  bonus_rate_120: number;
  bonus_rate_135: number;
  bonus_rate_150: number;
  is_board_member: boolean;
  folder_id?: string | null;
  folder_url?: string | null;
}

export function useProfiles(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["profiles", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("code", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProfileRow[];
    },
    enabled: !!organizationId,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<ProfileRow> & { id: string }) => {
      const { metadata, role, ...rest } = input;
      const validRole = role !== undefined ? asUserRole(role) : undefined;
      const payload = {
        ...rest,
        ...(metadata !== undefined && { metadata: toJson(metadata) }),
        ...(validRole !== undefined && { role: validRole }),
      };
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles", organizationId] }),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      // Força refresh da sessão para garantir token válido
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ user_id: id }),
      });

      let body: { error?: string; success?: boolean } = {};
      try { body = await res.json(); } catch { /* sem body */ }

      if (!res.ok) throw new Error(body.error ?? `Erro ${res.status} ao desativar colaborador`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles", organizationId] }),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles", organizationId] }),
  });

  // Mantido por compatibilidade — chama deactivate internamente
  const remove = deactivate;

  return { ...query, update, remove, deactivate, activate };
}

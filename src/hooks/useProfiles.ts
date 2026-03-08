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
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  phone: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
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

  return { ...query, update };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseCrm } from "@/lib/supabase";

const VALIDATE_ACCESS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-access`;

export function useTenantUsers(tenantId?: string) {
  const qc = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["tenant_users", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabaseCrm
        .from("tenant_users")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const limitQuery = useQuery({
    queryKey: ["tenant_limit", tenantId],
    queryFn: async () => {
      if (!tenantId)
        return {
          allowed: true,
          current_users: 0,
          max_users: 3,
          plan_name: "Starter",
        };
      const res = await fetch(VALIDATE_ACCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: "check-limit", tenant_id: tenantId }),
      });
      return res.json();
    },
    enabled: !!tenantId,
  });

  const inviteUser = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch(VALIDATE_ACCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: "invite", tenant_id: tenantId, email }),
      });
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error ?? "Erro ao convidar usuário");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_users", tenantId] });
      qc.invalidateQueries({ queryKey: ["tenant_limit", tenantId] });
    },
  });

  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(VALIDATE_ACCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: "remove",
          tenant_id: tenantId,
          user_id: userId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error ?? "Erro ao remover usuário");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_users", tenantId] });
      qc.invalidateQueries({ queryKey: ["tenant_limit", tenantId] });
    },
  });

  return {
    users: usersQuery.data ?? [],
    currentCount: limitQuery.data?.current_users ?? 0,
    maxUsers: limitQuery.data?.max_users ?? 3,
    planName: limitQuery.data?.plan_name ?? "Starter",
    isLoading: usersQuery.isLoading,
    inviteUser,
    removeUser,
  };
}

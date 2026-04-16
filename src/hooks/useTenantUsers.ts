import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseCrm } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";

const VALIDATE_ACCESS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-access`;

/** Returns the current session's access token for authenticated Edge Function calls. */
async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");
  return session.access_token;
}

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

      // Filtrar usuários de suporte da agência (domínio @agenciac8.com.br)
      const filtered = (data ?? []).filter((u: any) =>
        !u.email?.toLowerCase().endsWith("@agenciac8.com.br")
      );

      // Se a tabela estiver vazia após filtro, incluir o usuário atual como admin
      // (caso o provision-tenant não tenha inserido em tenant_users)
      if (filtered.length === 0) {
        const { data: { session } } = await supabaseAuth.auth.getSession();
        if (session?.user && !session.user.email?.toLowerCase().endsWith("@agenciac8.com.br")) {
          return [{
            id:         session.user.id,
            user_id:    session.user.id,
            tenant_id:  tenantId,
            role:       "admin",
            email:      session.user.email,
            created_at: session.user.created_at,
          }];
        }
      }

      return filtered;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const limitQuery = useQuery({
    queryKey: ["tenant_limit", tenantId],
    queryFn: async () => {
      if (!tenantId) return { allowed: true, current_users: 0, max_users: 3, plan_name: "Starter" };
      const accessToken = await getAccessToken();
      const res = await fetch(VALIDATE_ACCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "check-limit", tenant_id: tenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao verificar limite");
      return data;
    },
    enabled: !!tenantId,
  });

  const inviteUser = useMutation({
    mutationFn: async (email: string) => {
      const accessToken = await getAccessToken();
      const res = await fetch(VALIDATE_ACCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "invite", tenant_id: tenantId, email }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro ao convidar usuário");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_users", tenantId] });
      qc.invalidateQueries({ queryKey: ["tenant_limit", tenantId] });
    },
  });

  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      const accessToken = await getAccessToken();
      const res = await fetch(VALIDATE_ACCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "remove", tenant_id: tenantId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro ao remover usuário");
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

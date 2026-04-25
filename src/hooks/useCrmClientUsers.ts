import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { callC8DataApi } from "./useC8DataApi";

export interface CrmClientUser {
  id: string;
  email: string;
  name: string | null;
  role?: string;
  active: boolean;
  last_access_at: string | null;
  created_at: string;
  organization_id?: string;
  client_id?: string;
  user_id?: string;
}

export function useCrmClientUsers(clientId: string | undefined, organizationId?: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["crm_client_users", clientId, organizationId],
    queryFn: async (): Promise<CrmClientUser[]> => {
      if (!clientId) return [];

      // Se tiver organizationId, tenta buscar do C8 Control diretamente
      if (organizationId) {
        try {
          const data = await callC8DataApi(organizationId, "users", clientId) as { users?: CrmClientUser[] };
          const remoteUsers = data?.users ?? [];
          // Só usa o resultado remoto se vier com dados — caso contrário cai no fallback local
          if (remoteUsers.length > 0) return remoteUsers;
        } catch (err) {
          console.warn("[useCrmClientUsers] C8 Control indisponível, usando fallback local:", err);
        }
      }

      // Fallback: tabela local (também usado quando a API remota retorna vazio)
      const { data, error } = await supabase
        .from("crm_client_users")
        .select("*")
        .eq("client_id", clientId)
        .eq("is_support", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmClientUser[];
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  // Total de usuários cadastrados (principal + convidados, excluindo suporte)
  // Usado para verificar o limite do plano
  const registeredCount = (query.data ?? []).length;

  const inviteUser = useMutation({
    mutationFn: async (input: { email: string; name?: string }) => {
      const { data, error } = await supabase.functions.invoke("crm-manage-user", {
        body: { action: "invite", client_id: clientId, ...input },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_client_users", clientId] }),
  });

  const removeUser = useMutation({
    mutationFn: async (user: { email: string; c8UserId?: string }) => {
      const { data, error } = await supabase.functions.invoke("crm-manage-user", {
        body: { action: "remove", client_id: clientId, email: user.email, c8_user_id: user.c8UserId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_client_users", clientId] }),
  });

  return { ...query, activeCount: registeredCount, inviteUser, removeUser };
}

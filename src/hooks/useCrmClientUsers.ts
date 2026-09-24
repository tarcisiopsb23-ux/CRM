import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { callC8DataApi } from "./useC8DataApi";

export interface CrmClientUser {
  id: string;
  email: string;
  name: string | null;
  role?: string;
  active: boolean;
  is_support?: boolean;
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

      // Se tiver organizationId, tenta buscar do C8 Control diretamente (Banco B = fonte de verdade)
      if (organizationId) {
        try {
          const data = await callC8DataApi(organizationId, "users", clientId) as { users?: CrmClientUser[] };
          const remoteUsers = data?.users ?? [];
          // Só usa o resultado remoto se vier com dados — caso contrário cai no fallback local.
          // Filtra usuários ativos e exclui usuários de suporte (is_support=true ou email suporte@).
          if (remoteUsers.length > 0) {
            return remoteUsers.filter((u) =>
              u.active !== false &&
              !u.is_support
            );
          }
        } catch (err) {
          console.warn("[useCrmClientUsers] C8 Control indisponível, usando fallback local:", err);
        }
      }

      // Fallback: tabela local (também usado quando a API remota retorna vazio).
      // Filtra active = true para não contar registros de usuários já removidos.
      const { data, error } = await supabase
        .from("crm_client_users")
        .select("*")
        .eq("client_id", clientId)
        .eq("is_support", false)
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmClientUser[];
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  // Usuários ativos (já filtrados na queryFn — remote filtra active !== false, fallback filtra active = true).
  // Usado para verificar o limite do plano e bloquear o botão de convite no frontend.
  const registeredCount = (query.data ?? []).length;

  const inviteUser = useMutation({
    mutationFn: async (input: { email: string; name?: string }) => {
      console.log("[inviteUser] enviando:", { client_id: clientId, ...input });
      const { data, error } = await supabase.functions.invoke("crm-manage-user", {
        body: { action: "invite", client_id: clientId, ...input },
      });
      console.log("[inviteUser] resposta:", { data, error });
      if (error) {
        // Extrai a mensagem real do body da resposta HTTP
        let errorMsg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          console.log("[inviteUser] error body:", body);
          errorMsg = body?.error ?? errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_client_users", clientId] }),
  });

  const removeUser = useMutation({
    mutationFn: async (user: { email?: string; c8UserId?: string }) => {
      if (!clientId) throw new Error("clientId não definido");
      if (!user.email && !user.c8UserId) throw new Error("email ou c8UserId é obrigatório");

      console.log("[removeUser] enviando:", { client_id: clientId, email: user.email, c8_user_id: user.c8UserId });

      const { data, error } = await supabase.functions.invoke("crm-manage-user", {
        body: {
          action:      "remove",
          client_id:   clientId,
          email:       user.email   || undefined,
          c8_user_id:  user.c8UserId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_client_users", clientId] }),
  });

  return { ...query, activeCount: registeredCount, inviteUser, removeUser };
}

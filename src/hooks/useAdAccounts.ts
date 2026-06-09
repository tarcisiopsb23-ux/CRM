import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdAccountStatus {
  platform: "meta" | "google";
  account_name: string | null;
  owned_by: "agency" | "client";
  connected_at: string | null;
  last_sync_at: string | null;
  active: boolean;
}

/** Retorna status de conexão das contas de anúncios SEM os tokens OAuth */
export function useAdAccounts(clientId: string | undefined) {
  const qc = useQueryClient();
  const qk = ["ad_account_status", clientId];

  const query = useQuery<AdAccountStatus[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .rpc("get_ad_account_status", { p_client_id: clientId });
      if (error) throw error;
      return (data ?? []) as AdAccountStatus[];
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  /** Desconecta uma conta (deleta o token do Banco A) */
  const disconnect = useMutation({
    mutationFn: async ({ platform, clientId }: { platform: "meta" | "google"; clientId: string }) => {
      const table = platform === "meta" ? "meta_ad_accounts" : "google_ad_accounts";
      const { error } = await supabase
        .from(table)
        .update({ active: false, access_token: null, refresh_token: null })
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { ...query, disconnect };
}

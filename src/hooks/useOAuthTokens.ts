import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface OAuthToken {
  id: string;
  client_id: string;
  provider: "google" | "meta";
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  ga4_property_id: string | null;
  gads_customer_id: string | null;
  meta_ad_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useOAuthTokens(clientId?: string) {
  const qc = useQueryClient();

  const query = useQuery<OAuthToken[]>({
    queryKey: ["oauth_tokens", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("oauth_tokens")
        .select("*")
        .eq("client_id", clientId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  const updateConfig = useMutation({
    mutationFn: async (params: {
      provider: "google" | "meta";
      ga4_property_id?: string;
      gads_customer_id?: string;
      meta_ad_account_id?: string;
    }) => {
      if (!clientId) throw new Error("client_id required");
      const { error } = await supabase
        .from("oauth_tokens")
        .update({
          ga4_property_id: params.ga4_property_id,
          gads_customer_id: params.gads_customer_id,
          meta_ad_account_id: params.meta_ad_account_id,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", clientId)
        .eq("provider", params.provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth_tokens", clientId] }),
  });

  const disconnect = useMutation({
    mutationFn: async (provider: "google" | "meta") => {
      if (!clientId) throw new Error("client_id required");
      const { error } = await supabase
        .from("oauth_tokens")
        .delete()
        .eq("client_id", clientId)
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth_tokens", clientId] }),
  });

  const googleToken = query.data?.find(t => t.provider === "google") ?? null;
  const metaToken = query.data?.find(t => t.provider === "meta") ?? null;

  return { query, googleToken, metaToken, updateConfig, disconnect };
}

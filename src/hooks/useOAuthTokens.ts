import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseCrm } from "@/lib/supabase";

export interface OAuthToken {
  id: string;
  tenant_id: string;
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

export function useOAuthTokens(tenantId?: string) {
  const qc = useQueryClient();

  const query = useQuery<OAuthToken[]>({
    queryKey: ["oauth_tokens", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabaseCrm
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const updateConfig = useMutation({
    mutationFn: async (params: {
      provider: "google" | "meta";
      ga4_property_id?: string;
      gads_customer_id?: string;
      meta_ad_account_id?: string;
    }) => {
      if (!tenantId) throw new Error("tenant_id required");
      const { error } = await supabaseCrm
        .from("oauth_tokens")
        .update({
          ga4_property_id: params.ga4_property_id,
          gads_customer_id: params.gads_customer_id,
          meta_ad_account_id: params.meta_ad_account_id,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("provider", params.provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth_tokens", tenantId] }),
  });

  const disconnect = useMutation({
    mutationFn: async (provider: "google" | "meta") => {
      if (!tenantId) throw new Error("tenant_id required");
      const { error } = await supabaseCrm
        .from("oauth_tokens")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth_tokens", tenantId] }),
  });

  const googleToken = query.data?.find(t => t.provider === "google") ?? null;
  const metaToken   = query.data?.find(t => t.provider === "meta")   ?? null;

  return { query, googleToken, metaToken, updateConfig, disconnect };
}

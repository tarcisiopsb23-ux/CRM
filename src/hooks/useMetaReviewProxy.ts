/**
 * useMetaReviewProxy
 *
 * Hook para executar chamadas à Meta API via Edge Function meta-review-proxy.
 * Nunca expõe o access_token ao frontend.
 *
 * Uso:
 *   const { call, result, loading, error } = useMetaReviewProxy();
 *   await call({ permission: "pages_show_list", endpoint: "/me/accounts" });
 */

import { useState, useCallback } from "react";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase } from "@/lib/supabase";
import type { ApiCallResult } from "@/pages/meta-review/shared/types";

interface ProxyCallOptions {
  permission: string;
  group_name?: string;
  endpoint: string;
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  params?: Record<string, unknown>;
  meta_connection_id?: string;
  client_id?: string;
  use_page_token?: boolean;
  page_id?: string;
}

interface UseMetaReviewProxyReturn {
  call: (options: ProxyCallOptions) => Promise<ApiCallResult | null>;
  result: ApiCallResult | null;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function useMetaReviewProxy(): UseMetaReviewProxyReturn {
  const [result, setResult] = useState<ApiCallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Usa a sessão do ClientAuthContext para enviar o JWT correto na Edge Function
  const { auth } = useClientAuth();
  const accessToken = auth?.session?.access_token;

  const call = useCallback(async (options: ProxyCallOptions): Promise<ApiCallResult | null> => {
    setLoading(true);
    setError(null);

    try {
      // Envia o JWT do dashboard do cliente no header Authorization
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const { data, error: fnError } = await supabase.functions.invoke("meta-review-proxy", {
        body: options,
        headers,
      });

      if (fnError) {
        const msg = fnError.message ?? "Erro na chamada à Meta API";
        setError(msg);
        setResult(null);
        return null;
      }

      const apiResult = data as ApiCallResult;
      setResult(apiResult);

      if (!apiResult.success) {
        setError(apiResult.error ?? "Erro retornado pela Meta API");
      }

      return apiResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { call, result, loading, error, reset };
}

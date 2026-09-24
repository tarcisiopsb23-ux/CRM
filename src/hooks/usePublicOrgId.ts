import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Retorna o ID da organização pública.
 * Prioridade: VITE_PUBLIC_ORG_ID (env) → RPC get_public_org_id (banco).
 * O env é lido de forma síncrona — sem delay de rede.
 */
export function usePublicOrgId() {
  const envOrgId = (import.meta.env.VITE_PUBLIC_ORG_ID as string | undefined)?.trim() || undefined;

  return useQuery({
    queryKey: ["public_org_id"],
    queryFn: async (): Promise<string | null> => {
      // 1. Usa env diretamente se disponível (sem chamada de rede)
      if (envOrgId) return envOrgId;

      // 2. Tenta RPC como fallback
      const { data, error } = await supabase.rpc("get_public_org_id");
      if (!error && data) return data as string;

      return null;
    },
    // Se o env já está disponível, retorna imediatamente sem fetch
    initialData: envOrgId ?? undefined,
    staleTime: Infinity, // org ID nunca muda
  });
}

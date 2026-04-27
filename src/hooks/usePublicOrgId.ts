import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Retorna o ID da organização pública via RPC.
 * Fallback para VITE_PUBLIC_ORG_ID se a RPC falhar.
 * Usado nas páginas públicas de vagas — sem necessidade de configurar env.
 */
export function usePublicOrgId() {
  const envOrgId = import.meta.env.VITE_PUBLIC_ORG_ID as string | undefined;

  return useQuery({
    queryKey: ["public_org_id"],
    queryFn: async (): Promise<string | null> => {
      // Tenta via RPC primeiro
      const { data, error } = await supabase.rpc("get_public_org_id");
      if (!error && data) return data as string;

      // Fallback para variável de ambiente
      return envOrgId ?? null;
    },
    staleTime: 10 * 60 * 1000, // 10 min — org ID não muda
    gcTime: 30 * 60 * 1000,
  });
}

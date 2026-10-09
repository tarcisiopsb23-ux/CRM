import { useClientAuth } from "@/hooks/useClientAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

import { Json } from "@/types/supabase";

/**
 * Retorna o organization_id do cliente atual.
 *
 * O C8 Control autentica via ClientAuthProvider (Banco A por slug), e NÃO via
 * o AuthProvider do CRM (que nunca é montado neste app). Por isso o
 * organization_id vem do contexto de auth do cliente. Usar useAuth() do
 * AuthContext aqui quebra com "useAuth must be used within AuthProvider" em
 * qualquer página do dashboard público.
 */
export function useOrganization() {
  const { auth } = useClientAuth();
  return auth?.organization_id ?? undefined;
}

export function useOrganizationData(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const update = useMutation({
    mutationFn: async (updates: { name?: string; logo_url?: string | null; settings?: Json; marketing_settings?: Json }) => {
      if (!organizationId) throw new Error("No organization ID");
      const { data, error } = await supabase
        .from("organizations")
        .update(updates)
        .eq("id", organizationId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organization", organizationId],
      });
    },
  });

  return { ...query, update };
}

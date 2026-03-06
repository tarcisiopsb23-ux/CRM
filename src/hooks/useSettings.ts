import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { IntegrationType, IntegrationConfig } from "@/types/settings";

interface IntegrationRow {
  id: string;
  organization_id: string;
  integration_type: string;
  config: IntegrationConfig;
  created_at: string;
  updated_at: string;
}

export function useIntegration(
  organizationId: string | undefined,
  integrationType: IntegrationType
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings", organizationId, integrationType],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await (supabase as any)
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("integration_type", integrationType)
        .maybeSingle();
      if (error) throw error;
      return data as IntegrationRow | null;
    },
    enabled: !!organizationId,
  });

  const upsert = useMutation({
    mutationFn: async (config: IntegrationConfig) => {
      if (!organizationId) throw new Error("No organization");
      const { data, error } = await (supabase as any)
        .from("organization_integrations")
        .upsert(
          {
            organization_id: organizationId,
            integration_type: integrationType,
            config: config as object,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "organization_id,integration_type",
          }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["settings", organizationId, integrationType],
      });
    },
  });

  return { ...query, upsert };
}

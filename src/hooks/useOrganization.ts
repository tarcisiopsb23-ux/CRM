import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

import { Json } from "@/types/supabase";

/** Returns the current user's organization ID from their profile. */
export function useOrganization() {
  const { profile } = useAuth();
  return profile?.organization_id ?? undefined;
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

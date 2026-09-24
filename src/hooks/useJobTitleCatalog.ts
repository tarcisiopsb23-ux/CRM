import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useMemo } from "react";
import { UserRole } from "@/types/auth";

export type JobTitleCatalogRow = {
  id: string;
  organization_id: string;
  job_title: string;
  role: UserRole;
  created_at: string | null;
  updated_at: string | null;
};

export function useJobTitleCatalog(organizationId: string | null) {
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ["job_title_catalog", organizationId], [organizationId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("job_title_catalog")
        .select("id, job_title, role")
        .eq("organization_id", organizationId)
        .order("job_title");
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (vars: { job_title: string }) => {
      if (!organizationId) throw new Error("Organização não encontrada");
      const { error } = await supabase
        .from("job_title_catalog")
        .insert({ organization_id: organizationId, job_title: vars.job_title });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async (vars: { id: string; job_title: string; role: UserRole }) => {
      if (!organizationId) throw new Error("Organização não encontrada");
      const { error } = await supabase
        .from("job_title_catalog")
        .update({ role: vars.role })
        .eq("id", vars.id);
      if (error) throw error;

      const title = String(vars.job_title ?? "").trim();
      if (!title) return;

      const supabaseUntyped = supabase as unknown as SupabaseClient;

      const { error: profilesError1 } = await supabaseUntyped
        .from("profiles")
        .update({ role: vars.role })
        .eq("organization_id", organizationId)
        .eq("metadata->>job_title", title);
      if (profilesError1) throw profilesError1;

      const { error: profilesError2 } = await supabaseUntyped
        .from("profiles")
        .update({ role: vars.role })
        .eq("organization_id", organizationId)
        .eq("metadata->>cargo", title);
      if (profilesError2) throw profilesError2;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const rename = useMutation({
    mutationFn: async (vars: { old_title: string; new_title: string }) => {
      if (!organizationId) throw new Error("Organização não encontrada");
      const { error } = await supabase.rpc("job_title_rename", {
        p_old: vars.old_title,
        p_new: vars.new_title,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["profiles", organizationId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (vars: { job_title: string }) => {
      if (!organizationId) throw new Error("Organização não encontrada");
      const { error } = await supabase
        .from("job_title_catalog")
        .delete()
        .eq("organization_id", organizationId)
        .eq("job_title", vars.job_title);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { ...query, create, rename, remove, update };
}

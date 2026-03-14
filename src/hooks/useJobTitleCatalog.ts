import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type JobTitleCatalogRow = {
  id: string;
  organization_id: string;
  job_title: string;
  created_at: string | null;
  updated_at: string | null;
};

export function useJobTitleCatalog(organizationId: string | undefined) {
  const qc = useQueryClient();
  const supabaseUntyped = supabase as unknown as SupabaseClient;

  const query = useQuery({
    queryKey: ["job_title_catalog", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabaseUntyped
        .from("job_title_catalog")
        .select("*")
        .eq("organization_id", organizationId)
        .order("job_title");
      if (error) throw error;
      return (data ?? []) as unknown as JobTitleCatalogRow[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: { job_title: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const title = input.job_title.trim();
      if (!title) throw new Error("Informe um cargo");
      const { error } = await supabaseUntyped
        .from("job_title_catalog")
        .insert({ organization_id: organizationId, job_title: title });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_title_catalog", organizationId] }),
  });

  const rename = useMutation({
    mutationFn: async (input: { old_title: string; new_title: string }) => {
      const oldTitle = input.old_title.trim();
      const newTitle = input.new_title.trim();
      if (!oldTitle || !newTitle) throw new Error("Informe os cargos");
      const { error } = await supabaseUntyped.rpc("job_title_rename", { p_old: oldTitle, p_new: newTitle });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_title_catalog", organizationId] });
      qc.invalidateQueries({ queryKey: ["job_title_role_mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["job_title_permissions", organizationId] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (input: { job_title: string }) => {
      const title = input.job_title.trim();
      if (!title) throw new Error("Informe um cargo");
      const { error } = await supabaseUntyped.rpc("job_title_delete", { p_job_title: title });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_title_catalog", organizationId] });
      qc.invalidateQueries({ queryKey: ["job_title_role_mappings", organizationId] });
      qc.invalidateQueries({ queryKey: ["job_title_permissions", organizationId] });
    },
  });

  return { ...query, create, rename, remove };
}


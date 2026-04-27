import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { JobOpening, JobOpeningStatus } from "@/types/recruitment";

export interface JobOpeningFilters {
  status?: JobOpeningStatus;
  job_title?: string;
  department?: string;
}

export function useJobOpenings(
  organizationId: string | undefined,
  filters: JobOpeningFilters = {}
) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["job_openings", organizationId, filters],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("job_openings")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (filters.status) q = q.eq("status", filters.status);
      if (filters.job_title) q = q.eq("job_title", filters.job_title);
      if (filters.department) q = q.eq("department", filters.department);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as JobOpening[];
    },
    enabled: !!organizationId,
  });

  // Contagem de candidatos por vaga
  const candidateCounts = useQuery({
    queryKey: ["job_openings_counts", organizationId],
    queryFn: async () => {
      if (!organizationId) return {};
      const { data, error } = await supabase
        .from("applications")
        .select("job_opening_id, status")
        .eq("organization_id", organizationId);
      if (error) throw error;
      const counts: Record<string, { total: number; new: number }> = {};
      for (const row of data ?? []) {
        const id = row.job_opening_id as string;
        if (!counts[id]) counts[id] = { total: 0, new: 0 };
        counts[id].total++;
        if (row.status === "novo") counts[id].new++;
      }
      return counts;
    },
    enabled: !!organizationId,
  });

  const openingsWithCounts = (query.data ?? []).map((o) => ({
    ...o,
    candidate_count: candidateCounts.data?.[o.id]?.total ?? 0,
    new_candidate_count: candidateCounts.data?.[o.id]?.new ?? 0,
  }));

  const create = useMutation({
    mutationFn: async (input: Omit<Partial<JobOpening>, "id" | "organization_id" | "created_at" | "updated_at"> & { title: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      // Remove campos computados que não existem na tabela
      const { candidate_count, new_candidate_count, avg_score, ...dbInput } = input as any;
      void candidate_count; void new_candidate_count; void avg_score;
      const { data, error } = await supabase
        .from("job_openings")
        .insert({ ...dbInput, organization_id: organizationId })
        .select()
        .single();
      if (error) throw error;
      return data as JobOpening;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_openings", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<JobOpening> & { id: string }) => {
      // Remove campos computados que não existem na tabela
      const { candidate_count, new_candidate_count, avg_score, ...dbInput } = input as any;
      void candidate_count; void new_candidate_count; void avg_score;
      const { data, error } = await supabase
        .from("job_openings")
        .update({ ...dbInput, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as JobOpening;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_openings", organizationId] }),
  });

  return { ...query, data: openingsWithCounts, create, update };
}

/** Busca vagas abertas publicamente (sem auth) */
export function usePublicJobOpenings(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["job_openings_public", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("job_openings")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "aberta")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobOpening[];
    },
    enabled: !!organizationId,
  });
}

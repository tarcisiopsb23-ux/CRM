import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, Candidate } from "@/types/recruitment";

export function useCandidates(
  organizationId: string | undefined,
  jobOpeningId: string | undefined
) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["applications", organizationId, jobOpeningId],
    queryFn: async () => {
      if (!organizationId || !jobOpeningId) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("*, candidate:candidates(*)")
        .eq("organization_id", organizationId)
        .eq("job_opening_id", jobOpeningId)
        .order("score_total", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Application[];
    },
    enabled: !!organizationId && !!jobOpeningId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApplicationStatus }) => {
      const { data, error } = await supabase
        .from("applications")
        .update({ status, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Application;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications", organizationId, jobOpeningId] }),
  });

  const updateScoreManual = useMutation({
    mutationFn: async ({
      id,
      score_manual,
      notes,
      score_auto,
      score_max,
    }: {
      id: string;
      score_manual: number;
      notes?: string;
      score_auto: number;
      score_max: number;
    }) => {
      const score_total = score_auto + score_manual;
      const score_percent = score_max > 0 ? Math.min(100, (score_total / score_max) * 100) : 0;
      const { data, error } = await supabase
        .from("applications")
        .update({
          score_manual,
          score_total,
          score_percent,
          ...(notes !== undefined && { notes }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Application;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications", organizationId, jobOpeningId] }),
  });

  const updateResumeUrl = useMutation({
    mutationFn: async ({ candidateId, url }: { candidateId: string; url: string }) => {
      const { error } = await supabase
        .from("candidates")
        .update({ resume_drive_url: url, updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications", organizationId, jobOpeningId] }),
  });

  return { ...query, updateStatus, updateScoreManual, updateResumeUrl };
}

/** Busca todos os candidatos da organização (para dashboard) */
export function useAllApplications(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["applications_all", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("*, candidate:candidates(full_name, email), job_opening:job_openings(title, job_title)")
        .eq("organization_id", organizationId)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Application[];
    },
    enabled: !!organizationId,
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TalentPool, ApplicationStatus, RequirementMatch, ApplicationAnswer } from "@/types/recruitment";

export function useTalentPool(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["talent_pool", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as TalentPool[];
      const { data, error } = await supabase
        .from("talent_pool")
        .select("*")
        .eq("organization_id", organizationId)
        .order("score_percent", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TalentPool[];
    },
    enabled: !!organizationId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: ApplicationStatus; notes?: string }) => {
      const { error } = await supabase
        .from("talent_pool")
        .update({ status, ...(notes !== undefined ? { notes } : {}), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["talent_pool", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("talent_pool").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["talent_pool", organizationId] }),
  });

  return { ...query, updateStatus, remove };
}

/** Submete candidatura ao banco de talentos via RPC pública */
export async function submitTalentPool(params: {
  organizationId: string;
  full_name: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  portfolio_url?: string;
  desired_role?: string;
  cover_letter?: string;
  requirements_match: RequirementMatch[];
  answers: ApplicationAnswer[];
  score_requirements: number;
  score_answers: number;
  score_total: number;
  score_max: number;
  score_percent: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_talent_pool", {
    p_organization_id:    params.organizationId,
    p_full_name:          params.full_name,
    p_email:              params.email,
    p_phone:              params.phone,
    p_linkedin_url:       params.linkedin_url ?? null,
    p_portfolio_url:      params.portfolio_url ?? null,
    p_desired_role:       params.desired_role ?? null,
    p_cover_letter:       params.cover_letter ?? null,
    p_requirements_match: params.requirements_match,
    p_answers:            params.answers,
    p_score_requirements: params.score_requirements,
    p_score_answers:      params.score_answers,
    p_score_total:        params.score_total,
    p_score_max:          params.score_max,
    p_score_percent:      params.score_percent,
  });
  if (error) throw error;
  return data as string;
}

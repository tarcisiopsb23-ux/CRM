import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { JobFormQuestion, JobOpening, ApplicationFormData } from "@/types/recruitment";
import { calculateTotalScore, calculateMaxScore, calculateScorePercent, scoreRequirements } from "@/lib/recruitmentScoring";

/** Busca perguntas de uma vaga (acesso público) via RPC */
export function useJobFormQuestions(jobOpeningId: string | undefined) {
  return useQuery({
    queryKey: ["job_form_questions", jobOpeningId],
    queryFn: async () => {
      if (!jobOpeningId) return [];
      // Tenta via RPC SECURITY DEFINER primeiro
      const { data, error } = await supabase.rpc("get_public_job_form_questions", {
        p_job_opening_id: jobOpeningId,
      });
      if (!error) return (data ?? []) as JobFormQuestion[];
      // Fallback: query direta
      const { data: fallback, error: fbErr } = await supabase
        .from("job_form_questions")
        .select("*")
        .eq("job_opening_id", jobOpeningId)
        .order("sort_order", { ascending: true });
      if (fbErr) throw fbErr;
      return (fallback ?? []) as JobFormQuestion[];
    },
    enabled: !!jobOpeningId,
  });
}

/** Busca detalhes de uma vaga pública via RPC */
export function usePublicJobOpening(jobOpeningId: string | undefined) {
  return useQuery({
    queryKey: ["job_opening_public", jobOpeningId],
    queryFn: async () => {
      if (!jobOpeningId) return null;
      // Tenta via RPC SECURITY DEFINER primeiro
      const { data, error } = await supabase.rpc("get_public_job_opening", {
        p_job_opening_id: jobOpeningId,
      });
      if (!error && data) {
        const rows = data as JobOpening[];
        return rows[0] ?? null;
      }
      // Fallback: query direta
      const { data: fallback, error: fbErr } = await supabase
        .from("job_openings")
        .select("*")
        .eq("id", jobOpeningId)
        .eq("status", "aberta")
        .maybeSingle();
      if (fbErr) throw fbErr;
      return fallback as JobOpening | null;
    },
    enabled: !!jobOpeningId,
  });
}

/** Submete uma candidatura (acesso público, sem auth) */
export function useSubmitApplication(jobOpening: JobOpening | null | undefined) {
  return useMutation({
    mutationFn: async ({
      formData,
      questions,
      resumeUploadFn,
    }: {
      formData: ApplicationFormData;
      questions: JobFormQuestion[];
      resumeUploadFn?: (file: File, jobTitle: string) => Promise<string | null>;
    }) => {
      if (!jobOpening) throw new Error("Vaga não encontrada.");

      // 1. Verificar duplicata
      const { data: existing } = await supabase
        .from("candidates")
        .select("id")
        .eq("organization_id", jobOpening.organization_id)
        .eq("email", formData.email.toLowerCase().trim())
        .maybeSingle();

      let candidateId: string;

      if (existing?.id) {
        // Verifica se já candidatou a esta vaga
        const { data: existingApp } = await supabase
          .from("applications")
          .select("id")
          .eq("job_opening_id", jobOpening.id)
          .eq("candidate_id", existing.id)
          .maybeSingle();

        if (existingApp) {
          throw new Error("Você já se candidatou a esta vaga.");
        }
        candidateId = existing.id;
      } else {
        // 2. Criar candidato
        const { data: newCandidate, error: candidateError } = await supabase
          .from("candidates")
          .insert({
            organization_id: jobOpening.organization_id,
            full_name: formData.full_name.trim(),
            email: formData.email.toLowerCase().trim(),
            phone: formData.phone?.trim() || null,
            linkedin_url: formData.linkedin_url?.trim() || null,
            portfolio_url: formData.portfolio_url?.trim() || null,
          })
          .select("id")
          .single();
        if (candidateError) throw candidateError;
        candidateId = newCandidate.id;
      }

      // 3. Calcular score
      const reqMatch = formData.requirements_match ?? [];
      const { score: scoreReq, maxScore: maxReq } = scoreRequirements(reqMatch);

      const scoredAnswers = calculateTotalScore(questions, formData.answers);
      const fullAnswers = scoredAnswers.map((a) => {
        const q = questions.find((q) => q.id === a.question_id);
        return { ...a, question_text: q?.question_text ?? '' };
      });
      const scoreAuto = fullAnswers.reduce((sum, a) => sum + a.score, 0);
      const scoreMax = calculateMaxScore(questions) + maxReq;
      const scoreTotal = scoreAuto + scoreReq;
      const scorePercent = calculateScorePercent(scoreTotal, scoreMax);

      // 4. Criar candidatura
      const { data: application, error: appError } = await supabase
        .from("applications")
        .insert({
          organization_id: jobOpening.organization_id,
          job_opening_id: jobOpening.id,
          candidate_id: candidateId,
          cover_letter: formData.cover_letter?.trim() || null,
          answers: fullAnswers,
          requirements_match: reqMatch,
          score_requirements: scoreReq,
          score_auto: scoreAuto,
          score_total: scoreTotal,
          score_max: scoreMax,
          score_percent: scorePercent,
          source: "web",
        })
        .select("id")
        .single();
      if (appError) throw appError;

      // 5. Upload do currículo (fire-and-forget)
      if (formData.resume_file && resumeUploadFn) {
        try {
          const driveUrl = await resumeUploadFn(
            formData.resume_file,
            jobOpening.title
          );
          if (driveUrl) {
            await supabase
              .from("candidates")
              .update({ resume_drive_url: driveUrl })
              .eq("id", candidateId);
          }
        } catch {
          // Não bloqueia a candidatura se o upload falhar
          console.warn("[Recruitment] Upload de currículo falhou — candidatura salva sem currículo.");
        }
      }

      return { applicationId: application.id, candidateId };
    },
  });
}

/** Hook para gerenciar perguntas de uma vaga (interno) */
export function useJobFormQuestionsAdmin(
  organizationId: string | undefined,
  jobOpeningId: string | undefined
) {
  const query = useJobFormQuestions(jobOpeningId);

  const upsertQuestions = useMutation({
    mutationFn: async (questions: Omit<JobFormQuestion, 'id' | 'created_at'>[]) => {
      if (!organizationId || !jobOpeningId) throw new Error("Sem organização ou vaga");
      // Remove perguntas antigas e insere as novas
      await supabase.from("job_form_questions").delete().eq("job_opening_id", jobOpeningId);
      if (questions.length === 0) return [];
      const { data, error } = await supabase
        .from("job_form_questions")
        .insert(questions.map((q, i) => ({ ...q, organization_id: organizationId, job_opening_id: jobOpeningId, sort_order: i })))
        .select();
      if (error) throw error;
      return data as JobFormQuestion[];
    },
  });

  return { ...query, upsertQuestions };
}

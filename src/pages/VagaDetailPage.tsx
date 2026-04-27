import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Briefcase, DollarSign, Loader2, AlertCircle } from "lucide-react";
import { PublicLayout } from "@/layouts/PublicLayout";
import { ApplicationForm } from "@/components/recruitment/ApplicationForm";
import { usePublicJobOpening, useJobFormQuestions } from "@/hooks/useApplicationForm";
import { useRecruitmentConfig } from "@/hooks/useRecruitmentConfig";
import { usePublicOrgId } from "@/hooks/usePublicOrgId";
import type { LocationType } from "@/types/recruitment";

const LOCATION_LABELS: Record<LocationType, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

export default function VagaDetailPage() {
  const { jobOpeningId } = useParams<{ jobOpeningId: string }>();
  const navigate = useNavigate();
  const { data: orgId } = usePublicOrgId();

  const { data: job, isLoading: loadingJob } = usePublicJobOpening(jobOpeningId);
  const { data: questions = [], isLoading: loadingQuestions } = useJobFormQuestions(jobOpeningId);
  const { config: recruitmentConfig } = useRecruitmentConfig(orgId ?? undefined);

  const isLoading = loadingJob || loadingQuestions;

  // Upload de currículo via n8n Drive webhook
  const handleResumeUpload = async (file: File, jobTitle: string): Promise<string | null> => {
    const webhookUrl = (recruitmentConfig as any)?.drive_webhook_url;
    if (!webhookUrl || !recruitmentConfig?.drive_folder_id) return null;

    try {
      const form = new FormData();
      form.set("action", "documents.upload");
      form.set("folderId", recruitmentConfig.drive_folder_id);
      form.set("subfolder", jobTitle);
      form.set("file", file, file.name);

      const res = await fetch(webhookUrl, { method: "POST", body: form });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return (data?.url ?? data?.webViewLink ?? null) as string | null;
    } catch {
      return null;
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Voltar */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm mb-8 transition-colors hover:text-white"
          style={{ color: "#9ca3af" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Ver todas as vagas
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#7c3aed" }} />
          </div>
        ) : !job ? (
          <div className="text-center py-20">
            <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: "#6b7280" }} />
            <h2 className="text-xl font-semibold text-white mb-2">Vaga não encontrada</h2>
            <p style={{ color: "#9ca3af" }}>Esta vaga pode ter sido encerrada ou não existe.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Cabeçalho da vaga */}
            <div>
              <h1 className="text-3xl font-bold text-white mb-3">{job.title}</h1>

              <div className="flex flex-wrap gap-4 text-sm mb-6" style={{ color: "#9ca3af" }}>
                {job.job_title && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    {job.job_title}
                  </span>
                )}
                {job.department && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    {job.department}
                  </span>
                )}
                {job.location_type && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {LOCATION_LABELS[job.location_type]}
                  </span>
                )}
                {job.salary_range && (
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    {job.salary_range}
                  </span>
                )}
              </div>

              {job.description && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-white mb-2">Sobre a vaga</h2>
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#d1d5db" }}>
                    {job.description}
                  </p>
                </div>
              )}

              {job.requirements && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-2">Requisitos</h2>
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#d1d5db" }}>
                    {job.requirements}
                  </p>
                </div>
              )}
            </div>

            {/* Divisor */}
            <div className="border-t" style={{ borderColor: "#1f2937" }} />

            {/* Formulário de candidatura */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">Candidatar-se</h2>
              <ApplicationForm
                jobOpening={job}
                questions={questions}
                onResumeUpload={handleResumeUpload}
              />
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

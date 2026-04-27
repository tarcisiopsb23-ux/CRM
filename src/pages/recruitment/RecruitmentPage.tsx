import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useModulePermission } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useJobOpenings } from "@/hooks/useJobOpenings";
import { useCandidates, useAllApplications } from "@/hooks/useCandidates";
import { useJobFormQuestionsAdmin } from "@/hooks/useApplicationForm";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { RecruitmentDashboard } from "@/components/recruitment/RecruitmentDashboard";
import { JobOpeningList } from "@/components/recruitment/JobOpeningList";
import { JobOpeningForm } from "@/components/recruitment/JobOpeningForm";
import { ApplicationFormBuilder } from "@/components/recruitment/ApplicationFormBuilder";
import { CandidateList } from "@/components/recruitment/CandidateList";
import { CandidateDetail } from "@/components/recruitment/CandidateDetail";
import type { JobOpening, Application, JobFormQuestion } from "@/types/recruitment";

export default function RecruitmentPage({ embedded = false }: { embedded?: boolean }) {
  const organizationId = useOrganization();
  const { canCreate } = useModulePermission("recruitment" as any);
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";

  const { data: openings = [], isLoading: loadingOpenings, create, update, remove } = useJobOpenings(organizationId);
  const { data: allApplications = [], isLoading: loadingApplications } = useAllApplications(organizationId);

  const [tab, setTab] = useState("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState<JobOpening | null>(null);
  const [builderOpening, setBuilderOpening] = useState<JobOpening | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<JobOpening | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);

  // Candidates for selected opening
  const {
    data: candidates = [],
    isLoading: loadingCandidates,
    updateStatus,
    updateScoreManual,
  } = useCandidates(organizationId, selectedOpening?.id);

  // Form questions for builder
  const { data: formQuestions = [], upsertQuestions } = useJobFormQuestionsAdmin(
    organizationId,
    builderOpening?.id
  );

  const handleDelete = async (id: string) => {
    await remove.mutateAsync(id);
  };

  const handleCreateOrUpdate = async (
    data: Partial<JobOpening>,
    approvedQuestions?: Omit<JobFormQuestion, "id" | "created_at" | "organization_id" | "job_opening_id">[]
  ) => {
    if (editingOpening) {
      await update.mutateAsync({ id: editingOpening.id, ...data });
      toast.success("Vaga atualizada.");
    } else {
      const created = await create.mutateAsync(data as any);
      // Se há perguntas aprovadas pela IA, salva automaticamente
      if (approvedQuestions && approvedQuestions.length > 0 && created?.id && organizationId) {
        try {
          await supabase.from("job_form_questions").delete().eq("job_opening_id", created.id);
          await supabase.from("job_form_questions").insert(
            approvedQuestions.map((q, i) => ({
              ...q,
              organization_id: organizationId,
              job_opening_id: created.id,
              sort_order: i,
            }))
          );
          toast.success(`Vaga criada com ${approvedQuestions.length} perguntas do formulário!`);
        } catch {
          toast.success("Vaga criada! Formulário não foi salvo — configure manualmente.");
        }
      } else {
        toast.success("Vaga criada.");
      }
    }
  };

  const handleViewCandidates = (opening: JobOpening) => {
    setSelectedOpening(opening);
    setTab("candidates");
  };

  const handleSelectApplication = (app: Application) => {
    setSelectedApplication(app);
    setDetailOpen(true);
  };

  const handleGenerateAIForBuilder = async () => {
    if (!builderOpening) return;
    setGeneratingAI(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-recruitment-form", {
        body: {
          title: builderOpening.title,
          description: builderOpening.description ?? "",
          requirements: builderOpening.requirements ?? "",
          department: builderOpening.department ?? "",
          location_type: builderOpening.location_type ?? "",
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.questions?.length) throw new Error("A IA não retornou perguntas.");
      // Salva direto as perguntas geradas — remove id/created_at que não existem na tabela
      const cleanQuestions = (data.questions as any[]).map(({ id, created_at, organization_id, job_opening_id, ...rest }: any) => rest);
      await upsertQuestions.mutateAsync(cleanQuestions as any);
      toast.success(`${data.questions.length} perguntas geradas e salvas pela IA!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar formulário.");
    } finally {
      setGeneratingAI(false);
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Recrutamento e Seleção</h1>
            <p className="text-sm text-muted-foreground">Gerencie vagas, candidatos e o processo seletivo</p>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="openings">Vagas</TabsTrigger>
          {selectedOpening && (
            <TabsTrigger value="candidates">
              Candidatos — {selectedOpening.title}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <RecruitmentDashboard
            openings={openings}
            applications={allApplications}
            isLoadingOpenings={loadingOpenings}
            isLoadingApplications={loadingApplications}
          />
        </TabsContent>

        <TabsContent value="openings" className="mt-4">
          <JobOpeningList
            openings={openings}
            isLoading={loadingOpenings}
            canCreate={canCreate}
            canDelete={isOwner}
            onNew={() => { setEditingOpening(null); setFormOpen(true); }}
            onEdit={(o) => { setEditingOpening(o); setFormOpen(true); }}
            onManageForm={(o) => setBuilderOpening(o)}
            onViewCandidates={handleViewCandidates}
            onDelete={isOwner ? handleDelete : undefined}
          />
        </TabsContent>

        {selectedOpening && (
          <TabsContent value="candidates" className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedOpening(null); setTab("openings"); }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar para vagas
              </Button>
            </div>
            <CandidateList
              applications={candidates}
              isLoading={loadingCandidates}
              onSelect={handleSelectApplication}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Modals */}
      <JobOpeningForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editingOpening}
        onSubmit={handleCreateOrUpdate}
      />

      {builderOpening && (
        <ApplicationFormBuilder
          open={!!builderOpening}
          onOpenChange={(v) => { if (!v) setBuilderOpening(null); }}
          jobOpening={builderOpening}
          initialQuestions={formQuestions}
          onSave={async (questions) => {
            await upsertQuestions.mutateAsync(questions as any);
          }}
          onGenerateWithAI={handleGenerateAIForBuilder}
          isGeneratingAI={generatingAI}
        />
      )}

      <CandidateDetail
        application={selectedApplication}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdateStatus={async (id, status) => {
          await updateStatus.mutateAsync({ id, status });
        }}
        onUpdateScore={async (params) => {
          await updateScoreManual.mutateAsync(params);
        }}
      />
    </div>
  );
}

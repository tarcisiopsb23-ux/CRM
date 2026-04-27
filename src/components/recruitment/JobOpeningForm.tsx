import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { JobOpening, LocationType, JobOpeningStatus, JobFormQuestion, JobRequirement } from "@/types/recruitment";
import { ApplicationFormBuilder } from "@/components/recruitment/ApplicationFormBuilder";
import { RequirementsEditor } from "@/components/recruitment/RequirementsEditor";
import { useJobFormQuestionsAdmin } from "@/hooks/useApplicationForm";
import { useOrganization } from "@/hooks/useOrganization";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: JobOpening | null;
  onSubmit: (data: Partial<JobOpening>, approvedQuestions?: SuggestedQuestion[]) => Promise<void>;
}

const LOCATION_LABELS: Record<LocationType, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

const STATUS_LABELS: Record<JobOpeningStatus, string> = {
  aberta: "Aberta",
  pausada: "Pausada",
  encerrada: "Encerrada",
};

type SuggestedQuestion = Omit<JobFormQuestion, "id" | "created_at" | "organization_id" | "job_opening_id">;

/** Remove campos computados que não existem na tabela job_openings */
function stripComputedFields(obj: Partial<JobOpening>): Partial<JobOpening> {
  const { candidate_count, new_candidate_count, avg_score, ...rest } = obj as any;
  void candidate_count; void new_candidate_count; void avg_score;
  return rest;
}

const EMPTY_FORM: Partial<JobOpening> = {
  title: "",
  job_title: "",
  department: "",
  description: "",
  requirements: "",
  location_type: "presencial",
  salary_range: "",
  status: "aberta",
  closes_at: "",
};

export function JobOpeningForm({ open, onOpenChange, editing, onSubmit }: Props) {
  const organizationId = useOrganization();
  const [form, setForm] = useState<Partial<JobOpening>>(EMPTY_FORM);
  const [requirementsList, setRequirementsList] = useState<JobRequirement[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Sincroniza o form quando editing muda (abre modal com vaga diferente) ──
  useEffect(() => {
    if (open) {
      setForm(editing ? stripComputedFields(editing) : EMPTY_FORM);
      setRequirementsList(editing?.requirements_list ?? []);
      setError(null);
      setSuggestedQuestions(null);
    }
  }, [open, editing]);

  // ── IA: geração de formulário ──────────────────────────────────────────────
  const [generatingForm, setGeneratingForm] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[] | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  // Para vagas já criadas, usa o hook de perguntas
  const { upsertQuestions } = useJobFormQuestionsAdmin(organizationId, editing?.id);

  const set = (key: keyof JobOpening, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim()) { setError("Título é obrigatório."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ ...stripComputedFields(form), requirements_list: requirementsList as any }, suggestedQuestions ?? undefined);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar vaga.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateForm = async () => {
    if (!form.title?.trim()) {
      toast.error("Preencha pelo menos o título da vaga antes de gerar o formulário.");
      return;
    }
    setGeneratingForm(true);
    setSuggestedQuestions(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-recruitment-form", {
        body: {
          title: form.title,
          description: form.description ?? "",
          requirements: form.requirements ?? "",
          department: form.department ?? "",
          location_type: form.location_type ?? "",
        },
      });
      if (fnError) {
        if (fnError.message?.includes("Failed to fetch") || fnError.message?.includes("ERR_FAILED")) {
          throw new Error("Edge Function não deployada. Execute: supabase functions deploy generate-recruitment-form");
        }
        throw new Error(fnError.message);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.questions?.length) throw new Error("A IA não retornou perguntas.");
      setSuggestedQuestions(data.questions as SuggestedQuestion[]);
      setBuilderOpen(true);
      toast.success(`${data.questions.length} perguntas geradas pela IA. Revise e aprove!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar formulário.");
    } finally {
      setGeneratingForm(false);
    }
  };

  const handleSaveGeneratedForm = async (
    questions: Omit<JobFormQuestion, "id" | "created_at" | "organization_id" | "job_opening_id">[]
  ) => {
    if (editing?.id) {
      await upsertQuestions.mutateAsync(questions as any);
      toast.success("Formulário salvo com sucesso!");
    } else {
      setSuggestedQuestions(questions as SuggestedQuestion[]);
      toast.success("Formulário aprovado! Salve a vaga para confirmar.");
    }
    setBuilderOpen(false);
  };

  const fakeJobOpening: JobOpening = {
    id: editing?.id ?? "preview",
    organization_id: organizationId ?? "",
    title: form.title ?? "Nova vaga",
    job_title: form.job_title ?? null,
    department: form.department ?? null,
    description: form.description ?? null,
    requirements: form.requirements ?? null,
    requirements_list: requirementsList,
    location_type: form.location_type ?? null,
    salary_range: form.salary_range ?? null,
    status: form.status ?? "aberta",
    published_at: null,
    closes_at: form.closes_at ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vaga" : "Nova vaga"}</DialogTitle>
            <DialogDescription className="sr-only">
              Preencha os dados da vaga e opcionalmente gere um formulário de candidatura com IA.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Título da vaga *</Label>
                <Input
                  value={form.title ?? ""}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Ex: Analista de Marketing"
                  required
                />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input
                  value={form.job_title ?? ""}
                  onChange={(e) => set("job_title", e.target.value)}
                  placeholder="Ex: Analista"
                />
              </div>
              <div>
                <Label>Departamento / Área</Label>
                <Input
                  value={form.department ?? ""}
                  onChange={(e) => set("department", e.target.value)}
                  placeholder="Ex: Marketing"
                />
              </div>
              <div>
                <Label>Tipo de trabalho</Label>
                <Select
                  value={form.location_type ?? "presencial"}
                  onValueChange={(v) => set("location_type", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LOCATION_LABELS) as [LocationType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Faixa salarial</Label>
                <Input
                  value={form.salary_range ?? ""}
                  onChange={(e) => set("salary_range", e.target.value)}
                  placeholder="Ex: R$ 3.000 - R$ 5.000"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status ?? "aberta"}
                  onValueChange={(v) => set("status", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(STATUS_LABELS) as [JobOpeningStatus, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data de encerramento</Label>
                <Input
                  type="date"
                  value={form.closes_at?.slice(0, 10) ?? ""}
                  onChange={(e) => set("closes_at", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label>Descrição da vaga</Label>
                <Textarea
                  rows={4}
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Descreva as responsabilidades e o dia a dia da função..."
                />
              </div>
              <div className="col-span-2">
                <Label>Requisitos</Label>
                <Textarea
                  rows={3}
                  value={form.requirements ?? ""}
                  onChange={(e) => set("requirements", e.target.value)}
                  placeholder="Formação, experiência, habilidades necessárias..."
                />
              </div>
            </div>

            {/* ── Requisitos pontuados ── */}
            <div className="rounded-lg border p-4">
              <RequirementsEditor
                value={requirementsList}
                onChange={setRequirementsList}
                department={form.department}
              />
            </div>

            {/* ── Bloco IA ── */}
            <div className="rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Formulário de candidatura com IA
                  </p>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                    A IA analisa a vaga e sugere perguntas relevantes baseadas no mercado. Você revisa e aprova antes de salvar.
                  </p>
                </div>
                {suggestedQuestions && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {suggestedQuestions.length} perguntas aprovadas
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-violet-400 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900"
                  onClick={handleGenerateForm}
                  disabled={generatingForm || !form.title?.trim()}
                >
                  {generatingForm
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando com IA...</>
                    : <><Sparkles className="h-4 w-4 mr-2" /> Gerar formulário com IA</>
                  }
                </Button>
                {suggestedQuestions && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-violet-600 hover:text-violet-800"
                    onClick={() => setBuilderOpen(true)}
                  >
                    Revisar perguntas
                  </Button>
                )}
              </div>

              {!form.title?.trim() && (
                <p className="text-xs text-violet-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Preencha o título da vaga para habilitar a geração.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar" : "Criar vaga"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {builderOpen && (
        <ApplicationFormBuilder
          open={builderOpen}
          onOpenChange={(v) => { if (!v) setBuilderOpen(false); }}
          jobOpening={fakeJobOpening}
          initialQuestions={(suggestedQuestions ?? []).map((q) => ({
            ...q,
            id: crypto.randomUUID(),
            organization_id: organizationId ?? "",
            job_opening_id: editing?.id ?? "preview",
            created_at: new Date().toISOString(),
          }))}
          onSave={handleSaveGeneratedForm}
          onGenerateWithAI={handleGenerateForm}
          isGeneratingAI={generatingForm}
        />
      )}
    </>
  );
}

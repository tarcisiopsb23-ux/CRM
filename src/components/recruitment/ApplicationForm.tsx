import { useState } from "react";
import { Loader2, CheckCircle2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { JobOpening, JobFormQuestion, ApplicationFormData, JobRequirement, RequirementMatch } from "@/types/recruitment";
import { useSubmitApplication } from "@/hooks/useApplicationForm";
import { scoreRequirements } from "@/lib/recruitmentScoring";

const ACCEPTED_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCENT = "#7c3aed";
const ACCENT_D = "#6d28d9";

interface Props {
  jobOpening: JobOpening;
  questions: JobFormQuestion[];
  onResumeUpload?: (file: File, jobTitle: string) => Promise<string | null>;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mb-6">
      <div className="flex justify-between text-xs mb-1" style={{ color: "#9ca3af" }}>
        <span>Passo {current} de {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ backgroundColor: "#1f2937" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
      </div>
    </div>
  );
}

function QuestionInput({ question, value, onChange }: {
  question: JobFormQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const inputStyle = { backgroundColor: "#111827", borderColor: "#374151", color: "#ffffff" };
  const btnActive = { backgroundColor: ACCENT, color: "#ffffff", border: `1px solid ${ACCENT}` };
  const btnInactive = { backgroundColor: "#1f2937", color: "#9ca3af", border: "1px solid #374151" };

  switch (question.question_type) {
    case "text":
      return <Textarea value={value as string} onChange={(e) => onChange(e.target.value)} placeholder="Sua resposta..." rows={3} style={{ ...inputStyle, resize: "none" as const }} />;
    case "scale_1_5":
      return (
        <div className="flex gap-3">
          {[1,2,3,4,5].map((n) => (
            <button key={n} type="button" onClick={() => onChange(String(n))}
              className="w-10 h-10 rounded-lg font-semibold text-sm transition-all"
              style={value === String(n) ? btnActive : btnInactive}>{n}</button>
          ))}
        </div>
      );
    case "yes_no":
      return (
        <div className="flex gap-3">
          {["Sim","Não"].map((opt) => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              className="px-6 py-2 rounded-lg font-medium text-sm transition-all"
              style={value === opt ? btnActive : btnInactive}>{opt}</button>
          ))}
        </div>
      );
    case "single_choice":
      return (
        <div className="space-y-2">
          {(question.options ?? []).map((opt) => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all"
              style={value === opt ? btnActive : { ...btnInactive, color: "#d1d5db" }}>{opt}</button>
          ))}
        </div>
      );
    case "multiple_choice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {(question.options ?? []).map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button key={opt} type="button"
                onClick={() => onChange(checked ? selected.filter((v) => v !== opt) : [...selected, opt])}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3"
                style={checked ? btnActive : { ...btnInactive, color: "#d1d5db" }}>
                <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                  style={{ borderColor: checked ? "#fff" : "#6b7280", backgroundColor: checked ? "#fff" : "transparent" }}>
                  {checked && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: ACCENT }} />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    default: return null;
  }
}

export function ApplicationForm({ jobOpening, questions, onResumeUpload }: Props) {
  const requirementsList: JobRequirement[] = (jobOpening.requirements_list ?? []) as JobRequirement[];
  const hasRequirements = requirementsList.length > 0;
  const hasQuestions = questions.length > 0;

  // Steps: personal → (requirements?) → (questions?) → success
  type Step = "personal" | "requirements" | "questions" | "success";
  const steps: Step[] = ["personal", ...(hasRequirements ? ["requirements" as Step] : []), ...(hasQuestions ? ["questions" as Step] : [])];
  const totalSteps = steps.length;

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx];

  const [personal, setPersonal] = useState({ full_name: "", email: "", phone: "", linkedin_url: "", portfolio_url: "", cover_letter: "" });
  const [reqMatch, setReqMatch] = useState<RequirementMatch[]>(() =>
    requirementsList.map((r) => ({ id: r.id, label: r.label, weight: r.weight, checked: false }))
  );
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = useSubmitApplication(jobOpening);

  const validatePersonal = () => {
    const e: Record<string, string> = {};
    if (!personal.full_name.trim()) e.full_name = "Nome é obrigatório.";
    if (!personal.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email)) e.email = "E-mail inválido.";
    if (!personal.phone.trim()) e.phone = "Telefone é obrigatório.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateAnswers = () => {
    const e: Record<string, string> = {};
    for (const q of questions) {
      if (!q.is_required) continue;
      const ans = answers[q.id];
      if (!ans || (Array.isArray(ans) ? ans.length === 0 : !String(ans).trim())) e[q.id] = "Obrigatória.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) { setFileError("Use PDF, DOC ou DOCX."); return; }
    if (file.size > MAX_FILE_SIZE) { setFileError("Máximo 10MB."); return; }
    setFileError(null); setResumeFile(file);
  };

  const next = () => {
    if (currentStep === "personal" && !validatePersonal()) return;
    if (currentStep === "questions" && !validateAnswers()) return;
    if (stepIdx < steps.length - 1) { setStepIdx((i) => i + 1); setErrors({}); }
    else handleSubmit();
  };

  const handleSubmit = async () => {
    if (currentStep === "questions" && !validateAnswers()) return;
    const formData: ApplicationFormData = { ...personal, answers, requirements_match: reqMatch, resume_file: resumeFile ?? undefined };
    try {
      await submitMutation.mutateAsync({ formData, questions, resumeUploadFn: onResumeUpload });
      setStepIdx(steps.length); // success
    } catch (err) {
      setErrors({ _global: err instanceof Error ? err.message : "Erro ao enviar candidatura." });
    }
  };

  const isLastStep = stepIdx === steps.length - 1;
  const inputStyle = { backgroundColor: "#111827", borderColor: "#374151", color: "#ffffff" };
  const labelStyle = { color: "#d1d5db" };

  // ── Success ──
  if (stepIdx >= steps.length && !submitMutation.isPending) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: "#22c55e" }} />
        <h2 className="text-2xl font-bold text-white mb-2">Candidatura enviada!</h2>
        <p style={{ color: "#9ca3af" }}>
          Obrigado, <strong className="text-white">{personal.full_name}</strong>!
          Nossa equipe analisará seu perfil e entrará em contato em breve.
        </p>
      </div>
    );
  }

  return (
    <div>
      {totalSteps > 1 && <ProgressBar current={stepIdx + 1} total={totalSteps} />}

      {/* ── Passo 1: Dados pessoais ── */}
      {currentStep === "personal" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Seus dados</h3>
          <div>
            <Label style={labelStyle}>Nome completo *</Label>
            <Input value={personal.full_name} onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })} style={inputStyle} />
            {errors.full_name && <p className="text-xs mt-1 text-red-400">{errors.full_name}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label style={labelStyle}>E-mail *</Label>
              <Input type="email" value={personal.email} onChange={(e) => setPersonal({ ...personal, email: e.target.value })} style={inputStyle} />
              {errors.email && <p className="text-xs mt-1 text-red-400">{errors.email}</p>}
            </div>
            <div>
              <Label style={labelStyle}>Telefone *</Label>
              <Input value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} placeholder="(00) 00000-0000" style={inputStyle} />
              {errors.phone && <p className="text-xs mt-1 text-red-400">{errors.phone}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label style={labelStyle}>LinkedIn</Label>
              <Input value={personal.linkedin_url} onChange={(e) => setPersonal({ ...personal, linkedin_url: e.target.value })} placeholder="linkedin.com/in/..." style={inputStyle} />
            </div>
            <div>
              <Label style={labelStyle}>Portfólio</Label>
              <Input value={personal.portfolio_url} onChange={(e) => setPersonal({ ...personal, portfolio_url: e.target.value })} placeholder="seusite.com.br" style={inputStyle} />
            </div>
          </div>
          <div>
            <Label style={labelStyle}>Carta de apresentação</Label>
            <Textarea value={personal.cover_letter} onChange={(e) => setPersonal({ ...personal, cover_letter: e.target.value })} rows={4} placeholder="Conte um pouco sobre você..." style={{ ...inputStyle, resize: "none" as const }} />
          </div>
          <div>
            <Label style={labelStyle}>Currículo (PDF, DOC ou DOCX — máx. 10MB)</Label>
            <div className="mt-1 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
              style={{ borderColor: "#374151" }}
              onClick={() => document.getElementById("resume-upload")?.click()}>
              {resumeFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-white">{resumeFile.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setResumeFile(null); }}>
                    <X className="h-4 w-4" style={{ color: "#9ca3af" }} />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto mb-2" style={{ color: "#6b7280" }} />
                  <p className="text-sm" style={{ color: "#9ca3af" }}>Clique para selecionar</p>
                </div>
              )}
            </div>
            <input id="resume-upload" type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
            {fileError && <p className="text-xs mt-1 text-red-400">{fileError}</p>}
          </div>
        </div>
      )}

      {/* ── Passo 2: Requisitos ── */}
      {currentStep === "requirements" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Requisitos da vaga</h3>
            <p className="text-sm" style={{ color: "#9ca3af" }}>
              Marque os requisitos que você possui. Isso ajuda a avaliar seu perfil.
            </p>
          </div>

          <div className="space-y-3">
            {reqMatch.map((req) => {
              const checked = req.checked;
              return (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setReqMatch((prev) => prev.map((r) => r.id === req.id ? { ...r, checked: !r.checked } : r))}
                  className="w-full text-left rounded-xl p-4 transition-all flex items-start gap-4"
                  style={{
                    backgroundColor: checked ? `${ACCENT}15` : "#111827",
                    border: `1px solid ${checked ? ACCENT : "#374151"}`,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                    style={{ borderColor: checked ? ACCENT : "#6b7280", backgroundColor: checked ? ACCENT : "transparent" }}
                  >
                    {checked && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: checked ? "#ffffff" : "#d1d5db" }}>
                      {req.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                      Peso: {req.weight}/10 · {req.weight * 10} pts
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Preview da pontuação */}
          {(() => {
            const { score, maxScore } = scoreRequirements(reqMatch);
            const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
            return (
              <div className="rounded-xl p-4" style={{ backgroundColor: "#111827", border: "1px solid #1f2937" }}>
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: "#9ca3af" }}>Pontuação nos requisitos</span>
                  <span style={{ color: ACCENT, fontWeight: 700 }}>{score} / {maxScore} pts ({pct}%)</span>
                </div>
                <div className="h-2 rounded-full" style={{ backgroundColor: "#1f2937" }}>
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Passo 3: Perguntas ── */}
      {currentStep === "questions" && (
        <div className="space-y-8">
          <h3 className="text-lg font-semibold text-white mb-4">Perguntas da vaga</h3>
          {questions.map((q, i) => (
            <div key={q.id}>
              <p className="text-sm font-medium text-white mb-2">
                {i + 1}. {q.question_text}
                {q.is_required && <span style={{ color: ACCENT }}> *</span>}
              </p>
              <QuestionInput
                question={q}
                value={answers[q.id] ?? (q.question_type === "multiple_choice" ? [] : "")}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
              {errors[q.id] && <p className="text-xs mt-1 text-red-400">{errors[q.id]}</p>}
            </div>
          ))}
        </div>
      )}

      {errors._global && (
        <p className="text-sm p-3 rounded-lg mt-4" style={{ backgroundColor: "#450a0a", color: "#fca5a5" }}>
          {errors._global}
        </p>
      )}

      {/* ── Navegação ── */}
      <div className={`flex gap-3 mt-6 ${stepIdx > 0 ? "" : ""}`}>
        {stepIdx > 0 && (
          <Button type="button" variant="outline" className="flex-1"
            onClick={() => { setStepIdx((i) => i - 1); setErrors({}); }}
            style={{ borderColor: "#374151", color: "#d1d5db" }}>
            Voltar
          </Button>
        )}
        <Button
          type="button"
          className={`font-semibold ${stepIdx > 0 ? "flex-1" : "w-full"}`}
          style={{ backgroundColor: ACCENT, color: "#ffffff" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_D)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
          onClick={next}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isLastStep ? "Enviar candidatura" : "Próximo"}
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Loader2, CheckCircle2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { JobOpening, JobFormQuestion, ApplicationFormData } from "@/types/recruitment";
import { useSubmitApplication } from "@/hooks/useApplicationForm";

const ACCEPTED_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: "#f97316" }}
        />
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: JobFormQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const inputStyle = {
    backgroundColor: "#111827",
    borderColor: "#374151",
    color: "#ffffff",
  };

  switch (question.question_type) {
    case "text":
      return (
        <Textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Sua resposta..."
          rows={3}
          style={inputStyle}
          className="resize-none"
        />
      );
    case "scale_1_5":
      return (
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(String(n))}
              className="w-10 h-10 rounded-lg font-semibold text-sm transition-all"
              style={{
                backgroundColor: value === String(n) ? "#f97316" : "#1f2937",
                color: value === String(n) ? "#ffffff" : "#9ca3af",
                border: `1px solid ${value === String(n) ? "#f97316" : "#374151"}`,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      );
    case "yes_no":
      return (
        <div className="flex gap-3">
          {["Sim", "Não"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className="px-6 py-2 rounded-lg font-medium text-sm transition-all"
              style={{
                backgroundColor: value === opt ? "#f97316" : "#1f2937",
                color: value === opt ? "#ffffff" : "#9ca3af",
                border: `1px solid ${value === opt ? "#f97316" : "#374151"}`,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    case "single_choice":
      return (
        <div className="space-y-2">
          {(question.options ?? []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all"
              style={{
                backgroundColor: value === opt ? "#f97316" : "#1f2937",
                color: value === opt ? "#ffffff" : "#d1d5db",
                border: `1px solid ${value === opt ? "#f97316" : "#374151"}`,
              }}
            >
              {opt}
            </button>
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
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = checked ? selected.filter((v) => v !== opt) : [...selected, opt];
                  onChange(next);
                }}
                className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3"
                style={{
                  backgroundColor: checked ? "#f97316" : "#1f2937",
                  color: checked ? "#ffffff" : "#d1d5db",
                  border: `1px solid ${checked ? "#f97316" : "#374151"}`,
                }}
              >
                <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                  style={{ borderColor: checked ? "#ffffff" : "#6b7280", backgroundColor: checked ? "#ffffff" : "transparent" }}>
                  {checked && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#f97316" }} />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}

export function ApplicationForm({ jobOpening, questions, onResumeUpload }: Props) {
  const [step, setStep] = useState<"personal" | "questions" | "success">("personal");
  const [personal, setPersonal] = useState({
    full_name: "", email: "", phone: "",
    linkedin_url: "", portfolio_url: "", cover_letter: "",
  });
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = useSubmitApplication(jobOpening);

  const showProgress = questions.length > 5;
  const totalSteps = showProgress ? 2 : 1;
  const currentStep = step === "personal" ? 1 : 2;

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
      const empty = !ans || (Array.isArray(ans) ? ans.length === 0 : !String(ans).trim());
      if (empty) e[q.id] = "Esta pergunta é obrigatória.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Formato não suportado. Use PDF, DOC ou DOCX.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("Arquivo muito grande (máximo 10MB).");
      return;
    }
    setFileError(null);
    setResumeFile(file);
  };

  const handleNext = () => {
    if (step === "personal") {
      if (!validatePersonal()) return;
      if (questions.length === 0) {
        handleSubmit();
      } else {
        setStep("questions");
      }
    }
  };

  const handleSubmit = async () => {
    if (step === "questions" && !validateAnswers()) return;

    const formData: ApplicationFormData = {
      ...personal,
      answers,
      resume_file: resumeFile ?? undefined,
    };

    try {
      await submitMutation.mutateAsync({
        formData,
        questions,
        resumeUploadFn: onResumeUpload,
      });
      setStep("success");
    } catch (err) {
      setErrors({ _global: err instanceof Error ? err.message : "Erro ao enviar candidatura." });
    }
  };

  if (step === "success") {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: "#22c55e" }} />
        <h2 className="text-2xl font-bold text-white mb-2">Candidatura enviada!</h2>
        <p style={{ color: "#9ca3af" }}>
          Obrigado pelo interesse, <strong className="text-white">{personal.full_name}</strong>!
          Nossa equipe analisará seu perfil e entrará em contato em breve.
        </p>
      </div>
    );
  }

  const inputStyle = { backgroundColor: "#111827", borderColor: "#374151", color: "#ffffff" };
  const labelStyle = { color: "#d1d5db" };

  return (
    <div>
      {showProgress && <ProgressBar current={currentStep} total={totalSteps} />}

      {step === "personal" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Seus dados</h3>

          <div>
            <Label style={labelStyle}>Nome completo *</Label>
            <Input value={personal.full_name} onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })} style={inputStyle} />
            {errors.full_name && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.full_name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label style={labelStyle}>E-mail *</Label>
              <Input type="email" value={personal.email} onChange={(e) => setPersonal({ ...personal, email: e.target.value })} style={inputStyle} />
              {errors.email && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.email}</p>}
            </div>
            <div>
              <Label style={labelStyle}>Telefone *</Label>
              <Input value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} placeholder="(00) 00000-0000" style={inputStyle} />
              {errors.phone && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.phone}</p>}
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
            <Textarea value={personal.cover_letter} onChange={(e) => setPersonal({ ...personal, cover_letter: e.target.value })} rows={4} placeholder="Conte um pouco sobre você e por que quer fazer parte do time C8..." style={{ ...inputStyle, resize: "none" }} />
          </div>

          {/* Upload de currículo */}
          <div>
            <Label style={labelStyle}>Currículo (PDF, DOC ou DOCX — máx. 10MB)</Label>
            <div
              className="mt-1 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors hover:border-orange-500/50"
              style={{ borderColor: "#374151" }}
              onClick={() => document.getElementById("resume-upload")?.click()}
            >
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
                  <p className="text-sm" style={{ color: "#9ca3af" }}>Clique para selecionar o arquivo</p>
                </div>
              )}
            </div>
            <input id="resume-upload" type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
            {fileError && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{fileError}</p>}
          </div>

          {errors._global && <p className="text-sm p-3 rounded-lg" style={{ backgroundColor: "#450a0a", color: "#fca5a5" }}>{errors._global}</p>}

          <Button
            type="button"
            className="w-full py-3 font-semibold"
            style={{ backgroundColor: "#f97316", color: "#ffffff" }}
            onClick={questions.length > 0 ? handleNext : handleSubmit}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {questions.length > 0 ? "Próximo" : "Enviar candidatura"}
          </Button>
        </div>
      )}

      {step === "questions" && (
        <div className="space-y-8">
          <h3 className="text-lg font-semibold text-white mb-4">Perguntas da vaga</h3>

          {questions.map((q, i) => (
            <div key={q.id}>
              <p className="text-sm font-medium text-white mb-2">
                {i + 1}. {q.question_text}
                {q.is_required && <span style={{ color: "#f97316" }}> *</span>}
              </p>
              <QuestionInput
                question={q}
                value={answers[q.id] ?? (q.question_type === "multiple_choice" ? [] : "")}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
              {errors[q.id] && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors[q.id]}</p>}
            </div>
          ))}

          {errors._global && <p className="text-sm p-3 rounded-lg" style={{ backgroundColor: "#450a0a", color: "#fca5a5" }}>{errors._global}</p>}

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("personal")} style={{ borderColor: "#374151", color: "#d1d5db" }}>
              Voltar
            </Button>
            <Button
              type="button"
              className="flex-1 font-semibold"
              style={{ backgroundColor: "#f97316", color: "#ffffff" }}
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar candidatura
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

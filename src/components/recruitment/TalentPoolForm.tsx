/**
 * TalentPoolForm — Formulário público de candidatura espontânea
 * Exibido na seção "Banco de Talentos" da página pública de vagas.
 */
import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, Upload, X } from "lucide-react";
import { submitTalentPool } from "@/hooks/useTalentPool";
import { scoreRequirements } from "@/lib/recruitmentScoring";
import { supabase } from "@/lib/supabase";
import type { RequirementMatch } from "@/types/recruitment";

const ACCENT = "#7c3aed";
const ACCENT_D = "#6d28d9";

// Requisitos genéricos para candidatura espontânea
const GENERIC_REQUIREMENTS: { id: string; label: string; weight: number }[] = [
  { id: "r1", label: "Experiência em marketing digital", weight: 6 },
  { id: "r2", label: "Experiência em tráfego pago (Meta/Google Ads)", weight: 7 },
  { id: "r3", label: "Experiência em gestão de redes sociais", weight: 5 },
  { id: "r4", label: "Experiência em vendas / comercial", weight: 6 },
  { id: "r5", label: "Experiência em atendimento ao cliente", weight: 5 },
  { id: "r6", label: "Conhecimento em ferramentas de automação", weight: 6 },
  { id: "r7", label: "Experiência com sistemas de cobrança / financeiro", weight: 5 },
  { id: "r8", label: "Habilidades em design / criação de conteúdo", weight: 5 },
  { id: "r9", label: "Experiência em gestão de projetos", weight: 6 },
  { id: "r10", label: "Conhecimento em análise de dados / relatórios", weight: 6 },
];

interface Props {
  organizationId?: string | null;
}

const ENV_ORG_ID = (import.meta.env.VITE_PUBLIC_ORG_ID as string | undefined)?.trim() || null;

export function TalentPoolForm({ organizationId: propOrgId }: Props) {
  // Resolve org ID: prop → env → RPC (assíncrono, não bloqueia o render)
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(
    propOrgId ?? ENV_ORG_ID
  );

  useEffect(() => {
    if (resolvedOrgId) return;
    supabase.rpc("get_public_org_id").then(({ data }) => {
      if (data) setResolvedOrgId(data as string);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState<"personal" | "requirements" | "success">("personal");
  const [personal, setPersonal] = useState({ full_name: "", email: "", phone: "", linkedin_url: "", portfolio_url: "", desired_role: "", cover_letter: "" });
  const [reqMatch, setReqMatch] = useState<RequirementMatch[]>(
    GENERIC_REQUIREMENTS.map((r) => ({ ...r, checked: false }))
  );
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validatePersonal = () => {
    const e: Record<string, string> = {};
    if (!personal.full_name.trim()) e.full_name = "Nome é obrigatório.";
    if (!personal.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email)) e.email = "E-mail inválido.";
    if (!personal.phone.trim()) e.phone = "Telefone é obrigatório.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    const ok = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type);
    if (!ok) { setFileError("Use PDF, DOC ou DOCX."); return; }
    if (file.size > 10 * 1024 * 1024) { setFileError("Máximo 10MB."); return; }
    setFileError(null); setResumeFile(file);
  };

  const handleSubmit = async () => {
    if (!resolvedOrgId) {
      setErrors({ _global: "Não foi possível identificar a organização. Tente novamente." });
      return;
    }
    setSubmitting(true);
    try {
      const { score, maxScore } = scoreRequirements(reqMatch);
      const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;

      await submitTalentPool({
        organizationId: resolvedOrgId,
        full_name: personal.full_name,
        email: personal.email,
        phone: personal.phone,
        linkedin_url: personal.linkedin_url || undefined,
        portfolio_url: personal.portfolio_url || undefined,
        desired_role: personal.desired_role || undefined,
        cover_letter: personal.cover_letter || undefined,
        requirements_match: reqMatch,
        answers: [],
        score_requirements: score,
        score_answers: 0,
        score_total: score,
        score_max: maxScore,
        score_percent: pct,
      });
      setStep("success");
    } catch (err) {
      setErrors({ _global: err instanceof Error ? err.message : "Erro ao enviar. Tente novamente." });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { backgroundColor: "#111827", borderColor: "#374151", color: "#ffffff" };
  const labelStyle = { color: "#d1d5db", fontSize: "0.875rem", marginBottom: "0.25rem", display: "block" as const };

  if (step === "success") {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: "#22c55e" }} />
        <h3 className="text-2xl font-bold text-white mb-2">Perfil cadastrado!</h3>
        <p style={{ color: "#9ca3af" }}>
          Obrigado, <strong className="text-white">{personal.full_name}</strong>!
          Seu perfil foi adicionado ao nosso banco de talentos.
          Entraremos em contato quando surgir uma oportunidade compatível.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-1" style={{ color: "#9ca3af" }}>
          <span>Passo {step === "personal" ? 1 : 2} de 2</span>
          <span>{step === "personal" ? 50 : 100}%</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: "#1f2937" }}>
          <div className="h-1.5 rounded-full transition-all" style={{ width: step === "personal" ? "50%" : "100%", backgroundColor: ACCENT }} />
        </div>
      </div>

      {/* ── Passo 1: Dados pessoais ── */}
      {step === "personal" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white mb-2">Seus dados</h3>

          <div>
            <label style={labelStyle}>Nome completo *</label>
            <input value={personal.full_name} onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 transition-all"
              style={{ ...inputStyle, border: "1px solid #374151" }}
              placeholder="Seu nome completo" />
            {errors.full_name && <p className="text-xs mt-1 text-red-400">{errors.full_name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>E-mail *</label>
              <input type="email" value={personal.email} onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{ ...inputStyle, border: "1px solid #374151" }} placeholder="seu@email.com" />
              {errors.email && <p className="text-xs mt-1 text-red-400">{errors.email}</p>}
            </div>
            <div>
              <label style={labelStyle}>Telefone *</label>
              <input value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{ ...inputStyle, border: "1px solid #374151" }} placeholder="(00) 00000-0000" />
              {errors.phone && <p className="text-xs mt-1 text-red-400">{errors.phone}</p>}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Cargo / área de interesse</label>
            <input value={personal.desired_role} onChange={(e) => setPersonal({ ...personal, desired_role: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
              style={{ ...inputStyle, border: "1px solid #374151" }} placeholder="Ex: Analista de Marketing, Gestor de Tráfego..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>LinkedIn</label>
              <input value={personal.linkedin_url} onChange={(e) => setPersonal({ ...personal, linkedin_url: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{ ...inputStyle, border: "1px solid #374151" }} placeholder="linkedin.com/in/..." />
            </div>
            <div>
              <label style={labelStyle}>Portfólio</label>
              <input value={personal.portfolio_url} onChange={(e) => setPersonal({ ...personal, portfolio_url: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{ ...inputStyle, border: "1px solid #374151" }} placeholder="seusite.com.br" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Por que quer fazer parte do time C8?</label>
            <textarea value={personal.cover_letter} onChange={(e) => setPersonal({ ...personal, cover_letter: e.target.value })}
              rows={4} placeholder="Conte um pouco sobre você e suas motivações..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all resize-none"
              style={{ ...inputStyle, border: "1px solid #374151" }} />
          </div>

          <div>
            <label style={labelStyle}>Currículo (PDF, DOC ou DOCX — máx. 10MB)</label>
            <div className="mt-1 rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition-colors"
              style={{ borderColor: "#374151" }}
              onClick={() => document.getElementById("tp-resume")?.click()}>
              {resumeFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-white">{resumeFile.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setResumeFile(null); }}>
                    <X className="h-4 w-4" style={{ color: "#9ca3af" }} />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="h-7 w-7 mx-auto mb-2" style={{ color: "#6b7280" }} />
                  <p className="text-sm" style={{ color: "#9ca3af" }}>Clique para selecionar</p>
                </div>
              )}
            </div>
            <input id="tp-resume" type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
            {fileError && <p className="text-xs mt-1 text-red-400">{fileError}</p>}
          </div>

          <button type="button"
            className="w-full py-3 rounded-xl font-bold text-sm transition-all"
            style={{ backgroundColor: ACCENT, color: "#ffffff" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_D)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
            onClick={() => { if (validatePersonal()) setStep("requirements"); }}>
            Próximo →
          </button>
        </div>
      )}

      {/* ── Passo 2: Requisitos ── */}
      {step === "requirements" && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Suas habilidades</h3>
            <p className="text-sm" style={{ color: "#9ca3af" }}>
              Marque as habilidades e experiências que você possui. Isso ajuda a encontrar a vaga certa para você.
            </p>
          </div>

          <div className="space-y-2">
            {reqMatch.map((req) => (
              <button key={req.id} type="button"
                onClick={() => setReqMatch((prev) => prev.map((r) => r.id === req.id ? { ...r, checked: !r.checked } : r))}
                className="w-full text-left rounded-xl p-4 transition-all flex items-center gap-4"
                style={{
                  backgroundColor: req.checked ? `${ACCENT}15` : "#111827",
                  border: `1px solid ${req.checked ? ACCENT : "#374151"}`,
                }}>
                <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                  style={{ borderColor: req.checked ? ACCENT : "#6b7280", backgroundColor: req.checked ? ACCENT : "transparent" }}>
                  {req.checked && (
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm" style={{ color: req.checked ? "#ffffff" : "#d1d5db" }}>{req.label}</span>
              </button>
            ))}
          </div>

          {errors._global && (
            <p className="text-sm p-3 rounded-lg" style={{ backgroundColor: "#450a0a", color: "#fca5a5" }}>
              {errors._global}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button"
              className="flex-1 py-3 rounded-xl font-medium text-sm transition-all"
              style={{ border: "1px solid #374151", color: "#d1d5db", backgroundColor: "transparent" }}
              onClick={() => setStep("personal")}>
              Voltar
            </button>
            <button type="button"
              className="flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: ACCENT, color: "#ffffff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ACCENT_D)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
              onClick={handleSubmit}
              disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar perfil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

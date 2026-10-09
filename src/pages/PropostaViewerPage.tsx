// ─────────────────────────────────────────────────────────────────────────────
// PropostaViewerPage — Plano Estratégico de Crescimento
// Rota pública: /proposta/:slug  — sem autenticação, sem navbar do CRM
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, MessageCircle, Infinity as InfinityIcon,
  Sparkles, CheckCircle2, Clock, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProposalSection, ProposalService, ScheduleConfig } from "@/types/proposals";
import type { SectionKey } from "@/types/proposals";
import { PropostaAceiteModal } from "@/components/propostas/PropostaAceiteModal";
import { generateScheduleFromConfig, MODE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/financialSchedule";
import { InViewFade } from "@/components/propostas/viewer/InViewFade";
import { AnimatedCounter } from "@/components/propostas/viewer/AnimatedCounter";
import { ProjecaoChart, type ProjecaoData } from "@/components/propostas/viewer/ProjecaoChart";
import { RoadmapNav, type RoadmapStep } from "@/components/propostas/viewer/RoadmapNav";
import { HeroIlustrative } from "@/components/propostas/viewer/HeroIlustrative";
import {
  C, SectionWrapper, SectionHeader,
  SecaoApresentacao, SecaoDiagnostico, SecaoObjetivos,
  SecaoEstrategia, SecaoMetodologia, SecaoSolucao,
  SecaoEscopo, SecaoDisferenciais, SecaoGarantias,
  SecaoCases, SecaoDepoimentos, SecaoFAQ,
  ProseFallback,
} from "@/components/propostas/viewer/PlanSections";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProposalData {
  proposal_id: string;
  organization_id: string;
  client_name: string;
  title: string;
  status: string;
  hero_logo_url: string | null;
  hero_title: string;
  hero_subtitle: string | null;
  hero_message: string | null;
  hero_video_url: string | null;
  hero_image_url: string | null;
  hero_whatsapp_text: string;
  hero_whatsapp_number: string | null;
  hero_cta_text: string;
  hero_cta_color: string;
  plan_value: number;
  schedule: ScheduleConfig | null;
  projecoes?: ProjecaoData | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TRACK_URL    = `${SUPABASE_URL}/functions/v1/proposal-track-event`;

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function getSessionId(): string {
  let sid = sessionStorage.getItem("proposal_session_id");
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem("proposal_session_id", sid); }
  return sid;
}

async function trackEvent(action: string, slug: string, extra?: Record<string, unknown>) {
  try {
    await fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, slug, session_id: getSessionId(), user_agent: navigator.userAgent, ...extra }),
    });
  } catch { /* silent */ }
}

// Mapeia section_key → rótulo do roadmap e fase
const SECTION_ROADMAP: Partial<Record<SectionKey, { label: string; phase: string }>> = {
  apresentacao:       { label: "Cenário",       phase: "01" },
  diagnostico:        { label: "Diagnóstico",   phase: "02" },
  objetivos:          { label: "Objetivos",     phase: "03" },
  estrategia:         { label: "Estratégia",    phase: "04" },
  solucao:            { label: "Solução",       phase: "05" },
  escopo:             { label: "Escopo",        phase: "06" },
  metodologia:        { label: "Metodologia",   phase: "07" },
  diferenciais:       { label: "Diferenciais",  phase: "08" },
  cases:              { label: "Cases",         phase: "09" },
  depoimentos:        { label: "Depoimentos",   phase: "10" },
  faq:                { label: "FAQ",           phase: "11" },
  garantias:          { label: "Compromissos",  phase: "12" },
  consideracoes_finais:{ label: "Observações",  phase: "13" },
};

// ─── Hero ─────────────────────────────────────────────────────────────────────

function PlanHero({
  data, onApprove, onWhatsApp, approved,
}: {
  data: ProposalData; onApprove: () => void; onWhatsApp: () => void; approved: boolean;
}) {
  return (
    <section
      id="sec-hero"
      className="relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 60% 70% at 70% -10%, oklch(0.28 0.14 290 / 0.50), transparent 60%),
          radial-gradient(ellipse 40% 40% at 10% 90%, oklch(0.22 0.10 295 / 0.30), transparent 55%),
          linear-gradient(175deg, oklch(0.10 0.018 285) 0%, oklch(0.13 0.022 285) 100%)
        `,
        paddingTop: "80px",   /* altura da nav (48px) + 32px de respiro */
        paddingBottom: "80px",
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Dot grid sutil */}
      <div className="pointer-events-none absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0)",
        backgroundSize: "36px 36px",
      }} />

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
        {/* Layout 2 colunas no desktop, stack no mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] xl:grid-cols-[1fr_500px] gap-10 lg:gap-14 items-center min-h-0">

          {/* ── Coluna esquerda: conteúdo ── */}
          <div className="flex flex-col gap-6 self-center min-w-0">
            {/* Badge */}
            <div
              style={{
                opacity: 0,
                transform: "translateY(20px)",
                animation: "fadeUp 600ms ease 100ms forwards",
              }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium"
                style={{ borderColor: C.border, color: C.muted, backgroundColor: "rgba(255,255,255,0.04)" }}>
                <Sparkles className="h-3 w-3" style={{ color: C.primary }} />
                Plano Estratégico de Crescimento · {format(new Date(), "MMMM yyyy", { locale: ptBR })}
              </div>
            </div>

            {/* Headline */}
            <div
              style={{
                opacity: 0,
                transform: "translateY(24px)",
                animation: "fadeUp 700ms ease 200ms forwards",
              }}
            >
              <h1
                className="text-4xl font-bold leading-[1.04] sm:text-5xl xl:text-6xl"
                style={{
                  fontFamily: "'Space Grotesk','Inter',sans-serif",
                  letterSpacing: "-0.025em",
                  color: C.text,
                }}
              >
                {data.hero_title || data.title}
              </h1>
            </div>

            {/* Subtítulo */}
            {(data.hero_subtitle || data.hero_message) && (
              <div
                style={{
                  opacity: 0,
                  transform: "translateY(20px)",
                  animation: "fadeUp 700ms ease 320ms forwards",
                }}
              >
                {data.hero_subtitle && (
                  <p className="text-lg leading-relaxed max-w-xl" style={{ color: C.muted }}>
                    {data.hero_subtitle}
                  </p>
                )}
                {data.hero_message && (
                  <p className="text-sm mt-2 opacity-70 max-w-lg" style={{ color: C.muted }}>
                    {data.hero_message}
                  </p>
                )}
              </div>
            )}

            {/* CTAs */}
            {!approved && (
              <div
                className="flex flex-wrap gap-3"
                style={{
                  opacity: 0,
                  transform: "translateY(18px)",
                  animation: "fadeUp 700ms ease 440ms forwards",
                }}
              >
                <button
                  onClick={onApprove}
                  className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 hover:-translate-y-0.5"
                  style={{ backgroundColor: data.hero_cta_color || C.primaryDim }}>
                  {data.hero_cta_text || "Iniciar Projeto"}
                  <ArrowRight className="h-4 w-4" />
                </button>
                {data.hero_whatsapp_number && (
                  <button
                    onClick={onWhatsApp}
                    className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:opacity-80"
                    style={{ borderColor: C.border, color: C.text, backgroundColor: "rgba(255,255,255,0.05)" }}>
                    <MessageCircle className="h-4 w-4 text-green-400" />
                    {data.hero_whatsapp_text || "WhatsApp"}
                  </button>
                )}
              </div>
            )}

            {/* Meta cards (cliente, data) */}
            <div
              className="flex flex-wrap gap-2"
              style={{
                opacity: 0,
                transform: "translateY(14px)",
                animation: "fadeUp 700ms ease 560ms forwards",
              }}
            >
              {[
                { label: "Preparado para", value: data.client_name },
                { label: "Consultor",      value: "Agência C8" },
                { label: "Data",           value: format(new Date(), "dd/MM/yyyy") },
                { label: "Leitura",        value: "~20 min" },
              ].map((m, i) => (
                <div
                  key={i}
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: C.border, backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <p className="text-sm uppercase tracking-[0.18em] font-medium" style={{ color: C.dimmed }}>{m.label}</p>
                  <p className="text-base font-bold" style={{ color: C.text }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Scroll cue */}
            <div
              className="flex items-center gap-2"
              style={{
                opacity: 0,
                animation: "fadeUp 700ms ease 680ms forwards",
              }}
            >
              <ChevronDown
                className="h-4 w-4"
                style={{ color: C.primary, animation: "bounce 2s infinite" }}
              />
              <span style={{ color: C.dimmed, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Percorra o plano estratégico
              </span>
            </div>
          </div>

          {/* ── Coluna direita: painel ilustrativo ── */}
          <div className="w-full">
            <HeroIlustrative clientName={data.client_name} />
          </div>
        </div>

        {/* Vídeo ou imagem embaixo (width total) */}
        {data.hero_video_url && (
          <div
            className="mt-12 rounded-2xl overflow-hidden border shadow-2xl"
            style={{ borderColor: C.border }}
          >
            <iframe src={data.hero_video_url} className="w-full aspect-video" allowFullScreen title="Vídeo" />
          </div>
        )}
        {data.hero_image_url && !data.hero_video_url && (
          <div
            className="mt-12 rounded-2xl overflow-hidden border shadow-2xl"
            style={{ borderColor: C.border }}
          >
            <img src={data.hero_image_url} alt="" className="w-full object-cover" />
          </div>
        )}
      </div>

      {/* CSS keyframes inline (sem framer-motion) */}
      <style>{`
        @keyframes fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

// ─── Seção: Investimento ──────────────────────────────────────────────────────

function SecaoInvestimento({ data, services, onApprove, onWhatsApp }: {
  data: ProposalData;
  services: ProposalService[];
  onApprove: () => void;
  onWhatsApp: () => void;
}) {
  const cfg   = data.schedule ? { mode: "mensal" as const, ...data.schedule } : null;
  const rows  = cfg ? generateScheduleFromConfig(cfg, data.plan_value) : [];
  const mode  = cfg ? (MODE_LABELS[cfg.mode] ?? "") : "";
  const pay   = cfg?.paymentMethod ? (PAYMENT_METHOD_LABELS[cfg.paymentMethod] ?? "") : "";
  const total = services.filter(s => !s.is_bonus).reduce((s, v) => s + v.value, 0);
  const disc  = total > 0 && data.plan_value < total ? total - data.plan_value : 0;

  const LINE_COLOR: Record<string, string> = {
    setup: "oklch(0.72 0.18 55)", entrada: C.primary, unico: C.green, conclusao: "oklch(0.65 0.16 250)", mensalidade: C.text,
  };

  return (
    <SectionWrapper id="sec-investimento" alt>
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <InViewFade direction="up">
          <SectionHeader kicker="Investimento" title="Formalização do projeto" sub="Tudo que está incluso, condições e cronograma." />
        </InViewFade>

        {/* Big number */}
        <InViewFade direction="up" delay={100}>
          <div className="relative rounded-2xl border overflow-hidden mb-6 p-8 text-center"
            style={{
              borderColor: C.borderActive,
              background: `linear-gradient(135deg, oklch(0.20 0.07 290), oklch(0.16 0.025 285))`,
              boxShadow: `0 24px 60px -20px oklch(0.62 0.24 295 / 0.45)`,
            }}>
            <div className="pointer-events-none absolute inset-0 opacity-10" style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }} />
            <div className="relative">
              <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ color: "oklch(0.72 0.18 295)" }}>Investimento total</p>
              <p className="text-6xl font-bold mb-2"
                style={{ fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "-0.03em", color: C.text }}>
                <AnimatedCounter value={data.plan_value} prefix="R$ " separator="." decimalSep="," decimals={2} />
              </p>
              {mode && <p className="text-base" style={{ color: C.muted }}>{mode}</p>}
              {pay && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                  style={{ borderColor: C.border, color: C.muted, backgroundColor: "rgba(255,255,255,0.05)" }}>
                  💳 {pay}
                </span>
              )}
              {disc > 0 && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: C.greenBg, color: C.green }}
                  // @ts-expect-error - C.greenBg defined in PlanSections
                  >
                  Você economiza {fmtCurrency(disc)} vs. contratação individual
                </div>
              )}
            </div>
          </div>
        </InViewFade>

        {/* Cronograma */}
        {rows.length > 0 && (
          <InViewFade direction="up" delay={200}>
            <div className="rounded-2xl border overflow-hidden mb-6" style={{ borderColor: C.border }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: C.border, backgroundColor: C.bgCard }}>
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Cronograma de pagamento</p>
              </div>
              <div className="divide-y" style={{ borderColor: C.border }}>
                {rows.map((row) => (
                  <div key={row.installment} className="flex items-center justify-between px-6 py-3.5"
                    style={{ backgroundColor: row.type !== "mensalidade" ? `${LINE_COLOR[row.type]}10` : "transparent" }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs w-6 text-center font-bold shrink-0" style={{ color: C.dimmed }}>{row.installment}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: C.dimmed }} />
                        <span className="text-base truncate" style={{ color: C.muted }}>
                          {row.label}{row.isRecurring && <span className="ml-1 text-xs" style={{ color: C.dimmed }}>(em diante)</span>}
                        </span>
                      </div>
                      {row.type !== "mensalidade" && (
                        <span className="hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
                          style={{ backgroundColor: `${LINE_COLOR[row.type]}18`, color: LINE_COLOR[row.type] }}>
                          {row.type === "setup" ? "Setup" : row.type === "entrada" ? "Entrada" : row.type === "unico" ? "Único" : "Conclusão"}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-bold text-base"
                        style={{ color: row.type !== "mensalidade" ? LINE_COLOR[row.type] : C.text }}>
                        {row.dueDate === "Na conclusão" ? "A combinar" : fmtCurrency(row.value)}
                      </p>
                      <p className="text-sm" style={{ color: C.dimmed }}>{row.dueDate === "Na conclusão" ? "Na conclusão" : row.dueDate}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 border-t" style={{ borderColor: C.border }}>
                {cfg?.notes && <p className="text-xs mb-1 font-medium" style={{ color: C.muted }}>{cfg.notes}</p>}
                <p className="text-sm" style={{ color: C.dimmed }}>Primeiro pagamento na assinatura.</p>
              </div>
            </div>
          </InViewFade>
        )}

        {/* CTA do investimento */}
        <InViewFade direction="up" delay={260}>
          <div className="flex flex-col sm:flex-row gap-3">
            {data.hero_whatsapp_number && (
              <button onClick={onWhatsApp}
                className="inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:opacity-80"
                style={{ borderColor: C.border, color: C.text, backgroundColor: "rgba(255,255,255,0.05)" }}>
                <MessageCircle className="h-4 w-4 text-green-400" />
                {data.hero_whatsapp_text || "Tirar dúvidas"}
              </button>
            )}
            <button onClick={onApprove}
              className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
              style={{ backgroundColor: data.hero_cta_color || C.primaryDim }}>
              {data.hero_cta_text || "Iniciar Projeto"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </InViewFade>
      </div>
    </SectionWrapper>
  );
}

// ─── Seção: Próximos Passos ───────────────────────────────────────────────────

function SecaoProximosPassos({ ctaColor, onApprove }: { ctaColor: string; onApprove: () => void }) {
  const steps = [
    { step: "Hoje",            desc: "Você aprova o plano e alinhamos o início." },
    { step: "Assinatura",      desc: "Contrato assinado digitalmente." },
    { step: "Kickoff",         desc: "Reunião de alinhamento e onboarding." },
    { step: "Implantação",     desc: "Execução da estratégia conforme o cronograma." },
    { step: "Primeiros dados", desc: "Análise dos primeiros indicadores e ajustes finos." },
    { step: "Crescimento",     desc: "Expansão das ações baseada em resultados reais." },
  ];

  return (
    <SectionWrapper id="sec-proximos">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <InViewFade direction="up">
          <SectionHeader kicker="Próximos Passos" title="O que acontece depois do aceite" center />
        </InViewFade>

        <div className="space-y-0">
          {steps.map((s, i) => (
            <InViewFade key={i} direction="up" delay={i * 70}>
              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: i === 0 ? C.primaryDim : C.accent,
                      border: `1px solid ${i === 0 ? C.primary : C.border}`,
                      color: i === 0 ? "white" : C.primary,
                    }}>
                    {i === 0 ? "✓" : String(i + 1).padStart(2, "0")}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 my-1" style={{ backgroundColor: C.border }} />
                  )}
                </div>
                <div className="pb-6">
                  <p className="text-xl font-bold mb-1" style={{ color: C.text }}>{s.step}</p>
                  <p className="text-base leading-relaxed" style={{ color: C.muted }}>{s.desc}</p>
                </div>
              </div>
            </InViewFade>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── CTA Final ────────────────────────────────────────────────────────────────

function CTAFinal({ data, onApprove, onWhatsApp }: {
  data: ProposalData; onApprove: () => void; onWhatsApp: () => void;
}) {
  return (
    <section id="sec-cta" className="px-6 py-24"
      style={{ borderTop: `1px solid ${C.border}` }}>
      <InViewFade direction="up">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border p-12 text-center sm:p-20"
          style={{
            borderColor: C.borderActive,
            background: `
              radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.28 0.12 290 / 0.55), transparent 70%),
              linear-gradient(135deg, oklch(0.20 0.07 290), oklch(0.155 0.022 285))
            `,
            boxShadow: `0 40px 100px -40px oklch(0.62 0.24 295 / 0.50)`,
          }}>
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }} />
          <div className="relative">
            <InfinityIcon className="mx-auto h-10 w-10 mb-6" style={{ color: C.primary }} strokeWidth={2.5} />
            <h2 className="text-3xl font-bold sm:text-5xl mb-5"
              style={{ fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              Vamos construir um crescimento previsível para a sua empresa?
            </h2>
            <p className="mx-auto max-w-xl mb-10 text-lg" style={{ color: C.muted }}>
              Este plano foi elaborado exclusivamente para você. A próxima decisão é sua.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {data.hero_whatsapp_number && (
                <button onClick={onWhatsApp}
                  className="inline-flex items-center justify-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold transition hover:opacity-80"
                  style={{ borderColor: C.border, color: C.text, backgroundColor: "rgba(255,255,255,0.07)" }}>
                  <MessageCircle className="h-4 w-4 text-green-400" />
                  {data.hero_whatsapp_text || "Falar no WhatsApp"}
                </button>
              )}
              <button onClick={onApprove}
                className="inline-flex items-center justify-center gap-2 rounded-full px-10 py-3.5 text-sm font-bold text-white shadow-xl transition hover:opacity-90 hover:-translate-y-0.5"
                style={{ backgroundColor: data.hero_cta_color || C.primaryDim }}>
                {data.hero_cta_text || "Iniciar Projeto"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </InViewFade>
    </section>
  );
}

// ─── Aprovado ─────────────────────────────────────────────────────────────────

function SecaoAprovado() {
  return (
    <section className="px-6 py-24" style={{ borderTop: `1px solid ${C.border}` }}>
      <InViewFade direction="up">
        <div className="mx-auto max-w-2xl rounded-2xl border p-10 text-center"
          style={{ borderColor: "oklch(0.52 0.17 160 / 0.3)", backgroundColor: "oklch(0.52 0.17 160 / 0.07)" }}>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 mb-5" />
          <h2 className="text-2xl font-bold text-emerald-300 mb-3">Plano aprovado!</h2>
          <p className="text-base" style={{ color: C.muted }}>
            Seu aceite foi registrado com sucesso. Em breve entraremos em contato para alinhar os próximos passos.
          </p>
        </div>
      </InViewFade>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function PlanFooter({ clientName }: { clientName: string }) {
  return (
    <footer className="border-t py-8" style={{ borderColor: C.border }}>
      <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <InfinityIcon className="h-5 w-5 shrink-0" style={{ color: C.primary }} strokeWidth={2.5} />
          <span className="text-xs font-bold tracking-[0.2em]" style={{ color: C.text }}>AGÊNCIA C8</span>
        </div>
        <p className="text-sm text-center" style={{ color: C.dimmed }}>
          Plano elaborado para {clientName} · {format(new Date(), "MMMM yyyy", { locale: ptBR })}
        </p>
        <p className="text-xs" style={{ color: C.dimmed }}>© {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}

// ─── Roteador de seções ───────────────────────────────────────────────────────

function RenderSection({ section, services, planValue }: {
  section: ProposalSection;
  services: ProposalService[];
  planValue: number;
}) {
  const key = section.section_key as SectionKey;

  // Seções com fallback embutido sempre renderizam mesmo sem conteúdo JSON
  const HAS_BUILTIN_FALLBACK: SectionKey[] = ["metodologia"];
  if (!section.content?.trim() && !HAS_BUILTIN_FALLBACK.includes(key)) return null;
  switch (key) {
    case "apresentacao":        return <SecaoApresentacao section={section} />;
    case "diagnostico":         return <SecaoDiagnostico section={section} />;
    case "objetivos":           return <SecaoObjetivos section={section} />;
    case "estrategia":          return <SecaoEstrategia section={section} />;
    case "solucao":             return <SecaoSolucao section={section} />;
    case "escopo":              return <SecaoEscopo section={section} services={services} planValue={planValue} />;
    case "metodologia":         return <SecaoMetodologia section={section} />;
    case "diferenciais":        return <SecaoDisferenciais section={section} />;
    case "garantias":           return <SecaoGarantias section={section} />;
    case "cases":               return <SecaoCases section={section} />;
    case "depoimentos":         return <SecaoDepoimentos section={section} />;
    case "faq":                 return <SecaoFAQ section={section} />;
    case "consideracoes_finais":return <ProseFallback section={section} />;
    default:                    return <ProseFallback section={section} />;
  }
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PropostaViewerPage() {
  const { slug }          = useParams<{ slug: string }>();
  const [data, setData]   = useState<ProposalData | null>(null);
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [services, setServices] = useState<ProposalService[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [aceiteOpen, setAceiteOpen] = useState(false);
  const [approved, setApproved]     = useState(false);
  const scrolledHalf = useRef(false);
  const scrolledFull = useRef(false);

  // Carregamento
  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }
    (async () => {
      try {
        const { data: rpcData, error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc("get_proposal_by_slug", { p_slug: slug });

        if (error || !rpcData || (rpcData as unknown[]).length === 0) { setNotFound(true); return; }
        const prop = (rpcData as ProposalData[])[0];
        if (!["enviada", "visualizada", "aprovada"].includes(prop.status)) { setNotFound(true); return; }
        setData(prop);
        if (prop.status === "aprovada") setApproved(true);

        const [secRes, svcRes] = await Promise.all([
          (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => { order: (c: string) => Promise<{ data: unknown }> } } } } }).from("proposal_sections").select("*").eq("proposal_id", prop.proposal_id).eq("is_visible", true).order("section_order"),
          (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (a: string, b: unknown) => { order: (c: string) => Promise<{ data: unknown }> } } } }).from("proposal_services").select("*").eq("proposal_id", prop.proposal_id).order("sort_order"),
        ]);
        setSections(((secRes as { data: unknown }).data ?? []) as ProposalSection[]);
        setServices(((svcRes as { data: unknown }).data ?? []) as ProposalService[]);
        await trackEvent("load", slug);
      } catch { setNotFound(true); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  // Scroll tracking
  useEffect(() => {
    if (!data || !slug) return;
    const onScroll = () => {
      const p = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
      if (!scrolledHalf.current && p >= 0.5) { scrolledHalf.current = true; trackEvent("scroll_50", slug); }
      if (!scrolledFull.current && p >= 0.9) { scrolledFull.current = true; trackEvent("scroll_90", slug); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [data, slug]);

  const handleWhatsApp = () => {
    if (!data?.hero_whatsapp_number || !slug) return;
    trackEvent("click_whatsapp", slug);
    const msg = `Olá! Vi o plano estratégico "${data.title}" e gostaria de conversar.`;
    window.open(`https://wa.me/${data.hero_whatsapp_number.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleApprove = () => {
    if (!slug) return;
    trackEvent("click_aprovar", slug);
    setAceiteOpen(true);
  };

  // Monta steps do roadmap com base nas seções visíveis + hero + investimento + próximos passos
  const roadmapSteps: RoadmapStep[] = [
    { id: "sec-hero", label: "Visão Geral", phase: "00" },
    ...sections
      .filter(s => SECTION_ROADMAP[s.section_key as SectionKey])
      .map(s => {
        const rm = SECTION_ROADMAP[s.section_key as SectionKey]!;
        return { id: `sec-${s.section_key}`, label: rm.label, phase: rm.phase };
      }),
    { id: "sec-investimento", label: "Investimento", phase: String(sections.length + 1).padStart(2, "0") },
    { id: "sec-proximos",     label: "Próximos Passos", phase: String(sections.length + 2).padStart(2, "0") },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent"
          style={{ borderColor: `${C.primary} transparent transparent transparent` }} />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: C.bg, color: C.text }}>
        <div className="text-center">
          <InfinityIcon className="h-12 w-12 mx-auto mb-6" style={{ color: C.primary }} strokeWidth={2.5} />
          <h1 className="text-2xl font-bold mb-3">Plano não disponível</h1>
          <p className="text-base" style={{ color: C.muted }}>Este link não está mais ativo ou expirou.</p>
        </div>
      </div>
    );
  }

  const proposalSnapshot: Record<string, unknown> = {
    proposal_id: data.proposal_id, title: data.title,
    plan_value: data.plan_value, client_name: data.client_name,
    captured_at: new Date().toISOString(),
  };

  const hasEscopoSection = sections.some(s => s.section_key === "escopo");

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* Roadmap nav */}
      <RoadmapNav
        steps={roadmapSteps}
        logoUrl={data.hero_logo_url}
        ctaText={data.hero_cta_text || "Iniciar Projeto"}
        ctaColor={data.hero_cta_color || C.primaryDim}
        approved={approved}
        onApprove={handleApprove}
      />

      {/* Conteúdo sem offset lateral — nav é horizontal no topo */}
      <div>

        {/* Hero */}
        <PlanHero data={data} onApprove={handleApprove} onWhatsApp={handleWhatsApp} approved={approved} />

        {/* Seções dinâmicas */}
        {sections.map(sec => (
          <RenderSection key={sec.id} section={sec} services={services} planValue={data.plan_value} />
        ))}

        {/* Escopo fallback (se não houver seção dedicada) */}
        {!hasEscopoSection && services.length > 0 && (
          <SecaoEscopo services={services} planValue={data.plan_value} />
        )}

        {/* Projeções */}
        {data.projecoes && <ProjecaoChart projecoes={data.projecoes} />}

        {/* Investimento */}
        {!approved && (
          <SecaoInvestimento data={data} services={services} onApprove={handleApprove} onWhatsApp={handleWhatsApp} />
        )}

        {/* Próximos passos */}
        <SecaoProximosPassos ctaColor={data.hero_cta_color || C.primaryDim} onApprove={handleApprove} />

        {/* CTA Final ou confirmação */}
        {!approved
          ? <CTAFinal data={data} onApprove={handleApprove} onWhatsApp={handleWhatsApp} />
          : <SecaoAprovado />
        }

        {/* Footer */}
        <PlanFooter clientName={data.client_name} />
      </div>

      {/* WhatsApp flutuante */}
      {data.hero_whatsapp_number && !approved && (
        <button onClick={handleWhatsApp}
          className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full shadow-2xl transition hover:scale-110"
          style={{ backgroundColor: "#25D366" }} aria-label="WhatsApp">
          <MessageCircle className="h-7 w-7 text-white" strokeWidth={2} />
        </button>
      )}

      {/* Sticky CTA mobile (só quando não aprovado) */}
      {!approved && (
        <div className="xl:hidden fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="pointer-events-auto">
            <button onClick={handleApprove}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white shadow-2xl transition hover:opacity-90"
              style={{
                backgroundColor: data.hero_cta_color || C.primaryDim,
                boxShadow: `0 16px 48px -12px ${data.hero_cta_color || C.primaryDim}99`,
              }}>
              {data.hero_cta_text || "Iniciar Projeto"}
            </button>
          </div>
        </div>
      )}

      {/* Modal de aceite */}
      {aceiteOpen && slug && (
        <PropostaAceiteModal
          open={aceiteOpen} slug={slug} proposalSnapshot={proposalSnapshot}
          onAccepted={() => { setAceiteOpen(false); setApproved(true); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}
          onClose={() => setAceiteOpen(false)}
        />
      )}
    </div>
  );
}

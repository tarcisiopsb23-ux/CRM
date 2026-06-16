import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Clock,
  Infinity as InfinityIcon,
  Sparkles,
  Gift,
  TrendingUp,
  Shield,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type {
  ProposalSection,
  ProposalService,
  ScheduleConfig,
} from "@/types/proposals";
import { PropostaAceiteModal } from "@/components/propostas/PropostaAceiteModal";
import { generateSchedule } from "@/lib/financialSchedule";

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
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TRACK_URL = `${SUPABASE_URL}/functions/v1/proposal-track-event`;

function getSessionId(): string {
  let sid = sessionStorage.getItem("proposal_session_id");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("proposal_session_id", sid);
  }
  return sid;
}

async function trackEvent(
  action: string,
  slug: string,
  extra?: Record<string, unknown>
) {
  try {
    await fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        slug,
        session_id: getSessionId(),
        user_agent: navigator.userAgent,
        ...extra,
      }),
    });
  } catch {
    /* silent */
  }
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v
  );

export default function PropostaViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ProposalData | null>(null);
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [services, setServices] = useState<ProposalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [aceiteOpen, setAceiteOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const scrolledHalf = useRef(false);
  const scrolledFull = useRef(false);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: rpcData, error } = await (supabase as any).rpc(
          "get_proposal_by_slug",
          { p_slug: slug }
        );
        if (error || !rpcData || rpcData.length === 0) {
          setNotFound(true);
          return;
        }
        const prop = rpcData[0] as ProposalData;
        if (!["enviada", "visualizada", "aprovada"].includes(prop.status)) {
          setNotFound(true);
          return;
        }
        setData(prop);
        if (prop.status === "aprovada") setApproved(true);

        const [secRes, svcRes] = await Promise.all([
          (supabase as any)
            .from("proposal_sections")
            .select("*")
            .eq("proposal_id", prop.proposal_id)
            .eq("is_visible", true)
            .order("section_order"),
          (supabase as any)
            .from("proposal_services")
            .select("*")
            .eq("proposal_id", prop.proposal_id)
            .order("sort_order"),
        ]);
        setSections((secRes.data ?? []) as ProposalSection[]);
        setServices((svcRes.data ?? []) as ProposalService[]);
        await trackEvent("load", slug);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!data || !slug) return;
    const onScroll = () => {
      const scrolled =
        (window.scrollY + window.innerHeight) / document.body.scrollHeight;
      if (!scrolledHalf.current && scrolled >= 0.5) {
        scrolledHalf.current = true;
        trackEvent("scroll_50", slug);
      }
      if (!scrolledFull.current && scrolled >= 0.9) {
        scrolledFull.current = true;
        trackEvent("scroll_90", slug);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [data, slug]);

  const bgMain = "bg-[oklch(0.14_0.02_285)]";
  const textMain = "text-[oklch(0.98_0.005_270)]";
  const textMuted = "text-[oklch(0.7_0.02_280)]";

  if (loading)
    return (
      <div
        className={`min-h-screen ${bgMain} flex items-center justify-center`}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );

  if (notFound || !data)
    return (
      <div
        className={`min-h-screen ${bgMain} ${textMain} flex items-center justify-center px-6`}
      >
        <div className="text-center">
          <InfinityIcon
            className="h-12 w-12 text-violet-400 mx-auto mb-6"
            strokeWidth={2.5}
          />
          <h1 className="text-2xl font-bold mb-2">Proposta não disponível</h1>
          <p className={textMuted}>
            Esta proposta não está mais disponível.
          </p>
        </div>
      </div>
    );

  const regularServices = services.filter((s) => !s.is_bonus);
  const bonusServices = services.filter((s) => s.is_bonus);
  const totalIndividual = services.reduce((sum, s) => sum + s.value, 0);
  const savings = totalIndividual - data.plan_value;
  const savingsPercent =
    totalIndividual > 0 ? (savings / totalIndividual) * 100 : 0;
  const scheduleRows =
    data.schedule && data.schedule.firstValue > 0
      ? generateSchedule({
          firstValue: data.schedule.firstValue,
          firstDate: data.schedule.firstDate,
          recurrence: data.schedule.recurrence,
          installments: data.schedule.installments,
          adjustments: data.schedule.adjustments,
        })
      : [];

  const handleWhatsApp = () => {
    if (!data.hero_whatsapp_number || !slug) return;
    trackEvent("click_whatsapp", slug);
    const msg = `Olá! Vim pela proposta ${data.title}.`;
    window.open(
      `https://wa.me/${data.hero_whatsapp_number.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  const handleApproveClick = () => {
    if (!slug) return;
    trackEvent("click_aprovar", slug);
    setAceiteOpen(true);
  };

  return (
    <div
      className={`min-h-screen ${bgMain} ${textMain}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Nav ── */}
      <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-[oklch(0.14_0.02_285)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            {data.hero_logo_url ? (
              <img
                src={data.hero_logo_url}
                alt="Logo"
                className="h-8 object-contain"
              />
            ) : (
              <>
                <InfinityIcon
                  className="h-6 w-6 text-violet-400"
                  strokeWidth={2.5}
                />
                <span className="text-sm font-bold tracking-[0.2em]">
                  AGÊNCIA C8
                </span>
              </>
            )}
          </div>
          {!approved && (
            <button
              onClick={handleApproveClick}
              className="hidden sm:inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
              style={{ backgroundColor: data.hero_cta_color || "#7c3aed" }}
            >
              {data.hero_cta_text || "Aprovar Proposta"}
            </button>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden pt-32 pb-24"
        style={{
          background:
            "radial-gradient(ellipse at top, oklch(0.25 0.12 290 / 0.6), transparent 60%), linear-gradient(180deg, oklch(0.12 0.02 285), oklch(0.16 0.03 285))",
        }}
      >
        {/* dot grid */}
        <div
          className="absolute inset-0 -z-10 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div
            className={`mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium ${textMuted} backdrop-blur`}
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            Proposta Comercial ·{" "}
            {format(new Date(), "MMMM yyyy", { locale: ptBR })}
          </div>

          <h1
            className="text-balance text-4xl font-bold leading-[1.05] sm:text-6xl"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            {data.hero_title || data.title}
          </h1>

          {data.hero_subtitle && (
            <p
              className={`mx-auto mt-6 max-w-2xl text-balance text-base sm:text-lg ${textMuted}`}
            >
              {data.hero_subtitle}
            </p>
          )}
          {data.hero_message && (
            <p
              className={`mx-auto mt-4 max-w-2xl text-balance text-sm ${textMuted} opacity-75`}
            >
              {data.hero_message}
            </p>
          )}

          <div className="mt-10 inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-widest text-[oklch(0.7_0.02_280)]">
                Proposto a
              </p>
              <p className="text-lg font-semibold">{data.client_name}</p>
            </div>
          </div>

          {data.hero_video_url && (
            <div className="mt-10 mx-auto max-w-2xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <iframe
                src={data.hero_video_url}
                className="w-full aspect-video"
                allowFullScreen
                title="Vídeo da proposta"
              />
            </div>
          )}
          {data.hero_image_url && !data.hero_video_url && (
            <div className="mt-10 mx-auto max-w-2xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <img
                src={data.hero_image_url}
                alt="Imagem de destaque"
                className="w-full object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Sections (rich-text content blocks) ── */}
      {sections.map((sec) => (
        <section key={sec.id} className="py-20 border-t border-white/5">
          <div className="mx-auto max-w-4xl px-6">
            <div className="mb-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-3">
                {sec.title}
              </p>
            </div>
            <div
              className={`prose prose-invert max-w-none ${textMuted}`}
              dangerouslySetInnerHTML={{
                __html: sec.content.replace(/\n/g, "<br/>"),
              }}
            />
          </div>
        </section>
      ))}

      {/* ── Services + Value Comparison ── */}
      {services.length > 0 && (
        <section className="py-20 bg-white/[0.02]">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-3">
                O que está incluso
              </p>
              <h2
                className="text-3xl font-bold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Serviços e bonificações
              </h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              {/* Services list */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-violet-400" />
                  Serviços inclusos
                </h3>
                <div className="space-y-3">
                  {regularServices.map((svc, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-2 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-violet-400 shrink-0" />
                        <span className="text-sm">{svc.name}</span>
                      </div>
                      <span className={`text-sm font-semibold ${textMuted}`}>
                        {fmtCurrency(svc.value)}
                      </span>
                    </div>
                  ))}
                </div>

                {bonusServices.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <h4 className="text-sm font-bold mb-4 flex items-center gap-2 text-amber-400">
                      <Gift className="h-4 w-4" /> Bônus exclusivos
                    </h4>
                    <div className="space-y-3">
                      {bonusServices.map((svc, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-center py-2"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-amber-400">🎁</span>
                            <span className="text-sm text-amber-300">
                              {svc.name}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="line-through text-[oklch(0.5_0.02_280)] text-xs mr-2">
                              {fmtCurrency(svc.value)}
                            </span>
                            <span className="text-sm font-bold text-emerald-400">
                              R$ 0,00
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Value comparison card */}
              <div className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-[oklch(0.22_0.06_290)] to-[oklch(0.18_0.03_285)] p-8 shadow-[0_20px_60px_-20px_oklch(0.62_0.24_295_/_0.55)]">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative">
                  <TrendingUp className="h-8 w-8 text-violet-400 mb-4" />
                  <h3 className="text-lg font-bold mb-6">
                    Comparativo de valor
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className={textMuted}>Valor individual:</span>
                      <span className="line-through text-[oklch(0.5_0.02_280)]">
                        {fmtCurrency(totalIndividual)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-lg">
                      <span>Valor do plano:</span>
                      <span className="text-violet-300">
                        {fmtCurrency(data.plan_value)}
                      </span>
                    </div>
                  </div>
                  {savings > 0 && (
                    <div className="mt-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
                      <p className="text-xs text-emerald-400 font-medium uppercase tracking-widest mb-1">
                        Você economiza
                      </p>
                      <p className="text-3xl font-bold text-emerald-400">
                        {fmtCurrency(savings)}
                      </p>
                      <p className="text-sm text-emerald-500 mt-1">
                        {savingsPercent.toFixed(0)}% de economia
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Financial Schedule ── */}
      {scheduleRows.length > 0 && (
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-3">
                Investimento
              </p>
              <h2
                className="text-3xl font-bold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Cronograma financeiro
              </h2>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="divide-y divide-white/5">
                {scheduleRows.map((row) => (
                  <div
                    key={row.installment}
                    className={`flex items-center justify-between px-6 py-4 ${
                      row.installment === scheduleRows.length
                        ? "bg-violet-500/10"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-[oklch(0.5_0.02_280)] w-8">
                        {row.installment}
                      </span>
                      <div
                        className={`flex items-center gap-2 ${textMuted}`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span className="text-sm">{row.monthRef}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-lg font-bold ${
                          row.installment === scheduleRows.length
                            ? "text-violet-300"
                            : ""
                        }`}
                      >
                        {fmtCurrency(row.value)}
                      </span>
                      <p className="text-xs text-[oklch(0.5_0.02_280)]">
                        {row.dueDate}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 border-t border-white/5 text-xs text-[oklch(0.5_0.02_280)]">
                Primeiro pagamento no ato da contratação. Demais pagamentos na
                data selecionada.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── CTA — only when not yet approved ── */}
      {!approved && (
        <section className="px-6 pb-24">
          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-violet-500/30 bg-gradient-to-br from-[oklch(0.22_0.10_290)] via-[oklch(0.18_0.03_285)] to-[oklch(0.14_0.02_285)] p-10 text-center shadow-[0_20px_60px_-20px_oklch(0.62_0.24_295_/_0.55)] sm:p-14">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            <div className="relative">
              <Shield className="mx-auto h-10 w-10 text-violet-400 mb-4" />
              <h2
                className="text-2xl font-bold sm:text-4xl mb-4"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Pronto para começar?
              </h2>
              <p className={`${textMuted} mb-8`}>
                Aprove esta proposta com um clique e dê o primeiro passo.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {data.hero_whatsapp_number && (
                  <button
                    onClick={handleWhatsApp}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10 transition"
                  >
                    <MessageCircle className="h-4 w-4 text-green-400" />
                    {data.hero_whatsapp_text || "Falar no WhatsApp"}
                  </button>
                )}
                <button
                  onClick={handleApproveClick}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 shadow-lg"
                  style={{ backgroundColor: data.hero_cta_color || "#7c3aed" }}
                >
                  {data.hero_cta_text || "Aprovar Proposta"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Approved confirmation state ── */}
      {approved && (
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-emerald-500/30 bg-emerald-500/10 p-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 mb-4" />
            <h2 className="text-2xl font-bold text-emerald-300 mb-2">
              Proposta aprovada!
            </h2>
            <p className={textMuted}>
              Sua aprovação foi registrada. Em breve entraremos em contato.
            </p>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <InfinityIcon
              className="h-5 w-5 text-violet-400"
              strokeWidth={2.5}
            />
            <span className="text-xs font-bold tracking-[0.2em] text-[oklch(0.5_0.02_280)]">
              AGÊNCIA C8
            </span>
          </div>
          <p className="text-xs text-[oklch(0.4_0.02_280)]">
            Proposta comercial · {data.client_name}
          </p>
        </div>
      </footer>

      {/* ── Aceite modal ── */}
      {aceiteOpen && (
        <PropostaAceiteModal
          open={aceiteOpen}
          slug={slug!}
          proposalSnapshot={{
            proposal_id: data.proposal_id,
            title: data.title,
            services: services.map((s) => ({
              name: s.name,
              value: s.value,
              is_bonus: s.is_bonus,
            })),
            plan_value: data.plan_value,
          }}
          onAccepted={() => {
            setApproved(true);
            setAceiteOpen(false);
          }}
          onClose={() => setAceiteOpen(false)}
        />
      )}
    </div>
  );
}

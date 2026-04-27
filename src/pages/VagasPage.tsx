import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, MapPin, Briefcase, DollarSign, Zap, Target, Users, TrendingUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { JobOpening, LocationType } from "@/types/recruitment";
import { TalentPoolForm } from "@/components/recruitment/TalentPoolForm";

const ENV_ORG_ID = (import.meta.env.VITE_PUBLIC_ORG_ID as string | undefined)?.trim() || null;

const LOCATION_LABELS: Record<LocationType, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  bg:       "#080808",
  surface:  "#0f0f0f",
  card:     "#141414",
  border:   "#1c1c1c",
  orange:   "#7c3aed",   // violet-700
  orangeD:  "#6d28d9",   // violet-800 (hover)
  white:    "#ffffff",
  gray1:    "#e5e7eb",
  gray2:    "#9ca3af",
  gray3:    "#4b5563",
  gray4:    "#1f2937",
};

// ── Componentes internos ──────────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
      style={{ backgroundColor: `${C.orange}18`, color: C.orange, border: `1px solid ${C.orange}30` }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: C.orange }}>
      {children}
    </p>
  );
}

function JobCard({ job }: { job: JobOpening }) {
  const navigate = useNavigate();
  return (
    <div
      className="group relative rounded-2xl p-6 flex flex-col gap-5 cursor-pointer transition-all duration-300"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
      }}
      onClick={() => navigate(`/${job.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/${job.id}`)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${C.orange}60`;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${C.orange}15`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = C.border;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Glow top */}
      <div
        className="absolute top-0 left-0 right-0 h-px rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${C.orange}80, transparent)` }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-tight" style={{ color: C.white }}>
            {job.title}
          </h3>
          {job.job_title && (
            <p className="text-sm mt-1" style={{ color: C.gray2 }}>{job.job_title}</p>
          )}
        </div>
        <div
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${C.orange}15`, color: C.orange }}
        >
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>

      {job.description && (
        <p className="text-sm leading-relaxed line-clamp-2" style={{ color: C.gray2 }}>
          {job.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {job.department && (
          <span
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: C.surface, color: C.gray2, border: `1px solid ${C.border}` }}
          >
            <Briefcase className="h-3 w-3" /> {job.department}
          </span>
        )}
        {job.location_type && (
          <span
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: C.surface, color: C.gray2, border: `1px solid ${C.border}` }}
          >
            <MapPin className="h-3 w-3" /> {LOCATION_LABELS[job.location_type]}
          </span>
        )}
        {job.salary_range && (
          <span
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: `${C.orange}10`, color: C.orange, border: `1px solid ${C.orange}25` }}
          >
            <DollarSign className="h-3 w-3" /> {job.salary_range}
          </span>
        )}
      </div>

      <button
        type="button"
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
        style={{ backgroundColor: C.orange, color: C.white }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.orangeD)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.orange)}
        onClick={(e) => { e.stopPropagation(); navigate(`/${job.id}`); }}
      >
        Candidatar-se →
      </button>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function VagasPage() {
  const vagasRef = useRef<HTMLElement>(null);
  const orgId = ENV_ORG_ID;

  const { data: jobs = [], isLoading } = useQuery<JobOpening[]>({
    queryKey: ["vagas_publicas"],
    queryFn: async () => {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_public_job_openings");
      if (!rpcErr && Array.isArray(rpcData)) return rpcData as JobOpening[];

      if (ENV_ORG_ID) {
        const { data, error } = await supabase
          .from("job_openings").select("*")
          .eq("organization_id", ENV_ORG_ID).eq("status", "aberta")
          .order("created_at", { ascending: false });
        if (!error) return (data ?? []) as JobOpening[];
      }

      const { data: allData } = await supabase
        .from("job_openings").select("*").eq("status", "aberta")
        .order("created_at", { ascending: false });
      return (allData ?? []) as JobOpening[];
    },
    staleTime: 30_000,
    retry: 2,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, JobOpening[]>();
    for (const job of jobs) {
      const dept = job.department || "Geral";
      map.set(dept, [...(map.get(dept) ?? []), job]);
    }
    return map;
  }, [jobs]);

  const scrollToVagas = () => vagasRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bg, color: C.white }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{
          backgroundColor: `${C.bg}e0`,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <a href="https://agenciac8.com.br" target="_blank" rel="noreferrer">
          <img src="https://agenciac8.com.br/Logo.webp" alt="C8" className="h-7 w-auto" />
        </a>
        <button
          type="button"
          onClick={scrollToVagas}
          className="text-sm font-medium px-4 py-2 rounded-lg transition-all"
          style={{ backgroundColor: C.orange, color: C.white }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.orangeD)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.orange)}
        >
          Ver vagas
        </button>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-6 py-32 overflow-hidden"
        style={{ minHeight: "92vh" }}
      >
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(${C.white} 1px, transparent 1px), linear-gradient(90deg, ${C.white} 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${C.orange}, transparent 70%)` }}
        />

        <div className="relative z-10 max-w-4xl mx-auto">
          <Pill><Zap className="h-3 w-3" /> Oportunidades abertas</Pill>

          <h1
            className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight"
            style={{ color: C.white }}
          >
            Trabalhar na C8
            <br />
            <span style={{ color: C.orange }}>não é sobre cargo.</span>
            <br />
            É sobre resultado.
          </h1>

          <p className="mt-6 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: C.gray2 }}>
            Se você quer crescer rápido, trabalhar com projetos reais e fazer parte de um time que
            executa de verdade — você está no lugar certo.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={scrollToVagas}
              className="px-8 py-4 rounded-xl font-bold text-base transition-all duration-200 flex items-center gap-2"
              style={{ backgroundColor: C.orange, color: C.white }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.orangeD;
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.orange;
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              Ver vagas abertas <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="https://agenciac8.com.br"
              target="_blank"
              rel="noreferrer"
              className="px-8 py-4 rounded-xl font-medium text-base transition-all duration-200"
              style={{ color: C.gray2, border: `1px solid ${C.border}` }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = C.white;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = C.gray3;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = C.gray2;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border;
              }}
            >
              Conhecer a C8
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <button
          type="button"
          onClick={scrollToVagas}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 hover:opacity-70 transition-opacity"
          style={{ color: C.gray2 }}
        >
          <span className="text-xs tracking-widest uppercase">Rolar</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </button>
      </section>

      {/* ── Números / Prova social ── */}
      <section style={{ backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: "100%", label: "Projetos reais" },
            { value: "Rápido", label: "Crescimento na prática" },
            { value: "Zero", label: "Burocracia inútil" },
            { value: "Direto", label: "Ambiente sem enrolação" },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-3xl font-black" style={{ color: C.orange }}>{item.value}</p>
              <p className="text-sm mt-1" style={{ color: C.gray2 }}>{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sobre a C8 ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <SectionLabel>Sobre a C8</SectionLabel>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight mb-6" style={{ color: C.white }}>
              Estratégia, execução e resultado — todos os dias.
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: C.gray2 }}>
              Somos uma agência focada em crescimento. Aqui, cada projeto tem um objetivo claro,
              cada ação tem um propósito e cada pessoa do time tem autonomia real para entregar.
            </p>
            <p className="text-base leading-relaxed" style={{ color: C.gray2 }}>
              Não existe espaço para tarefa inútil. Se você está aqui, é para gerar resultado.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: TrendingUp, title: "Crescimento rápido", desc: "Na prática, não no papel" },
              { icon: Target, title: "Projetos reais", desc: "Nada de tarefa inútil" },
              { icon: Zap, title: "Autonomia", desc: "Com responsabilidade" },
              { icon: Users, title: "Time direto", desc: "Sem enrolação" },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl p-5"
                style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${C.orange}15`, color: C.orange }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-bold text-sm" style={{ color: C.white }}>{title}</p>
                <p className="text-xs mt-0.5" style={{ color: C.gray2 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── O que esperamos ── */}
      <section style={{ backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 py-24 grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* O que esperamos */}
          <div>
            <SectionLabel>O que esperamos</SectionLabel>
            <h2 className="text-2xl font-black mb-8" style={{ color: C.white }}>
              Quem se encaixa aqui
            </h2>
            <div className="space-y-4">
              {[
                "Compromisso com resultado — não com aparência",
                "Proatividade sem precisar ser cobrado",
                "Organização e disciplina no dia a dia",
                "Vontade real de evoluir constantemente",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${C.orange}20`, color: C.orange }}
                  >
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.gray1 }}>{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quem não se encaixa */}
          <div>
            <SectionLabel>Seja honesto</SectionLabel>
            <h2 className="text-2xl font-black mb-8" style={{ color: C.white }}>
              Essa vaga não é para quem
            </h2>
            <div className="space-y-4">
              {[
                "Quer rotina confortável e sem desafios",
                "Precisa ser cobrado o tempo todo",
                "Não lida bem com pressão e metas",
                "Busca estabilidade acima de crescimento",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: "#ef444415", color: "#ef4444" }}
                  >
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.gray1 }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Processo seletivo ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <SectionLabel>Como funciona</SectionLabel>
          <h2 className="text-3xl font-black" style={{ color: C.white }}>Processo seletivo</h2>
          <p className="mt-3 text-base" style={{ color: C.gray2 }}>Simples, direto e rápido.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { step: "01", label: "Inscrição", desc: "Preencha o formulário da vaga" },
            { step: "02", label: "Teste", desc: "Avaliação prática da função" },
            { step: "03", label: "Entrevista", desc: "Conversa direta com o time" },
            { step: "04", label: "Entrada", desc: "Bem-vindo ao time C8" },
          ].map(({ step, label, desc }, i, arr) => (
            <div key={step} className="relative">
              <div
                className="rounded-2xl p-6 h-full"
                style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
              >
                <p className="text-3xl font-black mb-3" style={{ color: `${C.orange}40` }}>{step}</p>
                <p className="font-bold text-sm mb-1" style={{ color: C.white }}>{label}</p>
                <p className="text-xs" style={{ color: C.gray2 }}>{desc}</p>
              </div>
              {i < arr.length - 1 && (
                <div
                  className="hidden sm:block absolute top-1/2 -right-2 w-4 h-px"
                  style={{ backgroundColor: C.border }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Vagas abertas ── */}
      <section
        ref={vagasRef}
        style={{ backgroundColor: C.surface, borderTop: `1px solid ${C.border}` }}
      >
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <SectionLabel>Oportunidades</SectionLabel>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: C.white }}>
              Vagas abertas
            </h2>
            <p className="mt-3 text-base" style={{ color: C.gray2 }}>
              Encontre a posição certa para o seu perfil.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: C.orange }} />
            </div>
          ) : jobs.length === 0 ? (
            <div
              className="rounded-2xl p-16 text-center"
              style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
            >
              <p className="text-xl font-bold mb-2" style={{ color: C.white }}>
                Nenhuma vaga aberta no momento
              </p>
              <p className="text-sm" style={{ color: C.gray2 }}>
                Acompanhe nossas redes sociais para ficar por dentro das próximas oportunidades.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {Array.from(grouped.entries()).map(([dept, deptJobs]) => (
                <div key={dept}>
                  <div className="flex items-center gap-3 mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.orange }}>
                      {dept}
                    </p>
                    <div className="flex-1 h-px" style={{ backgroundColor: C.border }} />
                    <span className="text-xs" style={{ color: C.gray3 }}>
                      {deptJobs.length} vaga{deptJobs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {deptJobs.map((job) => <JobCard key={job.id} job={job} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Banco de Talentos ── */}
      <section className="relative overflow-hidden px-6 py-24">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: `radial-gradient(circle at 50% 0%, ${C.orange}, transparent 60%)` }}
        />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <SectionLabel>Banco de Talentos</SectionLabel>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight mb-4" style={{ color: C.white }}>
              Não encontrou a vaga certa?
              <br />
              <span style={{ color: C.orange }}>Deixe seu perfil conosco.</span>
            </h2>
            <p className="text-base" style={{ color: C.gray2 }}>
              Cadastre-se no nosso banco de talentos. Quando surgir uma oportunidade compatível com o seu perfil, entraremos em contato.
            </p>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
          >
            <TalentPoolForm organizationId={orgId} />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="px-6 py-10 text-center"
        style={{ borderTop: `1px solid ${C.border}`, backgroundColor: C.surface }}
      >
        <img
          src="https://agenciac8.com.br/Logo.webp"
          alt="C8"
          className="h-6 w-auto mx-auto mb-5 opacity-50"
        />
        <div className="flex items-center justify-center gap-6 text-sm mb-4" style={{ color: C.gray3 }}>
          <a href="https://wa.me/5533998737962" target="_blank" rel="noreferrer"
            className="hover:text-white transition-colors">
            WhatsApp
          </a>
          <span>·</span>
          <a href="mailto:contato@agenciac8.com.br"
            className="hover:text-white transition-colors">
            E-mail
          </a>
          <span>·</span>
          <a href="https://agenciac8.com.br" target="_blank" rel="noreferrer"
            className="hover:text-white transition-colors">
            Site
          </a>
        </div>
        <p className="text-xs" style={{ color: C.gray3 }}>
          © {new Date().getFullYear()} Agência C8. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}

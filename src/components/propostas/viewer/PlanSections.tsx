/**
 * PlanSections — todos os componentes de seção do Plano Estratégico de Crescimento.
 * Cada export corresponde a um section_key da tabela proposal_sections.
 * Todos aceitam { section: ProposalSection } e fazem parse JSON do content,
 * com fallback para prose quando o conteúdo não for JSON estruturado.
 */

import { useState, useRef, useEffect } from "react";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight,
  Target, TrendingUp, Zap, BarChart3, Shield,
  Star, Users, Lightbulb, ArrowRight,
  Search, LayoutGrid, Megaphone, Handshake, Heart,
  Map, ClipboardList, CheckCircle,
  BarChart2, FileText, Palette, Code2, Globe, Settings2,
  MapPin, MessageCircle, LineChart, ListChecks, Layers,
  Rocket, RefreshCw, ClipboardCheck, CircleDot,
} from "lucide-react";
import type { ProposalSection } from "@/types/proposals";
import { InViewFade } from "./InViewFade";

// ─── Paleta compartilhada — DARK ─────────────────────────────────────────────
export const C = {
  bg:           "oklch(0.12 0.02 285)",
  bgAlt:        "oklch(0.145 0.022 285)",
  bgCard:       "oklch(0.16 0.025 285)",
  bgCardHover:  "oklch(0.18 0.03 285)",
  primary:      "oklch(0.72 0.22 295)",
  primaryDim:   "oklch(0.62 0.24 295)",
  accent:       "oklch(0.72 0.22 295 / 0.12)",
  text:         "oklch(0.97 0.005 270)",
  muted:        "oklch(0.68 0.02 280)",
  dimmed:       "oklch(0.44 0.02 280)",
  border:       "rgba(255,255,255,0.07)",
  borderActive: "oklch(0.62 0.24 295 / 0.35)",
  red:          "oklch(0.65 0.18 25)",
  redBg:        "oklch(0.65 0.18 25 / 0.08)",
  green:        "oklch(0.72 0.17 160)",
  greenBg:      "oklch(0.72 0.17 160 / 0.08)",
};

// ─── Paleta LIGHT — bloco analítico branco ────────────────────────────────────
export const CL = {
  bg:           "#ffffff",
  bgAlt:        "#f8f7ff",          // lilás muito sutil
  bgCard:       "#ffffff",
  bgCardHover:  "#f3f1ff",
  primary:      "oklch(0.52 0.24 295)",   // violeta mais escuro (contraste no branco)
  primaryDim:   "oklch(0.42 0.22 295)",
  accent:       "oklch(0.52 0.24 295 / 0.10)",
  accentStrong: "oklch(0.52 0.24 295 / 0.18)",
  text:         "#0f0e1a",
  muted:        "#4b4a60",
  dimmed:       "#9e9cb8",
  border:       "rgba(99,88,210,0.12)",
  borderActive: "oklch(0.52 0.24 295 / 0.40)",
  red:          "oklch(0.55 0.20 25)",
  redBg:        "oklch(0.55 0.20 25 / 0.07)",
  green:        "oklch(0.52 0.18 160)",
  greenBg:      "oklch(0.52 0.18 160 / 0.08)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function tryJSON<T>(raw: string, check: (p: unknown) => p is T): T | null {
  try {
    const p = JSON.parse(raw);
    return check(p) ? p : null;
  } catch { return null; }
}

function isArray(x: unknown): x is unknown[] { return Array.isArray(x); }

// ─── SectionWrapper — padding, id âncora, fundo alternado (DARK) ──────────────
export function SectionWrapper({
  id, alt = false, children, className = "",
}: {
  id: string; alt?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <section
      id={id}
      className={`py-20 xl:py-24 ${className}`}
      style={{ backgroundColor: alt ? C.bgAlt : C.bg, borderTop: `1px solid ${C.border}` }}
    >
      {children}
    </section>
  );
}

// ─── LightSectionWrapper — bloco analítico claro ─────────────────────────────
// Usado por: SecaoApresentacao, SecaoDiagnostico, SecaoObjetivos
// Detalhe de identidade: faixa decorativa violeta no topo + padrão pontilhado sutil
export function LightSectionWrapper({
  id, alt = false, children, className = "",
}: {
  id: string; alt?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative py-20 xl:py-24 overflow-hidden ${className}`}
      style={{
        backgroundColor: alt ? CL.bgAlt : CL.bg,
        borderTop: `1px solid ${CL.border}`,
      }}
    >
      {/* Faixa violeta decorativa no topo */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, oklch(0.52 0.24 295) 30%, oklch(0.62 0.24 295) 60%, transparent 100%)`,
        }}
      />
      {/* Padrão de grade sutil no fundo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${CL.border} 1px, transparent 1px),
            linear-gradient(90deg, ${CL.border} 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          opacity: 0.6,
        }}
      />
      {/* Glow violeta suave no canto superior direito */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.52 0.24 295 / 0.06) 0%, transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </section>
  );
}

// ─── SectionHeader — kicker + título + subtítulo ─────────────────────────────
export function SectionHeader({
  kicker, title, sub, center = false,
}: {
  kicker: string; title: string; sub?: string; center?: boolean;
}) {
  return (
    <div className={`mb-10 max-w-3xl ${center ? "mx-auto text-center" : ""}`}>
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em]"
        style={{ color: C.primaryDim }}>
        {kicker}
      </p>
      <h2 className="text-3xl font-bold sm:text-4xl"
        style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
        {title}
      </h2>
      {sub && <p className="mt-3 text-lg leading-relaxed" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}

// ─── Prose fallback ───────────────────────────────────────────────────────────
export function ProseFallback({ section }: { section: ProposalSection }) {
  const hasContent = section.content?.trim().length > 0;

  // Sem conteúdo algum — não renderiza (evita seção completamente vazia)
  if (!hasContent) return null;

  return (
    <SectionWrapper id={`sec-${section.section_key}`}>
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <InViewFade direction="up">
          <SectionHeader kicker={section.title} title={section.title} />
        </InViewFade>
        <InViewFade direction="up" delay={100}>
          <div
            className="prose prose-invert max-w-none text-base leading-relaxed"
            style={{ color: C.muted }}
            dangerouslySetInnerHTML={{ __html: section.content.replace(/\n/g, "<br/>") }}
          />
        </InViewFade>
      </div>
    </SectionWrapper>
  );
}

// ─── SecaoApresentacao — Resumo Executivo ────────────────────────────────────
//
// Formato novo (ResumoExecutivoContent):
//   { contexto, desafios, oportunidades, objetivo_plano }
//   Layout: 2 colunas — esquerda: kicker + título fixo + subtexto
//                        direita: grid 2×2 com os 4 cards
//
// Formato legado (ApresentacaoData):
//   { empresa?, atuacao?, mercado?, vendas?, desafios?: string[], oportunidade? }
//   mantido para propostas já existentes

interface ResumoExecutivoContent {
  contexto: string;
  desafios: string;
  oportunidades: string;
  objetivo_plano: string;
}

function isResumoExecutivo(x: unknown): x is ResumoExecutivoContent {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return "contexto" in o || "objetivo_plano" in o;
}

interface ApresentacaoLegado {
  empresa?: string;
  atuacao?: string;
  mercado?: string;
  vendas?: string;
  desafios?: string[];
  oportunidade?: string;
}

function isApresentacaoLegado(x: unknown): x is ApresentacaoLegado {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return "empresa" in o || "atuacao" in o || "mercado" in o;
}

// Ícones SVG inline para os 4 cards do Resumo (compatíveis com Lucide)
const RESUMO_CARD_ICONS = [
  // Contexto — building/empresa
  <svg key="ctx" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  // Desafios — lightning
  <svg key="chg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  // Oportunidades — heart / crescimento
  <svg key="opp" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 21C12 21 3 14.5 3 8.5a5.5 5.5 0 0 1 9-4.2A5.5 5.5 0 0 1 21 8.5c0 6-9 12.5-9 12.5z"/></svg>,
  // Objetivo do plano — target
  <svg key="obj" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
];

const RESUMO_CARD_LABELS = ["O contexto", "Principais desafios", "Oportunidades", "Objetivo deste plano"];

export function SecaoApresentacao({ section }: { section: ProposalSection }) {
  // Tenta novo formato primeiro
  const novoFmt = tryJSON(section.content, isResumoExecutivo);
  if (novoFmt) {
    const cards = [
      { label: RESUMO_CARD_LABELS[0], text: novoFmt.contexto,       icon: RESUMO_CARD_ICONS[0] },
      { label: RESUMO_CARD_LABELS[1], text: novoFmt.desafios,       icon: RESUMO_CARD_ICONS[1] },
      { label: RESUMO_CARD_LABELS[2], text: novoFmt.oportunidades,  icon: RESUMO_CARD_ICONS[2] },
      { label: RESUMO_CARD_LABELS[3], text: novoFmt.objetivo_plano, icon: RESUMO_CARD_ICONS[3] },
    ].filter((c) => c.text?.trim());

    return (
      <LightSectionWrapper id="sec-apresentacao">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-14 items-start">

            {/* ── Coluna esquerda: texto fixo ── */}
            <InViewFade direction="up">
              <div>
                <p
                  className="mb-3 text-xs font-bold uppercase tracking-[0.35em]"
                  style={{ color: CL.primaryDim }}
                >
                  02 · Resumo Executivo
                </p>
                <h2
                  className="text-3xl font-bold sm:text-4xl mb-4 leading-tight"
                  style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: CL.text }}
                >
                  Entendemos o seu cenário
                </h2>
                {/* Separador decorativo */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-[2px] w-10 rounded-full" style={{ backgroundColor: CL.primary }} />
                  <div className="h-[2px] w-4 rounded-full" style={{ backgroundColor: CL.border }} />
                </div>
                <p className="text-base leading-relaxed" style={{ color: CL.muted }}>
                  Analisamos sua operação, mercado e comunicação para identificar
                  oportunidades reais de crescimento.
                </p>
              </div>
            </InViewFade>

            {/* ── Coluna direita: 4 cards em grid 2×2 ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cards.map((card, i) => (
                <InViewFade key={i} direction="up" delay={i * 80}>
                  <div
                    className="rounded-2xl p-5 flex flex-col gap-3 h-full transition-shadow duration-200 hover:shadow-md"
                    style={{
                      border: `1px solid ${CL.border}`,
                      backgroundColor: CL.bgCard,
                      boxShadow: "0 1px 4px oklch(0.52 0.24 295 / 0.06)",
                    }}
                  >
                    {/* Ícone com fundo accent */}
                    <div
                      className="grid h-9 w-9 place-items-center rounded-xl shrink-0"
                      style={{ backgroundColor: CL.accent, color: CL.primary }}
                    >
                      {card.icon}
                    </div>
                    <div>
                      <p className="text-sm font-bold mb-1.5" style={{ color: CL.text }}>
                        {card.label}
                      </p>
                      <p className="text-sm leading-relaxed" style={{ color: CL.muted }}>
                        {card.text}
                      </p>
                    </div>
                  </div>
                </InViewFade>
              ))}
            </div>

          </div>
        </div>
      </LightSectionWrapper>
    );
  }

  // Fallback: formato legado { empresa, atuacao, mercado, ... }
  const legado = tryJSON(section.content, isApresentacaoLegado);
  if (legado) {
    const itens = [
      { label: "Empresa",            value: legado.empresa },
      { label: "Como atua",          value: legado.atuacao },
      { label: "Mercado",            value: legado.mercado },
      { label: "Processo comercial", value: legado.vendas },
    ].filter((i) => i.value);

    return (
      <LightSectionWrapper id="sec-apresentacao">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <InViewFade direction="up">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: CL.primaryDim }}>Resumo Executivo</p>
            <h2 className="text-3xl font-bold sm:text-4xl mb-3 leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: CL.text }}>
              Entendemos o seu negócio
            </h2>
            <p className="mb-10 text-base" style={{ color: CL.muted }}>Antes de qualquer recomendação, mergulhamos na realidade da sua empresa.</p>
          </InViewFade>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-10">
            {itens.map((it, i) => (
              <InViewFade key={i} direction="up" delay={i * 80}>
                <div className="rounded-2xl p-5" style={{ border: `1px solid ${CL.border}`, backgroundColor: CL.bgCard }}>
                  <p className="text-xs uppercase tracking-widest mb-2" style={{ color: CL.dimmed }}>{it.label}</p>
                  <p className="text-base leading-relaxed font-medium" style={{ color: CL.text }}>{it.value}</p>
                </div>
              </InViewFade>
            ))}
          </div>
          {legado.desafios && legado.desafios.length > 0 && (
            <InViewFade direction="up" delay={200}>
              <div className="rounded-2xl p-6 mb-6" style={{ border: `1px solid ${CL.border}`, backgroundColor: CL.bgAlt }}>
                <p className="text-xs uppercase tracking-widest mb-4" style={{ color: CL.dimmed }}>Principais desafios identificados</p>
                <ul className="space-y-2.5">
                  {legado.desafios.map((d, i) => (
                    <li key={i} className="flex items-start gap-3 text-base" style={{ color: CL.muted }}>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: CL.primaryDim }} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </InViewFade>
          )}
          {legado.oportunidade && (
            <InViewFade direction="up" delay={280}>
              <div className="rounded-2xl border-l-4 p-6" style={{ borderColor: CL.primary, backgroundColor: CL.accent }}>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: CL.primaryDim }}>Oportunidade central</p>
                <p className="text-lg font-medium" style={{ color: CL.text }}>{legado.oportunidade}</p>
              </div>
            </InViewFade>
          )}
        </div>
      </LightSectionWrapper>
    );
  }

  return <ProseFallback section={section} />;
}

// ─── SecaoDiagnostico ─────────────────────────────────────────────────────────
//
// Formato novo (DiagnosticoContent):
//   { titulo?: string, colunas: [{ problema, impacto, oportunidade }, ...×3] }
//   Layout: 3 colunas horizontais, cada uma com 3 blocos empilhados
//
// Formato legado: [{ problema?, consequencia?, impacto?, oportunidade?, titulo?, descricao? }]
//   mantido para propostas já existentes

interface DiagnosticoColuna {
  problema: string;
  impacto: string;
  oportunidade: string;
}

interface DiagnosticoNovo {
  titulo?: string;
  colunas: DiagnosticoColuna[];
}

function isDiagnosticoNovo(x: unknown): x is DiagnosticoNovo {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return Array.isArray(o.colunas) && (o.colunas as unknown[]).length > 0;
}

interface DiagCard {
  problema?: string;
  consequencia?: string;
  impacto?: string;
  oportunidade?: string;
  titulo?: string;
  descricao?: string;
}

export function SecaoDiagnostico({ section }: { section: ProposalSection }) {
  // Tenta novo formato primeiro
  const novoFmt = tryJSON(section.content, isDiagnosticoNovo);
  if (novoFmt) {
    const colunas = novoFmt.colunas.slice(0, 3);
    const titulo = novoFmt.titulo || "Gargalos que limitam seu crescimento";

    return (
      <LightSectionWrapper id="sec-diagnostico" alt>
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <InViewFade direction="up">
            <div className="mb-10 max-w-3xl">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: CL.primaryDim }}>
                03 · Diagnóstico
              </p>
              <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
                style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: CL.text }}>
                {titulo}
              </h2>
            </div>
          </InViewFade>

          <div className="grid gap-4 sm:grid-cols-3">
            {colunas.map((col, colIdx) => (
              <InViewFade key={colIdx} direction="up" delay={colIdx * 100}>
                <div
                  className="rounded-2xl overflow-hidden flex flex-col"
                  style={{ border: `1px solid ${CL.border}`, boxShadow: "0 1px 4px oklch(0.52 0.24 295 / 0.05)" }}
                >
                  {/* Bloco Problema — vermelho claro */}
                  <div
                    className="p-4 border-b flex items-start gap-2.5"
                    style={{ borderColor: CL.border, backgroundColor: CL.redBg }}
                  >
                    <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CL.red }} />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: CL.red }}>
                        Problema
                      </p>
                      <p className="text-sm leading-snug font-semibold" style={{ color: CL.text }}>
                        {col.problema}
                      </p>
                    </div>
                  </div>

                  {/* Bloco Impacto — neutro */}
                  <div
                    className="p-4 border-b flex items-start gap-2.5"
                    style={{ borderColor: CL.border, backgroundColor: CL.bgCard }}
                  >
                    <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CL.dimmed }} />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: CL.dimmed }}>
                        Impacto
                      </p>
                      <p className="text-sm leading-snug" style={{ color: CL.muted }}>
                        {col.impacto}
                      </p>
                    </div>
                  </div>

                  {/* Bloco Oportunidade — violeta suave */}
                  <div
                    className="p-4 flex items-start gap-2.5 flex-1"
                    style={{ backgroundColor: CL.accent }}
                  >
                    <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CL.primary }} />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.25em] mb-1.5" style={{ color: CL.primaryDim }}>
                        Oportunidade
                      </p>
                      <p className="text-sm leading-snug" style={{ color: CL.muted }}>
                        {col.oportunidade}
                      </p>
                    </div>
                  </div>
                </div>
              </InViewFade>
            ))}
          </div>
        </div>
      </LightSectionWrapper>
    );
  }

  // Fallback: formato legado [{ problema, consequencia, impacto, oportunidade }]
  const legado = tryJSON(section.content, (x): x is DiagCard[] => isArray(x) && x.length > 0);
  if (legado) {
    return (
      <LightSectionWrapper id="sec-diagnostico" alt>
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <InViewFade direction="up">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: CL.primaryDim }}>Diagnóstico</p>
            <h2 className="text-3xl font-bold sm:text-4xl mb-3 leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: CL.text }}>
              O que identificamos no seu cenário
            </h2>
            <p className="mb-10 text-base" style={{ color: CL.muted }}>Cada problema observado é também uma oportunidade de crescimento.</p>
          </InViewFade>
          <div className="grid gap-5 sm:grid-cols-2">
            {legado.map((card, i) => {
              if (card.problema) {
                return (
                  <InViewFade key={i} direction="up" delay={i * 90}>
                    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${CL.border}` }}>
                      <div className="p-5" style={{ backgroundColor: CL.redBg }}>
                        <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: CL.red }}>Problema observado</p>
                        <p className="text-sm font-semibold" style={{ color: CL.text }}>{card.problema}</p>
                      </div>
                      {card.impacto && (
                        <div className="px-5 py-3 border-t" style={{ borderColor: CL.border, backgroundColor: CL.bgCard }}>
                          <p className="text-xs uppercase tracking-[0.2em] mb-1.5" style={{ color: CL.dimmed }}>Impacto</p>
                          <p className="text-xs" style={{ color: CL.muted }}>{card.impacto}</p>
                        </div>
                      )}
                      <div className="p-5 border-t" style={{ borderColor: CL.border, backgroundColor: CL.accent }}>
                        <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: CL.primaryDim }}>Oportunidade</p>
                        <p className="text-sm font-medium" style={{ color: CL.text }}>{card.oportunidade ?? "—"}</p>
                      </div>
                    </div>
                  </InViewFade>
                );
              }
              return (
                <InViewFade key={i} direction="up" delay={i * 90}>
                  <div className="rounded-2xl p-5" style={{ border: `1px solid ${CL.border}`, backgroundColor: CL.bgCard }}>
                    <div className="mb-2 h-1 w-6 rounded-full" style={{ backgroundColor: CL.primary }} />
                    <p className="text-sm font-semibold mb-1" style={{ color: CL.text }}>{card.titulo}</p>
                    {card.descricao && <p className="text-xs leading-relaxed" style={{ color: CL.muted }}>{card.descricao}</p>}
                  </div>
                </InViewFade>
              );
            })}
          </div>
        </div>
      </LightSectionWrapper>
    );
  }

  return <ProseFallback section={section} />;
}

// ─── SecaoObjetivos ───────────────────────────────────────────────────────────
//
// Formato novo (ObjetivosContent):
//   { titulo?: string, cards: [{ titulo, descricao }] }  — 3 a 6 cards
//   Layout responsivo por quantidade:
//     3 → 3 colunas × 1 linha
//     4 → 2 colunas × 2 linhas
//     5 → linha 1: 3 cards (cols-3), linha 2: 2 cards (cols-2, área total)
//     6 → 3 colunas × 2 linhas
//
// Formato legado: [{ icone?, titulo, descricao? }]  — array direto
//   mantido para propostas já existentes

interface ObjetivosNovo {
  titulo?: string;
  cards: Array<{ titulo: string; descricao: string }>;
}

function isObjetivosNovo(x: unknown): x is ObjetivosNovo {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return Array.isArray(o.cards) && (o.cards as unknown[]).length > 0;
}

const OBJ_ICONS = [Target, TrendingUp, Zap, BarChart3, Shield, Users, Lightbulb, Star, Check, ArrowRight];

/** Divide um array em linhas de acordo com a lógica visual */
function buildObjRows(cards: ObjetivosNovo["cards"]): ObjetivosNovo["cards"][] {
  const n = cards.length;
  if (n <= 3) return [cards];                     // 3×1
  if (n === 4) return [cards.slice(0, 2), cards.slice(2)];  // 2×2
  if (n === 5) return [cards.slice(0, 3), cards.slice(3)];  // 3+2
  return [cards.slice(0, 3), cards.slice(3)];     // 3×2
}

function colsClass(rowLen: number): string {
  if (rowLen === 1) return "grid-cols-1";
  if (rowLen === 2) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

export function SecaoObjetivos({ section }: { section: ProposalSection }) {
  // Tenta novo formato primeiro
  const novoFmt = tryJSON(section.content, isObjetivosNovo);
  if (novoFmt) {
    const cards = novoFmt.cards.slice(0, 6).filter((c) => c.titulo?.trim());
    const titulo = novoFmt.titulo || "Onde queremos chegar";
    const rows = buildObjRows(cards);

    return (
      <LightSectionWrapper id="sec-objetivos">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <InViewFade direction="up">
            <div className="mb-10 max-w-3xl">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: CL.primaryDim }}>
                04 · Objetivos
              </p>
              <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
                style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: CL.text }}>
                {titulo}
              </h2>
            </div>
          </InViewFade>

          <div className="space-y-4">
            {rows.map((row, rowIdx) => {
              const cardsBefore = rows.slice(0, rowIdx).reduce((s, r) => s + r.length, 0);
              return (
                <div key={rowIdx} className={`grid gap-4 ${colsClass(row.length)}`}>
                  {row.map((card, colIdx) => {
                    const globalIdx = cardsBefore + colIdx;
                    const Icon = OBJ_ICONS[globalIdx % OBJ_ICONS.length];
                    return (
                      <InViewFade key={globalIdx} direction="up" delay={globalIdx * 70}>
                        <div
                          className="rounded-2xl p-6 flex items-start gap-4 h-full transition-shadow duration-200 hover:shadow-md"
                          style={{
                            border: `1px solid ${CL.border}`,
                            backgroundColor: CL.bgCard,
                            boxShadow: "0 1px 4px oklch(0.52 0.24 295 / 0.05)",
                          }}
                        >
                          {/* Ícone com fundo accent violeta claro */}
                          <div
                            className="shrink-0 grid h-10 w-10 place-items-center rounded-xl"
                            style={{ backgroundColor: CL.accent }}
                          >
                            <Icon className="h-4 w-4" style={{ color: CL.primary }} />
                          </div>
                          <div>
                            <p className="text-sm font-bold mb-1.5" style={{ color: CL.text }}>
                              {card.titulo}
                            </p>
                            {card.descricao && (
                              <p className="text-xs leading-relaxed" style={{ color: CL.muted }}>
                                {card.descricao}
                              </p>
                            )}
                          </div>
                        </div>
                      </InViewFade>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </LightSectionWrapper>
    );
  }

  // Fallback: formato legado [{ titulo, descricao?, icone? }]
  type ObjCardLegado = { titulo: string; descricao?: string; icone?: string };
  const legado = tryJSON(
    section.content,
    (x): x is ObjCardLegado[] =>
      isArray(x) && x.length > 0 && "titulo" in (x as ObjCardLegado[])[0],
  );
  if (legado) {
    return (
      <LightSectionWrapper id="sec-objetivos">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <InViewFade direction="up">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: CL.primaryDim }}>Objetivos</p>
            <h2 className="text-3xl font-bold sm:text-4xl mb-3 leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: CL.text }}>
              O que vamos construir juntos
            </h2>
            <p className="mb-10 text-base" style={{ color: CL.muted }}>Resultados claros e mensuráveis — não serviços, mas transformações.</p>
          </InViewFade>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {legado.map((obj, i) => {
              const Icon = OBJ_ICONS[i % OBJ_ICONS.length];
              return (
                <InViewFade key={i} direction="up" delay={i * 70}>
                  <div className="rounded-2xl p-6 flex items-start gap-4"
                    style={{ border: `1px solid ${CL.border}`, backgroundColor: CL.bgCard }}>
                    <div className="shrink-0 grid h-10 w-10 place-items-center rounded-xl"
                      style={{ backgroundColor: CL.accent }}>
                      <Icon className="h-4 w-4" style={{ color: CL.primary }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold mb-1" style={{ color: CL.text }}>{obj.titulo}</p>
                      {obj.descricao && <p className="text-xs leading-relaxed" style={{ color: CL.muted }}>{obj.descricao}</p>}
                    </div>
                  </div>
                </InViewFade>
              );
            })}
          </div>
        </div>
      </LightSectionWrapper>
    );
  }

  return <ProseFallback section={section} />;
}

// ─── Mapa de ícones para SecaoEstrategia ────────────────────────────────────
// Cada valor é um componente Lucide. Nomes mapeados a partir do campo `icone`
// salvo no JSON. Fallback para CircleDot quando o nome não for reconhecido.

const STRATEGY_ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  "search":           Search,
  "layout-grid":      LayoutGrid,
  "megaphone":        Megaphone,
  "handshake":        Handshake,
  "heart":            Heart,
  "trending-up":      TrendingUp,
  "map":              Map,
  "clipboard-list":   ClipboardList,
  "zap":              Zap,
  "check-circle":     CheckCircle,
  "bar-chart-2":      BarChart2,
  "file-text":        FileText,
  "palette":          Palette,
  "code-2":           Code2,
  "globe":            Globe,
  "settings-2":       Settings2,
  "map-pin":          MapPin,
  "message-circle":   MessageCircle,
  "line-chart":       LineChart,
  "list-checks":      ListChecks,
  "layers":           Layers,
  "rocket":           Rocket,
  "refresh-cw":       RefreshCw,
  "users":            Users,
  "clipboard-check":  ClipboardCheck,
  "circle-dot":       CircleDot,
};

function StrategyIcon({ name, className, style }: { name?: string; className?: string; style?: React.CSSProperties }) {
  const Icon = (name && STRATEGY_ICON_MAP[name]) ? STRATEGY_ICON_MAP[name] : CircleDot;
  return <Icon className={className} style={style} />;
}

// ─── SecaoEstrategia — timeline horizontal iluminada ─────────────────────────
// JSON: [{ fase, descricao, icone?, ativo? }]
// - Fases com ativo === false são filtradas — não aparecem na proposta.
// - Ícone renderizado no nó (mapa STRATEGY_ICON_MAP acima).
// - Legado sem campo ativo: todas as fases são consideradas ativas.

export function SecaoEstrategia({ section }: { section: ProposalSection }) {
  type FaseCard = { fase: string; descricao?: string; icone?: string; ativo?: boolean };

  const allFases = tryJSON(
    section.content,
    (x): x is FaseCard[] => isArray(x) && x.length > 0 && "fase" in (x as FaseCard[])[0],
  );
  if (!allFases) return <ProseFallback section={section} />;

  // Filtra apenas as fases ativas (legado sem campo ativo → considera ativo)
  const fases = allFases.filter((f) => f.ativo !== false);
  if (fases.length === 0) return null;

  return (
    <section
      id="sec-estrategia"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bgAlt, borderTop: `1px solid ${C.border}` }}
    >
      {/* Faixa de gradiente diagonal decorativa */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 0%, oklch(0.62 0.24 295 / 0.08) 0%, transparent 70%)",
      }} />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-14 max-w-xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              05 · Estratégia
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              O caminho para o crescimento sustentável
            </h2>
          </div>
        </InViewFade>

        {/* ── Desktop: trilho horizontal ── */}
        <div className="hidden sm:block">
          <div className="relative flex items-start">
            {/* Linha de progresso */}
            <div className="absolute top-5 left-0 right-0 h-px" style={{
              background: `linear-gradient(90deg, transparent 0%, ${C.primaryDim} 15%, oklch(0.62 0.24 295 / 0.40) 85%, transparent 100%)`,
            }} />

            {fases.map((f, i) => (
              <InViewFade key={i} direction="up" delay={i * 90} className="flex-1 min-w-0">
                <div className="relative flex flex-col items-center px-2">
                  {/* Nó com ícone iluminado */}
                  <div
                    className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full mb-5 shrink-0"
                    style={{
                      backgroundColor: C.bg,
                      border: `2px solid ${C.primaryDim}`,
                      boxShadow: `0 0 14px oklch(0.62 0.24 295 / 0.45), 0 0 30px oklch(0.62 0.24 295 / 0.15)`,
                    }}
                  >
                    <StrategyIcon
                      name={f.icone}
                      className="h-4 w-4"
                      style={{ color: C.primary }}
                    />
                  </div>
                  <p className="text-center text-xs font-bold mb-1.5 leading-snug" style={{ color: C.text }}>
                    {f.fase}
                  </p>
                  {f.descricao && (
                    <p className="text-center text-[11px] leading-relaxed" style={{ color: C.dimmed }}>
                      {f.descricao}
                    </p>
                  )}
                </div>
              </InViewFade>
            ))}
          </div>
        </div>

        {/* ── Mobile: lista vertical ── */}
        <div className="sm:hidden space-y-0">
          {fases.map((f, i) => (
            <InViewFade key={i} direction="up" delay={i * 80}>
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full z-10"
                    style={{
                      backgroundColor: C.bg,
                      border: `2px solid ${C.primaryDim}`,
                      boxShadow: `0 0 12px oklch(0.62 0.24 295 / 0.40)`,
                    }}
                  >
                    <StrategyIcon name={f.icone} className="h-4 w-4" style={{ color: C.primary }} />
                  </div>
                  {i < fases.length - 1 && (
                    <div className="w-px flex-1 my-1" style={{
                      background: `linear-gradient(180deg, ${C.primaryDim} 0%, ${C.border} 100%)`,
                    }} />
                  )}
                </div>
                <div className="pb-6">
                  <p className="text-sm font-bold mb-1" style={{ color: C.text }}>{f.fase}</p>
                  {f.descricao && (
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{f.descricao}</p>
                  )}
                </div>
              </div>
            </InViewFade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SecaoMetodologia — 2 colunas: texto esquerda | diagrama triângulo direita ─
// JSON: [{ pilar: string, objetivo: string, como: string, resultado: string }]
// Fallback padrão quando não há JSON.
//
// Diagrama: 3 círculos posicionados em triângulo (topo-centro, baixo-esquerda,
// baixo-direita) com setas curvas SVG formando um ciclo contínuo.

const PILARES_DEFAULT = [
  { pilar: "Marketing",  objetivo: "Atrair o público correto",    como: "Campanhas, SEO, conteúdo e presença digital",             resultado: "Geração de oportunidades qualificadas"   },
  { pilar: "Vendas",     objetivo: "Converter oportunidades",      como: "Processo comercial estruturado, CRM e treinamento",       resultado: "Previsibilidade e crescimento de receita" },
  { pilar: "Retenção",   objetivo: "Fidelizar clientes",           como: "Pós-venda, experiência e acompanhamento contínuo",        resultado: "Maior lifetime value e indicações"        },
];

const PILAR_COLORS = [
  "oklch(0.72 0.22 295)",  // Marketing — violeta
  "oklch(0.72 0.17 160)",  // Vendas    — verde
  "oklch(0.72 0.18 50)",   // Retenção  — âmbar
];

// Ícones simples por pilar
const PILAR_ICONS = ["📣", "💰", "🤝"];

export function SecaoMetodologia({ section }: { section: ProposalSection }) {
  type PilarCard = { pilar: string; objetivo: string; como: string; resultado: string };
  const pilares = tryJSON(section.content, (x): x is PilarCard[] =>
    isArray(x) && x.length > 0 && "pilar" in (x as PilarCard[])[0]
  ) ?? PILARES_DEFAULT;

  const [p0, p1, p2] = [
    pilares[0] ?? PILARES_DEFAULT[0],
    pilares[1] ?? PILARES_DEFAULT[1],
    pilares[2] ?? PILARES_DEFAULT[2],
  ];
  const items = [p0, p1, p2];

  const [visible, setVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /*
   * Layout de pirâmide via position:absolute dentro de um container quadrado.
   * O container tem padding-top: 100% para manter aspect-ratio 1:1.
   *
   * Coordenadas em % do container (0-100):
   *   Círculo 0 (Marketing)  — topo centro:     cx=50%, cy=18%
   *   Círculo 1 (Vendas)     — baixo esquerda:  cx=18%, cy=72%
   *   Círculo 2 (Retenção)   — baixo direita:   cx=82%, cy=72%
   *
   * Diâmetro dos círculos: 32% do container.
   * Esses valores garantem que:
   *   - Nenhum círculo sai do container (borda = cx ± 16%, dentro de 0-100%)
   *   - Há espaço de ~18% entre as bordas dos círculos (para as setas ficarem visíveis)
   *
   * SVG de setas cobre 100% do container (absolute inset-0).
   * As setas são desenhadas em viewBox 100×100 (percentual).
   */

  // Posições centrais em % (x, y)
  const POS = [
    { cx: 50, cy: 21 },  // Marketing — topo
    { cx: 16, cy: 78 },  // Vendas — baixo esq (mais afastado para dar espaço entre 2 e 3)
    { cx: 84, cy: 78 },  // Retenção — baixo dir
  ];
  const D = 41; // diâmetro em % do container
  const r = D / 2;

  // Calcula path de seta curva entre dois pontos (em %) que sai/entra pelas bordas dos círculos
  function arrow(from: number, to: number) {
    const f = POS[from];
    const t = POS[to];
    const dx = t.cx - f.cx;
    const dy = t.cy - f.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / dist;
    const uy = dy / dist;
    const gap = r + 1.5; // sai logo após a borda do círculo
    const sx = f.cx + ux * gap;
    const sy = f.cy + uy * gap;
    const ex = t.cx - ux * gap;
    const ey = t.cy - uy * gap;
    // Ponto de controle perpendicular (sentido horário = -uy, ux)
    const perp = 16;
    const mx = (sx + ex) / 2 + (-uy * perp);
    const my = (sy + ey) / 2 + (ux * perp);
    return `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
  }

  return (
    <SectionWrapper id="sec-metodologia">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* ── Coluna esquerda: texto ── */}
          <div>            <InViewFade direction="up">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-3"
                style={{ color: PILAR_COLORS[0] }}>
                Metodologia
              </p>
              <h2 className="text-3xl font-bold sm:text-4xl mb-4"
                style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
                Nosso método: 3 pilares de crescimento
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: C.muted }}>
                Um ciclo contínuo que se retroalimenta — cada pilar alimenta o próximo,
                gerando crescimento sustentável e previsível.
              </p>
            </InViewFade>

            <div className="space-y-5">
              {items.map((p, i) => (
                <InViewFade key={i} direction="up" delay={i * 100}>
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-sm font-bold"
                      style={{ backgroundColor: `${PILAR_COLORS[i]}18`, border: `1.5px solid ${PILAR_COLORS[i]}60`, color: PILAR_COLORS[i] }}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xl font-bold mb-1" style={{ color: C.text }}>
                        {p.pilar}
                        <span className="ml-2 text-base font-normal" style={{ color: C.dimmed }}>— {p.objetivo}</span>
                      </p>
                      <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{p.resultado}</p>
                    </div>
                  </div>
                </InViewFade>
              ))}
            </div>

            <InViewFade direction="up" delay={400}>
              <div className="mt-8 inline-flex items-center gap-3">
                <div className="h-px w-10" style={{ backgroundColor: PILAR_COLORS[0] }} />
                <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: C.dimmed }}>
                  Crescimento Sustentável
                </span>
                <div className="h-px w-10" style={{ backgroundColor: PILAR_COLORS[2] }} />
              </div>
            </InViewFade>
          </div>

          {/* ── Carrossel mobile (oculto em desktop) ── */}
          <MobileCarrossel items={items} colors={PILAR_COLORS} />

          {/* ── Coluna direita: diagrama pirâmide (oculto em mobile) ── */}
          <div ref={wrapRef} className="hidden lg:block">
            {/*
              Container quadrado via padding-top: 100%.
              Todos os filhos ficam position:absolute dentro dele.
              Assim os círculos são posicionados em % e nunca cortam.
            */}
            <div className="relative w-full" style={{ paddingTop: "100%" }}>
              <div className="absolute inset-0">

                {/* ── 1. Glow SVG — renderizado primeiro (mais atrás) ── */}
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-0 w-full h-full"
                  style={{ overflow: "visible", pointerEvents: "none" }}
                  aria-hidden="true"
                >
                  <defs>
                    {PILAR_COLORS.map((color, i) => (
                      <radialGradient key={i} id={`glow-grad-${i}`} cx="50%" cy="50%" r="50%">
                        <stop offset="70%"  stopColor={color} stopOpacity="0" />
                        <stop offset="85%"  stopColor={color} stopOpacity="0.25" />
                        <stop offset="93%"  stopColor={color} stopOpacity="0.50" />
                        <stop offset="98%"  stopColor={color} stopOpacity="0.60" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.30" />
                      </radialGradient>
                    ))}
                  </defs>
                  {POS.map(({ cx, cy }, i) => (
                    <circle
                      key={i}
                      cx={cx} cy={cy}
                      r={r + 2}
                      fill={`url(#glow-grad-${i})`}
                      style={{
                        opacity: visible ? 1 : 0,
                        transition: `opacity 800ms ease ${i * 150 + 300}ms`,
                      }}
                    />
                  ))}
                </svg>

                {/* ── 2. Setas SVG — sobre o glow ── */}
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-0 w-full h-full"
                  style={{ overflow: "visible" }}
                  aria-hidden="true"
                >
                  <defs>
                    {PILAR_COLORS.map((color, i) => (
                      <marker key={i}
                        id={`mk-${i}`}
                        markerWidth="8" markerHeight="8"
                        refX="4" refY="4"
                        orient="auto"
                      >
                        <polygon points="0 0, 8 4, 0 8" fill={color} />
                      </marker>
                    ))}
                  </defs>

                  {/* 3 setas: 0→1, 1→2, 2→0 */}
                  {[0, 1, 2].map((from) => {
                    const to = (from + 1) % 3;
                    return (
                      <path
                        key={from}
                        d={arrow(from, to)}
                        fill="none"
                        stroke={PILAR_COLORS[from]}
                        strokeWidth="0.4"
                        strokeLinecap="round"
                        markerEnd={`url(#mk-${from})`}
                        style={{
                          opacity: visible ? 0.95 : 0,
                          transition: `opacity 700ms ease ${from * 250 + 600}ms`,
                        }}
                      />
                    );
                  })}
                </svg>

                {/* ── 3. Ícone central — no centróide do triângulo ── */}
                {/* Centróide: ((50+16+84)/3, (21+78+78)/3) = (50, 59) */}
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-0 w-full h-full"
                  style={{ overflow: "visible", pointerEvents: "none" }}
                  aria-hidden="true"
                >
                  {/* Fundo circular semitransparente atrás do ícone */}
                  <circle
                    cx="50" cy="59" r="7.5"
                    fill="oklch(0.12 0.02 285)"
                    fillOpacity={visible ? 0.88 : 0}
                    style={{ transition: "fill-opacity 600ms ease 1200ms" }}
                  />
                  {/* Imagem do ícone da Agência C8 — centralizada em (50,59) */}
                  <image
                    href="/icon.png"
                    x="43" y="52"
                    width="14" height="14"
                    style={{
                      opacity: visible ? 0.9 : 0,
                      transition: "opacity 600ms ease 1300ms",
                    }}
                  />
                </svg>
                {items.map((p, i) => {
                  const { cx, cy } = POS[i];
                  const color = PILAR_COLORS[i];
                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left:   `${cx - r}%`,
                        top:    `${cy - r}%`,
                        width:  `${D}%`,
                        paddingTop: `${D}%`,
                        borderRadius: "50%",
                        opacity: visible ? 1 : 0,
                        transform: visible ? "scale(1)" : "scale(0.8)",
                        transition: `opacity 600ms ease ${i * 150 + 200}ms, transform 600ms ease ${i * 150 + 200}ms`,
                      }}
                    >
                      {/* Container com border + background + overflow:hidden */}
                      <div style={{
                        position: "absolute", inset: 0,
                        borderRadius: "50%",
                        overflow: "hidden",
                        backgroundColor: "oklch(0.155 0.028 285)",
                        border: `2px solid ${color}bb`,
                      }}>

                      {/* Conteúdo — absolute sobre o glow */}
                      <div style={{
                        position: "absolute", inset: 0,
                        borderRadius: "50%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: "16%",
                        boxSizing: "border-box",
                        gap: "4%",
                        zIndex: 2,
                      }}>
                        <span style={{
                          fontSize: "clamp(14px, 2.2vw, 22px)",
                          fontWeight: 800, color,
                          fontFamily: "Space Grotesk, Inter, sans-serif",
                          lineHeight: 1,
                        }}>
                          {i + 1}
                        </span>
                        <span style={{
                          fontSize: "clamp(13px, 2vw, 19px)",
                          fontWeight: 700,
                          color: "oklch(0.97 0.005 270)",
                          fontFamily: "Space Grotesk, Inter, sans-serif",
                          lineHeight: 1.15,
                        }}>
                          {p.pilar}
                        </span>
                        <div style={{
                          width: "35%", height: 2,
                          backgroundColor: color, borderRadius: 2, opacity: 0.65,
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: "clamp(10px, 1.4vw, 13px)",
                          color: "oklch(0.72 0.02 280)",
                          lineHeight: 1.4,
                        }}>
                          {p.objetivo}
                        </span>
                        <span style={{
                          fontSize: "clamp(10px, 1.4vw, 13px)",
                          fontWeight: 600, color,
                          lineHeight: 1.4,
                        }}>
                          {p.resultado}
                        </span>
                      </div>
                      </div>{/* fecha container interno overflow:hidden */}
                    </div>
                  );
                })}

              </div>
            </div>
          </div>

        </div>
      </div>
    </SectionWrapper>
  );
}

// ── CircleCard removido — substituído por divs absolutas inline acima ─────────

// ─── MobileCarrossel3D — carrossel giratório 3D para mobile ─────────────────
// Visível apenas em < lg.
// 3 cards em círculo 3D via CSS perspective + rotateY.
// Auto-avança a cada 3.5s. Swipe/drag para girar manualmente.

function MobileCarrossel({
  items,
  colors,
}: {
  items: Array<{ pilar: string; objetivo: string; como: string; resultado: string }>;
  colors: string[];
}) {
  const len = items.length;
  // rotation acumula giros (pode ser negativo / > 360)
  const [rotation, setRotation] = useState(0);
  const autoRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartX = useRef(0);
  const isDragging = useRef(false);

  // Índice ativo calculado a partir da rotação acumulada
  const activeIdx = (((Math.round(-rotation / (360 / len)) % len) + len) % len);

  function startAuto() {
    if (autoRef.current) clearInterval(autoRef.current);
    autoRef.current = setInterval(() => {
      setRotation(r => r - 360 / len);
    }, 3500);
  }

  function stopAuto() {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
  }

  useEffect(() => { startAuto(); return () => stopAuto(); }, []);

  function advance(dir: 1 | -1) {
    setRotation(r => r - dir * (360 / len));
    startAuto();
  }

  // Touch
  function onTouchStart(e: React.TouchEvent) {
    dragStartX.current = e.touches[0].clientX;
    isDragging.current = true;
    stopAuto();
  }
  function onTouchEnd(e: React.TouchEvent) {
    isDragging.current = false;
    const dx = e.changedTouches[0].clientX - dragStartX.current;
    if (Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1);
    else startAuto();
  }

  // Mouse
  function onMouseDown(e: React.MouseEvent) {
    dragStartX.current = e.clientX;
    isDragging.current = true;
    stopAuto();
  }
  function onMouseUp(e: React.MouseEvent) {
    const drag = isDragging.current;
    isDragging.current = false;
    const dx = e.clientX - dragStartX.current;
    if (drag && Math.abs(dx) > 40) advance(dx < 0 ? 1 : -1);
    else startAuto();
  }

  // Raio do carrossel (translateZ dos cards)
  const RADIUS = 120; // px
  const STEP   = 360 / len;

  return (
    <div
      className="lg:hidden select-none"
      style={{ userSelect: "none" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      {/* Cena 3D */}
      <div style={{
        perspective: "600px",
        perspectiveOrigin: "50% 50%",
        height: "340px",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {/* Plataforma giratória */}
        <div style={{
          position: "relative",
          width: "260px",
          height: "260px",
          transformStyle: "preserve-3d",
          transform: `rotateY(${rotation}deg)`,
          transition: "transform 700ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          {items.map((p, i) => {
            const cardRotY = i * STEP;
            const isActive = i === activeIdx;
            const color    = colors[i];

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: 0, left: 0,
                  width: "260px",
                  height: "260px",
                  // Posiciona o card no ângulo correto + empurra para fora pelo raio
                  transform: `rotateY(${cardRotY}deg) translateZ(${RADIUS}px)`,
                  backfaceVisibility: "hidden",
                  borderRadius: "20px",
                  backgroundColor: "oklch(0.155 0.028 285)",
                  border: `2px solid ${color}${isActive ? "cc" : "55"}`,
                  boxShadow: isActive
                    ? `0 0 32px 10px ${color}45, 0 0 70px 20px ${color}22, inset 0 0 30px 4px ${color}18`
                    : `0 0 12px 2px ${color}20`,
                  opacity: isActive ? 1 : 0.55,
                  // Cards de fundo ficam menores (scale via Z já cuida da perspectiva,
                  // mas adicionamos scale explícito para contraste visual extra)
                  transition: "opacity 500ms ease, box-shadow 500ms ease, border-color 500ms ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "28px",
                  boxSizing: "border-box",
                  gap: "10px",
                  cursor: isActive ? "grab" : "pointer",
                }}
                onClick={() => !isDragging.current && advance(i === (activeIdx + 1) % len ? 1 : -1)}
              >
                {/* Número */}
                <span style={{
                  fontSize: "22px", fontWeight: 800, color,
                  fontFamily: "Space Grotesk, Inter, sans-serif", lineHeight: 1,
                }}>
                  {i + 1}
                </span>

                {/* Nome */}
                <span style={{
                  fontSize: "20px", fontWeight: 700,
                  color: "oklch(0.97 0.005 270)",
                  fontFamily: "Space Grotesk, Inter, sans-serif", lineHeight: 1.15,
                }}>
                  {p.pilar}
                </span>

                {/* Separador */}
                <div style={{
                  width: "40px", height: "2px",
                  backgroundColor: color, borderRadius: "2px",
                  opacity: 0.65, flexShrink: 0,
                }} />

                {/* Objetivo */}
                <span style={{
                  fontSize: "14px", color: "oklch(0.72 0.02 280)", lineHeight: 1.4,
                }}>
                  {p.objetivo}
                </span>

                {/* Resultado */}
                <span style={{
                  fontSize: "14px", fontWeight: 600, color, lineHeight: 1.4,
                }}>
                  {p.resultado}
                </span>
              </div>
            );
          })}
        </div>

        {/* Sombra no chão */}
        <div style={{
          position: "absolute",
          bottom: "16px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "200px",
          height: "24px",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)",
          filter: "blur(6px)",
          pointerEvents: "none",
        }} />
      </div>

      {/* Dots de navegação */}
      <div className="flex justify-center gap-2 mt-4">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              const diff = i - activeIdx;
              const dir: 1 | -1 = diff > 0 ? 1 : -1;
              advance(dir);
            }}
            style={{
              width: i === activeIdx ? "28px" : "8px",
              height: "8px",
              borderRadius: "4px",
              backgroundColor: i === activeIdx ? colors[activeIdx] : "rgba(255,255,255,0.2)",
              border: "none", padding: 0, cursor: "pointer",
              transition: "all 400ms ease",
            }}
            aria-label={`Ver ${items[i].pilar}`}
          />
        ))}
      </div>

      {/* Label do card ativo */}
      <p className="text-center mt-3 text-sm font-semibold"
        style={{ color: colors[activeIdx], transition: "color 400ms ease" }}>
        {items[activeIdx].pilar}
      </p>
    </div>
  );
}

// ─── SecaoSolucao — Ecossistema C8 ───────────────────────────────────────────
// JSON: [{ icone?: string, titulo: string, itens?: string[] }]
// Efeito: cards com gradiente de borda no hover, ícone com gradiente violeta→roxo

export function SecaoSolucao({ section }: { section: ProposalSection }) {
  type SolCard = { titulo: string; itens?: string[] };
  const blocks = tryJSON(section.content, (x): x is SolCard[] => isArray(x) && x.length > 0 && "titulo" in (x as SolCard[])[0]);
  if (!blocks) return <ProseFallback section={section} />;

  const ICONS = [Zap, Target, BarChart3, Shield, TrendingUp, Users, Lightbulb, Star];

  return (
    <section
      id="sec-solucao"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bgAlt, borderTop: `1px solid ${C.border}` }}
    >
      {/* Glow central */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: "radial-gradient(ellipse 60% 40% at 50% 100%, oklch(0.62 0.24 295 / 0.07) 0%, transparent 70%)",
      }} />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 max-w-xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              06 · Solução
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              A solução completa da C8
            </h2>
            <p className="mt-3 text-base" style={{ color: C.muted }}>
              Módulos integrados que trabalham juntos para gerar crescimento.
            </p>
          </div>
        </InViewFade>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <InViewFade key={i} direction="up" delay={i * 70}>
                {/* Wrapper com borda gradiente */}
                <div
                  className="rounded-2xl p-px h-full"
                  style={{
                    background: `linear-gradient(135deg, oklch(0.62 0.24 295 / 0.25) 0%, oklch(0.62 0.24 295 / 0.05) 100%)`,
                  }}
                >
                  <div className="rounded-[15px] p-6 h-full flex flex-col" style={{ backgroundColor: C.bgCard }}>
                    <div
                      className="mb-4 grid h-10 w-10 place-items-center rounded-xl shrink-0"
                      style={{
                        background: `linear-gradient(135deg, oklch(0.62 0.24 295) 0%, oklch(0.62 0.22 310) 100%)`,
                        boxShadow: `0 4px 14px oklch(0.62 0.24 295 / 0.35)`,
                      }}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm font-bold mb-3" style={{ color: C.text }}>{b.titulo}</p>
                    {b.itens && (
                      <ul className="space-y-2 mt-auto">
                        {b.itens.map((it, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs" style={{ color: C.muted }}>
                            <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: C.primaryDim }} />
                            {it}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </InViewFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── SecaoEscopo — accordion com borda ativa iluminada ───────────────────────
// Aceita serviços da tabela proposal_services (passados via prop services)
// OU JSON da seção: [{ modulo: string, descricao?: string, entregaveis?: string[], obs?: string }]

interface EscopoServico { name: string; description: string | null; is_bonus: boolean; value: number; }

interface EscopoProps {
  section?: ProposalSection;
  services?: EscopoServico[];
  planValue?: number;
}

export function SecaoEscopo({ section, services = [], planValue = 0 }: EscopoProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  type ModuleCard = { modulo: string; descricao?: string; entregaveis?: string[]; obs?: string };

  const modules: ModuleCard[] = section
    ? (tryJSON(section.content, (x): x is ModuleCard[] => isArray(x) && x.length > 0 && "modulo" in (x as ModuleCard[])[0]) ?? [])
    : [];

  const items: ModuleCard[] = modules.length > 0
    ? modules
    : services.filter(s => !s.is_bonus).map(s => ({
        modulo: s.name,
        descricao: s.description ?? undefined,
      }));

  const bonus = services.filter(s => s.is_bonus);
  const total = services.filter(s => !s.is_bonus).reduce((sum, s) => sum + s.value, 0);
  const savings = total > 0 && planValue > 0 && planValue < total ? total - planValue : 0;

  if (items.length === 0) return null;

  return (
    <section
      id="sec-escopo"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bg, borderTop: `1px solid ${C.border}` }}
    >
      {/* Glow lateral esquerdo */}
      <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-96 w-64 rounded-full" style={{
        background: "radial-gradient(circle, oklch(0.62 0.24 295 / 0.06) 0%, transparent 70%)",
      }} />
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 max-w-xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              07 · Escopo
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              Tudo que será entregue
            </h2>
            <p className="mt-3 text-base" style={{ color: C.muted }}>
              Módulos organizados para máxima clareza sobre cada entrega.
            </p>
          </div>
        </InViewFade>

        <div className="space-y-2 mb-8">
          {items.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <InViewFade key={i} direction="up" delay={i * 50}>
                <div
                  className="rounded-2xl overflow-hidden transition-all duration-200"
                  style={{
                    border: isOpen
                      ? `1px solid ${C.primaryDim}`
                      : `1px solid ${C.border}`,
                    backgroundColor: C.bgCard,
                    boxShadow: isOpen
                      ? `0 0 20px oklch(0.62 0.24 295 / 0.12), inset 0 0 0 1px oklch(0.62 0.24 295 / 0.08)`
                      : "none",
                  }}
                >
                  <button
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                    onClick={() => setOpenIdx(isOpen ? null : i)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Indicador colorido */}
                      <div
                        className="h-1.5 w-1.5 rounded-full shrink-0 transition-colors duration-200"
                        style={{ backgroundColor: isOpen ? C.primary : C.dimmed }}
                      />
                      <span className="text-sm font-medium truncate" style={{ color: C.text }}>
                        {item.modulo}
                      </span>
                    </div>

                    {/* Lado direito: contagem de entregáveis + chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                      {item.entregaveis && item.entregaveis.length > 0 && (
                        <span
                          className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: isOpen
                              ? "oklch(0.62 0.24 295 / 0.15)"
                              : "rgba(255,255,255,0.05)",
                            color: isOpen ? C.primaryDim : C.dimmed,
                            border: `1px solid ${isOpen ? "oklch(0.62 0.24 295 / 0.30)" : "rgba(255,255,255,0.08)"}`,
                            transition: "all 200ms ease",
                          }}
                        >
                          {item.entregaveis.length}{" "}
                          {item.entregaveis.length === 1 ? "entregável" : "entregáveis"}
                        </span>
                      )}
                      <ChevronDown
                        className="h-4 w-4 transition-transform duration-300"
                        style={{ color: C.primaryDim, transform: isOpen ? "rotate(180deg)" : "none" }}
                      />
                    </div>
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isOpen ? "600px" : "0px" }}
                  >
                    <div className="px-6 pb-5 space-y-3">
                      {/* Separador decorativo */}
                      <div className="h-px mb-1" style={{
                        background: `linear-gradient(90deg, ${C.primaryDim} 0%, ${C.border} 100%)`,
                      }} />
                      {item.descricao && (
                        <p className="text-sm" style={{ color: C.muted }}>{item.descricao}</p>
                      )}
                      {item.entregaveis && item.entregaveis.length > 0 && (
                        <ul className="space-y-2">
                          {item.entregaveis.map((e, j) => (
                            <li key={j} className="flex items-start gap-2.5 text-sm" style={{ color: C.muted }}>
                              <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.primaryDim }} />
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.obs && (
                        <p className="text-sm pt-2 border-t" style={{ borderColor: C.border, color: C.dimmed }}>
                          {item.obs}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </InViewFade>
            );
          })}
        </div>

        {(bonus.length > 0 || savings > 0) && (
          <InViewFade direction="up" delay={200}>
            <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: C.border, backgroundColor: C.bgCard }}>
              {savings > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: C.muted }}>Economia vs. contratação individual</span>
                  <span className="font-semibold" style={{ color: C.green }}>{fmtCurrency(savings)}</span>
                </div>
              )}
              {bonus.map((b, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-amber-400">🎁</span>
                  <span style={{ color: C.muted }}>{b.name}</span>
                  <span className="ml-auto text-xs line-through" style={{ color: C.dimmed }}>{fmtCurrency(b.value)}</span>
                  <span className="text-xs font-semibold" style={{ color: C.green }}>Incluso</span>
                </div>
              ))}
            </div>
          </InViewFade>
        )}
      </div>
    </section>
  );
}

// ─── SecaoDisferenciais ───────────────────────────────────────────────────────
// JSON: [{ titulo: string, descricao?: string }]
// Efeito: cards com borda esquerda colorida rotativa (violeta, verde, âmbar)
// + glow sutil no fundo + número de ordem em destaque

export function SecaoDisferenciais({ section }: { section: ProposalSection }) {
  type DifCard = { titulo: string; descricao?: string };
  const items = tryJSON(section.content, (x): x is DifCard[] => isArray(x) && x.length > 0 && "titulo" in (x as DifCard[])[0]);
  if (!items) return <ProseFallback section={section} />;

  // Cores rotativas para as bordas (identidade visual)
  const ACCENT_COLORS = [
    "oklch(0.72 0.22 295)",  // violeta primário
    "oklch(0.72 0.17 160)",  // verde
    "oklch(0.72 0.18 50)",   // âmbar
  ];

  return (
    <section
      id="sec-diferenciais"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bgAlt, borderTop: `1px solid ${C.border}` }}
    >
      {/* Glow de fundo superior direito */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full" style={{
        background: "radial-gradient(circle, oklch(0.72 0.22 295 / 0.07) 0%, transparent 70%)",
      }} />
      {/* Glow inferior esquerdo */}
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full" style={{
        background: "radial-gradient(circle, oklch(0.72 0.17 160 / 0.05) 0%, transparent 70%)",
      }} />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 max-w-xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              Diferenciais
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              Por que a Agência C8
            </h2>
          </div>
        </InViewFade>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            const accentColor = ACCENT_COLORS[i % ACCENT_COLORS.length];
            return (
              <InViewFade key={i} direction="up" delay={i * 70}>
                <div
                  className="rounded-2xl p-5 flex gap-4 h-full"
                  style={{
                    backgroundColor: C.bgCard,
                    border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${accentColor}`,
                  }}
                >
                  {/* Número de ordem */}
                  <div
                    className="shrink-0 text-2xl font-black leading-none mt-0.5 tabular-nums"
                    style={{
                      color: accentColor,
                      opacity: 0.25,
                      fontFamily: "'Space Grotesk','Inter',sans-serif",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold mb-1.5 leading-snug" style={{ color: C.text }}>
                      {item.titulo}
                    </p>
                    {item.descricao && (
                      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                        {item.descricao}
                      </p>
                    )}
                  </div>
                </div>
              </InViewFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── SecaoGarantias — Compromissos com check iluminado ───────────────────────
// JSON: [{ titulo: string, descricao?: string }]
// Efeito: fundo escuro com glow verde, check com animação pulse, layout 2 col

export function SecaoGarantias({ section }: { section: ProposalSection }) {
  type GarCard = { titulo: string; descricao?: string };
  const items = tryJSON(section.content, (x): x is GarCard[] => isArray(x) && x.length > 0 && "titulo" in (x as GarCard[])[0]);
  const hasContent = section.content.trim().length > 2;
  if (!hasContent) return null;
  if (!items) return <ProseFallback section={section} />;

  return (
    <section
      id="sec-garantias"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bg, borderTop: `1px solid ${C.border}` }}
    >
      {/* Glow verde central */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: `radial-gradient(ellipse 55% 45% at 50% 50%, oklch(0.72 0.17 160 / 0.05) 0%, transparent 65%)`,
      }} />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 max-w-xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              Compromissos
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              O que você pode esperar de nós
            </h2>
            <p className="mt-3 text-base" style={{ color: C.muted }}>
              Não são promessas — são padrões inegociáveis de como trabalhamos.
            </p>
          </div>
        </InViewFade>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <InViewFade key={i} direction="up" delay={i * 60}>
              <div
                className="rounded-2xl p-5 flex gap-4 items-start"
                style={{
                  backgroundColor: C.bgCard,
                  border: `1px solid ${C.border}`,
                  borderTop: `1px solid oklch(0.72 0.17 160 / 0.20)`,
                }}
              >
                {/* Check com fundo verde iluminado */}
                <div
                  className="shrink-0 h-8 w-8 grid place-items-center rounded-full mt-0.5"
                  style={{
                    backgroundColor: C.greenBg,
                    border: `1.5px solid oklch(0.72 0.17 160 / 0.30)`,
                    boxShadow: `0 0 12px oklch(0.72 0.17 160 / 0.20)`,
                  }}
                >
                  <Check className="h-4 w-4" style={{ color: C.green }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug mb-1" style={{ color: C.text }}>
                    {item.titulo}
                  </p>
                  {item.descricao && (
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                      {item.descricao}
                    </p>
                  )}
                </div>
              </div>
            </InViewFade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SecaoCases ───────────────────────────────────────────────────────────────
// JSON: [{ empresa, segmento?, antes, depois, indicadores?: { label, valor }[] }]
// Efeito: fundo com gradiente diagonal, indicadores com glow numérico

export function SecaoCases({ section }: { section: ProposalSection }) {
  type Indicador = { label: string; valor: string };
  type CaseCard = { empresa: string; segmento?: string; antes: string; depois: string; indicadores?: Indicador[] };
  const cases = tryJSON(section.content, (x): x is CaseCard[] => isArray(x) && x.length > 0 && "empresa" in (x as CaseCard[])[0]);
  if (!cases) return <ProseFallback section={section} />;

  return (
    <section
      id="sec-cases"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bg, borderTop: `1px solid ${C.border}` }}
    >
      {/* Gradiente diagonal de fundo */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 50% 60% at 0% 50%, oklch(0.62 0.24 295 / 0.06) 0%, transparent 60%),
          radial-gradient(ellipse 40% 40% at 100% 80%, oklch(0.72 0.17 160 / 0.04) 0%, transparent 60%)
        `,
      }} />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 max-w-xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              Cases
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              Resultados que já entregamos
            </h2>
            <p className="mt-3 text-base" style={{ color: C.muted }}>
              Transformações reais em negócios reais.
            </p>
          </div>
        </InViewFade>

        <div className="grid gap-6 sm:grid-cols-2">
          {cases.map((c, i) => (
            <InViewFade key={i} direction="up" delay={i * 100}>
              {/* Wrapper com borda gradiente */}
              <div
                className="rounded-2xl p-px h-full"
                style={{
                  background: `linear-gradient(135deg, oklch(0.62 0.24 295 / 0.20) 0%, oklch(0.72 0.17 160 / 0.12) 100%)`,
                }}
              >
                <div className="rounded-[15px] overflow-hidden h-full" style={{ backgroundColor: C.bgCard }}>
                  {/* Header empresa */}
                  <div className="px-6 py-4 border-b flex items-start justify-between gap-3" style={{ borderColor: C.border }}>
                    <div>
                      <p className="text-base font-bold" style={{ color: C.text }}>{c.empresa}</p>
                      {c.segmento && (
                        <p className="text-xs mt-0.5" style={{ color: C.dimmed }}>{c.segmento}</p>
                      )}
                    </div>
                    {/* Badge de case */}
                    <div
                      className="shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                      style={{ backgroundColor: C.accent, color: C.primaryDim }}
                    >
                      Case
                    </div>
                  </div>

                  {/* Antes / Depois */}
                  <div className="grid grid-cols-2 divide-x" style={{ borderColor: C.border }}>
                    <div className="p-5" style={{ backgroundColor: C.redBg }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: C.red }}>
                        Antes
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{c.antes}</p>
                    </div>
                    <div className="p-5" style={{ backgroundColor: C.greenBg }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: C.green }}>
                        Depois
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{c.depois}</p>
                    </div>
                  </div>

                  {/* Indicadores com glow numérico */}
                  {c.indicadores && c.indicadores.length > 0 && (
                    <div
                      className="flex flex-wrap gap-4 px-5 py-4 border-t"
                      style={{ borderColor: C.border, backgroundColor: "oklch(0.62 0.24 295 / 0.04)" }}
                    >
                      {c.indicadores.map((ind, j) => (
                        <div key={j} className="flex items-baseline gap-1.5">
                          <span
                            className="text-xl font-black tabular-nums"
                            style={{
                              color: C.primary,
                              textShadow: `0 0 20px oklch(0.72 0.22 295 / 0.50)`,
                              fontFamily: "'Space Grotesk','Inter',sans-serif",
                            }}
                          >
                            {ind.valor}
                          </span>
                          <span className="text-xs" style={{ color: C.dimmed }}>{ind.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </InViewFade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SecaoDepoimentos — carrossel aprimorado ─────────────────────────────────
// JSON: [{ nome, cargo?, empresa?, texto, nota?: number }]
// Efeito: fundo com gradiente suave, card com borda iluminada, avatar inicial

export function SecaoDepoimentos({ section }: { section: ProposalSection }) {
  type Dep = { nome: string; cargo?: string; empresa?: string; texto: string; nota?: number };
  const deps = tryJSON(section.content, (x): x is Dep[] => isArray(x) && x.length > 0 && "texto" in (x as Dep[])[0]);
  if (!deps) return <ProseFallback section={section} />;

  const [idx, setIdx] = useState(0);
  const len = deps.length;
  const dep = deps[idx];

  // Cor de avatar baseada no índice (identidade)
  const AVATAR_COLORS = [
    "oklch(0.72 0.22 295)",
    "oklch(0.72 0.17 160)",
    "oklch(0.72 0.18 50)",
    "oklch(0.65 0.18 25)",
  ];

  return (
    <section
      id="sec-depoimentos"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bgAlt, borderTop: `1px solid ${C.border}` }}
    >
      {/* Gradiente de fundo */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.62 0.24 295 / 0.07) 0%, transparent 65%),
          radial-gradient(ellipse 40% 40% at 50% 100%, oklch(0.62 0.24 295 / 0.04) 0%, transparent 60%)
        `,
      }} />

      <div className="relative mx-auto max-w-3xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              Depoimentos
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              O que nossos clientes dizem
            </h2>
          </div>
        </InViewFade>

        <InViewFade direction="up" delay={100}>
          {/* Card principal com borda gradiente */}
          <div
            className="rounded-2xl p-px mb-6"
            style={{
              background: `linear-gradient(135deg, oklch(0.62 0.24 295 / 0.35) 0%, oklch(0.62 0.24 295 / 0.08) 100%)`,
              boxShadow: `0 0 40px oklch(0.62 0.24 295 / 0.10)`,
            }}
          >
            <div className="rounded-[15px] p-8" style={{ backgroundColor: C.bgCard }}>
              {/* Estrelas */}
              <div className="flex gap-0.5 mb-6">
                {Array.from({ length: dep.nota ?? 5 }).map((_, s) => (
                  <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Quote decorativa */}
              <div
                className="text-5xl font-black leading-none mb-4 select-none"
                style={{ color: C.primaryDim, opacity: 0.25, fontFamily: "'Georgia', serif" }}
              >
                "
              </div>

              <p className="text-lg leading-relaxed mb-8" style={{ color: C.text }}>
                {dep.texto}
              </p>

              {/* Author row */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Avatar inicial */}
                  <div
                    className="h-10 w-10 rounded-full grid place-items-center text-sm font-bold shrink-0"
                    style={{
                      backgroundColor: `${AVATAR_COLORS[idx % AVATAR_COLORS.length]}22`,
                      border: `1.5px solid ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}55`,
                      color: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                    }}
                  >
                    {dep.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.text }}>{dep.nome}</p>
                    {(dep.cargo || dep.empresa) && (
                      <p className="text-xs mt-0.5" style={{ color: C.dimmed }}>
                        {[dep.cargo, dep.empresa].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Navegação */}
                {len > 1 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setIdx((idx - 1 + len) % len)}
                      className="rounded-full border p-2 transition-opacity hover:opacity-70"
                      style={{ borderColor: C.border, backgroundColor: C.bg }}
                    >
                      <ChevronLeft className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                    <span className="text-xs tabular-nums" style={{ color: C.dimmed }}>{idx + 1}/{len}</span>
                    <button
                      onClick={() => setIdx((idx + 1) % len)}
                      className="rounded-full border p-2 transition-opacity hover:opacity-70"
                      style={{ borderColor: C.border, backgroundColor: C.bg }}
                    >
                      <ChevronRight className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dots de navegação */}
          {len > 1 && (
            <div className="flex justify-center gap-1.5">
              {deps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === idx ? 24 : 6,
                    backgroundColor: i === idx ? C.primaryDim : C.border,
                  }}
                  aria-label={`Ver depoimento ${i + 1}`}
                />
              ))}
            </div>
          )}
        </InViewFade>
      </div>
    </section>
  );
}

// ─── SecaoFAQ — accordion com separadores iluminados ─────────────────────────
// JSON: [{ pergunta, resposta }]
// Efeito: fundo alternado bgAlt, item ativo com borda violeta + faixa lateral,
// separadores com gradiente sutil entre itens

export function SecaoFAQ({ section }: { section: ProposalSection }) {
  type FAQ = { pergunta: string; resposta: string };
  const faqs = tryJSON(section.content, (x): x is FAQ[] => isArray(x) && x.length > 0 && "pergunta" in (x as FAQ[])[0]);
  if (!faqs) return <ProseFallback section={section} />;

  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      id="sec-faq"
      className="relative py-20 xl:py-24 overflow-hidden"
      style={{ backgroundColor: C.bgAlt, borderTop: `1px solid ${C.border}` }}
    >
      {/* Glow de fundo sutil */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: `radial-gradient(ellipse 50% 60% at 50% 50%, oklch(0.62 0.24 295 / 0.05) 0%, transparent 70%)`,
      }} />

      <div className="relative mx-auto max-w-2xl px-5 sm:px-8">
        <InViewFade direction="up">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.35em]" style={{ color: C.primaryDim }}>
              FAQ
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight"
              style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", letterSpacing: "-0.02em", color: C.text }}>
              Perguntas frequentes
            </h2>
          </div>
        </InViewFade>

        <div className="space-y-2">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <InViewFade key={i} direction="up" delay={i * 50}>
                <div
                  className="rounded-2xl overflow-hidden transition-all duration-200"
                  style={{
                    backgroundColor: C.bgCard,
                    border: isOpen
                      ? `1px solid ${C.primaryDim}`
                      : `1px solid ${C.border}`,
                    boxShadow: isOpen
                      ? `0 0 20px oklch(0.62 0.24 295 / 0.10)`
                      : "none",
                  }}
                >
                  <button
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {/* Faixa lateral quando aberto */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-4 w-0.5 rounded-full shrink-0 transition-all duration-200"
                        style={{
                          backgroundColor: isOpen ? C.primary : "transparent",
                          boxShadow: isOpen ? `0 0 8px ${C.primaryDim}` : "none",
                        }}
                      />
                      <span
                        className="text-sm font-medium leading-snug"
                        style={{ color: isOpen ? C.text : C.muted }}
                      >
                        {faq.pergunta}
                      </span>
                    </div>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 transition-transform duration-300"
                      style={{
                        color: isOpen ? C.primary : C.dimmed,
                        transform: isOpen ? "rotate(180deg)" : "none",
                      }}
                    />
                  </button>

                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isOpen ? "500px" : "0px" }}
                  >
                    {/* Separador com gradiente */}
                    <div className="mx-6 h-px" style={{
                      background: `linear-gradient(90deg, ${C.primaryDim} 0%, ${C.border} 100%)`,
                    }} />
                    <p
                      className="px-6 py-5 text-sm leading-relaxed"
                      style={{ color: C.muted }}
                    >
                      {faq.resposta}
                    </p>
                  </div>
                </div>
              </InViewFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

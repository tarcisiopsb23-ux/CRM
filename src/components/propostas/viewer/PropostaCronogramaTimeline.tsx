/**
 * PropostaCronogramaTimeline — linha do tempo visual animada para o cronograma
 * da proposta pública. Cada fase "acende" progressivamente conforme o scroll.
 *
 * Aceita os dados do section_key "cronograma" (content em texto/markdown)
 * OU um JSON estruturado no campo `escopo` da proposta. Para máxima flexibilidade,
 * o componente também aceita um array de fases direto via prop.
 *
 * Formato JSON esperado quando parseado do content do section "cronograma":
 * [
 *   {
 *     "fase": "Fase 01",
 *     "quando": "Semana 1",
 *     "descricao": "Setup e configurações",
 *     "itens": ["Item A", "Item B"]
 *   },
 *   ...
 * ]
 *
 * Se o content não for JSON válido, faz fallback e renderiza o texto como prose.
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { InViewFade } from "./InViewFade";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TimelineFase {
  fase: string;          // ex: "Fase 01"
  quando?: string;       // ex: "Semana 1–2"
  descricao?: string;    // subtítulo curto
  itens?: string[];      // lista de entregas
}

// ─── Hook: detecta se o elemento está visível na viewport ────────────────────

function useInView(threshold = 0.3): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

// ─── Card de uma fase ─────────────────────────────────────────────────────────

function FaseCard({
  fase,
  index,
  isLast,
  inView,
}: {
  fase: TimelineFase;
  index: number;
  isLast: boolean;
  inView: boolean;
}) {
  // Cada card ativa com delay escalonado após o contêiner entrar na view
  const delay = inView ? index * 180 : 99999;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setActive(true), index * 180);
    return () => clearTimeout(t);
  }, [inView, index]);

  return (
    <div className="relative flex gap-5 sm:gap-8">
      {/* ── Linha + ícone vertical ── */}
      <div className="flex flex-col items-center">
        <div
          className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-all duration-500"
          style={{
            borderColor: active
              ? "oklch(0.72 0.22 295)"
              : "rgba(255,255,255,0.12)",
            backgroundColor: active
              ? "oklch(0.22 0.10 290)"
              : "oklch(0.16 0.02 285)",
            boxShadow: active
              ? "0 0 16px oklch(0.62 0.24 295 / 0.45)"
              : "none",
            transitionDelay: `${delay}ms`,
          }}
        >
          {active ? (
            <CheckCircle2
              className="h-5 w-5 text-violet-400 transition-all duration-300"
              style={{ transitionDelay: `${delay + 100}ms` }}
            />
          ) : (
            <Circle className="h-5 w-5 text-white/20" />
          )}
        </div>
        {/* Linha conectora */}
        {!isLast && (
          <div className="relative mt-1 w-px flex-1 overflow-hidden rounded-full bg-white/8 min-h-[2.5rem]">
            <div
              className="absolute inset-x-0 top-0 bg-gradient-to-b from-violet-500/60 to-violet-500/10 transition-all duration-700 ease-out"
              style={{
                height: active ? "100%" : "0%",
                transitionDelay: `${delay + 200}ms`,
              }}
            />
          </div>
        )}
      </div>

      {/* ── Conteúdo da fase ── */}
      <div
        className="pb-10 transition-all duration-500"
        style={{
          opacity: active ? 1 : 0,
          transform: active ? "none" : "translateX(12px)",
          transitionDelay: `${delay + 80}ms`,
        }}
      >
        {/* Tag + quando */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className="inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-bold transition-colors duration-500"
            style={{
              borderColor: active
                ? "oklch(0.62 0.24 295 / 0.4)"
                : "rgba(255,255,255,0.1)",
              color: active ? "oklch(0.82 0.18 295)" : "rgba(255,255,255,0.4)",
              backgroundColor: active
                ? "oklch(0.22 0.10 290 / 0.5)"
                : "transparent",
              transitionDelay: `${delay}ms`,
            }}
          >
            {fase.fase}
          </span>
          {fase.quando && (
            <span className="flex items-center gap-1 text-xs text-[oklch(0.6_0.02_280)]">
              <Clock className="h-3 w-3" />
              {fase.quando}
            </span>
          )}
        </div>

        {/* Descrição */}
        {fase.descricao && (
          <p className="text-base font-semibold text-white mb-3">{fase.descricao}</p>
        )}

        {/* Itens */}
        {fase.itens && fase.itens.length > 0 && (
          <ul className="space-y-2">
            {fase.itens.map((item, j) => (
              <li
                key={j}
                className="flex items-start gap-2.5 text-sm text-[oklch(0.72_0.02_280)] transition-all duration-400"
                style={{
                  opacity: active ? 1 : 0,
                  transform: active ? "none" : "translateX(8px)",
                  transitionDelay: `${delay + 200 + j * 60}ms`,
                }}
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: active
                      ? "oklch(0.72 0.22 295)"
                      : "rgba(255,255,255,0.2)",
                    transitionDelay: `${delay + 200 + j * 60}ms`,
                  }}
                />
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface PropostaCronogramaTimelineProps {
  /** Array de fases já estruturado — tem prioridade sobre `rawContent` */
  fases?: TimelineFase[];
  /** Content bruto da seção "cronograma" do Supabase.
   *  Tenta parsear como JSON; se falhar, renderiza como texto. */
  rawContent?: string;
  titulo?: string;
  subtitulo?: string;
}

function tryParseJSON(raw: string): TimelineFase[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && "fase" in parsed[0]) {
      return parsed as TimelineFase[];
    }
    return null;
  } catch {
    return null;
  }
}

export function PropostaCronogramaTimeline({
  fases: fasesProps,
  rawContent,
  titulo = "Cronograma",
  subtitulo = "Do primeiro dia à entrega — cada etapa com propósito definido.",
}: PropostaCronogramaTimelineProps) {
  // Determina fonte dos dados
  let fases: TimelineFase[] | null = fasesProps ?? null;
  let fallbackText: string | null = null;

  if (!fases && rawContent) {
    fases = tryParseJSON(rawContent);
    if (!fases) fallbackText = rawContent;
  }

  // Se não há dados estruturados, renderiza como prose simples
  if (fallbackText) {
    return (
      <InViewFade direction="up">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-3">
              {titulo}
            </p>
            {subtitulo && (
              <p className="text-sm text-[oklch(0.65_0.02_280)]">{subtitulo}</p>
            )}
          </div>
          <div
            className="prose prose-invert max-w-none text-[oklch(0.72_0.02_280)]"
            dangerouslySetInnerHTML={{ __html: fallbackText.replace(/\n/g, "<br/>") }}
          />
        </div>
      </InViewFade>
    );
  }

  if (!fases || fases.length === 0) return null;

  return (
    <TimelineContent fases={fases} titulo={titulo} subtitulo={subtitulo} />
  );
}

// Separado para poder usar o hook useInView no nível correto
function TimelineContent({
  fases,
  titulo,
  subtitulo,
}: {
  fases: TimelineFase[];
  titulo: string;
  subtitulo?: string;
}) {
  const [containerRef, inView] = useInView(0.1);

  return (
    <div ref={containerRef} className="mx-auto max-w-2xl px-6 py-20">
      {/* Cabeçalho */}
      <InViewFade direction="up" className="mb-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-3">
          {titulo}
        </p>
        <h2
          className="text-3xl font-bold text-white"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Um plano claro,{" "}
          <span
            style={{
              background: "linear-gradient(135deg, oklch(0.82 0.18 295), oklch(0.72 0.22 330))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            do dia 1 à entrega
          </span>
        </h2>
        {subtitulo && (
          <p className="mt-3 text-sm text-[oklch(0.65_0.02_280)] max-w-md mx-auto">
            {subtitulo}
          </p>
        )}
      </InViewFade>

      {/* Timeline */}
      <div>
        {fases.map((fase, i) => (
          <FaseCard
            key={i}
            fase={fase}
            index={i}
            isLast={i === fases.length - 1}
            inView={inView}
          />
        ))}
      </div>
    </div>
  );
}

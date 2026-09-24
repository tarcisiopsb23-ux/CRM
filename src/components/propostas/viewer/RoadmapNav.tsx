/**
 * RoadmapNav — barra de progresso horizontal fixa no topo.
 *
 * Uma única linha: logo | steps com drag-to-scroll | CTA
 * Progress bar fina na base.
 *
 * Drag-to-scroll: o usuário pode arrastar a área de steps com o mouse
 * para navegar entre as etapas (esquerda/direita).
 *
 * Logo: usa hero_logo_url quando disponível; fallback para ícone ∞ + texto.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Infinity as InfinityIcon } from "lucide-react";

export interface RoadmapStep {
  id: string;
  label: string;
  phase: string;
}

interface RoadmapNavProps {
  steps: RoadmapStep[];
  logoUrl?: string | null;
  ctaText?: string;
  ctaColor?: string;
  approved?: boolean;
  onApprove?: () => void;
}

const C = {
  bg:           "oklch(0.10 0.018 285)",
  primary:      "oklch(0.72 0.22 295)",
  primaryDim:   "oklch(0.62 0.24 295)",
  text:         "oklch(0.97 0.005 270)",
  muted:        "oklch(0.68 0.02 280)",
  dimmed:       "oklch(0.42 0.02 280)",
  border:       "rgba(255,255,255,0.08)",
  borderActive: "oklch(0.62 0.24 295 / 0.5)",
};

export function RoadmapNav({
  steps,
  logoUrl,
  ctaText = "Iniciar Projeto",
  ctaColor,
  approved = false,
  onApprove,
}: RoadmapNavProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [scrolled, setScrolled]   = useState(false);
  const navRef   = useRef<HTMLDivElement>(null);

  // ── drag-to-scroll ────────────────────────────────────────────────────────
  const isDragging  = useRef(false);
  const dragStartX  = useRef(0);
  const scrollStart = useRef(0);

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    isDragging.current  = true;
    dragStartX.current  = e.clientX;
    scrollStart.current = navRef.current?.scrollLeft ?? 0;
    if (navRef.current) navRef.current.style.cursor = "grabbing";
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging.current || !navRef.current) return;
    const dx = e.clientX - dragStartX.current;
    navRef.current.scrollLeft = scrollStart.current - dx;
  }

  function stopDrag() {
    isDragging.current = false;
    if (navRef.current) navRef.current.style.cursor = "grab";
  }

  // ── IntersectionObserver: etapa ativa ────────────────────────────────────
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    steps.forEach((step, idx) => {
      const el = document.getElementById(step.id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveIdx(idx); },
        { rootMargin: "-35% 0px -50% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [steps]);

  // Scroll automático para o item ativo ficar visível na nav
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector("[data-active='true']") as HTMLElement | null;
    if (active) {
      // Centraliza o item ativo na área de scroll
      const navLeft   = nav.getBoundingClientRect().left;
      const itemLeft  = active.getBoundingClientRect().left;
      const itemWidth = active.offsetWidth;
      const navWidth  = nav.offsetWidth;
      const target    = nav.scrollLeft + (itemLeft - navLeft) - (navWidth / 2) + (itemWidth / 2);
      nav.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [activeIdx]);

  // Encolhe borda ao rolar a página
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  function scrollToSection(id: string) {
    if (isDragging.current) return; // não navega se estava arrastando
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top, behavior: "smooth" });
  }

  const pct = ((activeIdx + 1) / steps.length) * 100;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 select-none"
      style={{
        backgroundColor: scrolled ? `${C.bg}f5` : C.bg,
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${scrolled ? C.border : "transparent"}`,
        transition: "border-color 300ms, background-color 300ms",
      }}
    >
      {/* ── Linha única ──────────────────────────────────────────────────── */}
      <div className="flex items-center h-12 px-4 sm:px-5 gap-3">

        {/* Logo — usa hero_logo_url se disponível */}
        <div className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-7 max-w-[120px] object-contain"
              style={{ filter: "brightness(1.05)" }}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <InfinityIcon
                className="h-5 w-5"
                style={{ color: C.primary }}
                strokeWidth={2.5}
              />
              <span
                className="hidden sm:block text-[11px] font-bold tracking-[0.18em]"
                style={{ color: C.text }}
              >
                AGÊNCIA C8
              </span>
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="h-5 w-px shrink-0" style={{ backgroundColor: C.border }} />

        {/* ── Steps com drag-to-scroll ── */}
        <div
          ref={navRef}
          className="flex items-center gap-0.5 flex-1 overflow-x-auto"
          style={{
            scrollbarWidth: "none",
            cursor: "grab",
            WebkitOverflowScrolling: "touch",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          {steps.map((step, idx) => {
            const isActive = idx === activeIdx;
            const isDone   = idx < activeIdx;
            return (
              <button
                key={step.id}
                data-active={isActive ? "true" : undefined}
                onClick={() => scrollToSection(step.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0"
                style={{
                  backgroundColor: isActive
                    ? "oklch(0.62 0.24 295 / 0.15)"
                    : "transparent",
                  color: isActive ? C.text : isDone ? C.muted : C.dimmed,
                  // evita que o clique funcione durante drag
                  pointerEvents: "auto",
                }}
              >
                {/* Indicador numérico / check */}
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold shrink-0 transition-all duration-200"
                  style={{
                    backgroundColor: isActive
                      ? C.primaryDim
                      : isDone
                      ? "oklch(0.62 0.24 295 / 0.25)"
                      : "rgba(255,255,255,0.06)",
                    color: isActive || isDone ? C.primary : C.dimmed,
                  }}
                >
                  {isDone ? <Check className="h-2.5 w-2.5" /> : step.phase}
                </span>
                {step.label}
              </button>
            );
          })}
        </div>

        {/* CTA */}
        {!approved && onApprove && (
          <button
            onClick={onApprove}
            className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: ctaColor || C.primaryDim }}
          >
            {ctaText}
          </button>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div
        className="h-[2px] w-full"
        style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.primaryDim}, oklch(0.82 0.18 295))`,
          }}
        />
      </div>
    </header>
  );
}

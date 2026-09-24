/**
 * MetaReviewLayout
 *
 * Layout wrapper para todas as páginas da Central de Meta App Review.
 *
 * Funcionalidades:
 *   - Modo Screencast: esconde sidebar, aumenta conteúdo, exibe banner com STEP X/Y
 *   - Indicador LIVE META TEST / DEVELOPMENT MOCK
 *   - Breadcrumb de navegação
 *   - Botão Start/Stop Screencast Mode
 *
 * Uso:
 *   <MetaReviewLayout
 *     permission="pages_show_list"
 *     useCase="Show pages the authenticated user manages"
 *     group="GRUPO 2 — FACEBOOK PAGES"
 *     steps={5}
 *     currentStep={2}
 *     testMode="LIVE_META_TEST"
 *   >
 *     ...conteúdo da demonstração
 *   </MetaReviewLayout>
 */

import { useEffect, useState, createContext, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Video, VideoOff, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveMetaIndicator } from "./LiveMetaIndicator";
import type { TestMode } from "./types";
import { cn } from "@/lib/utils";

// ── Contexto de Screencast ────────────────────────────────────────────────────

interface ScreencastContextValue {
  isScreencast: boolean;
  toggleScreencast: () => void;
}

const ScreencastContext = createContext<ScreencastContextValue>({
  isScreencast: false,
  toggleScreencast: () => {},
});

export function useScreencast() {
  return useContext(ScreencastContext);
}

// ── Componente principal ──────────────────────────────────────────────────────

interface MetaReviewLayoutProps {
  children: React.ReactNode;
  permission: string;
  useCase: string;
  group: string;
  groupNumber: number;
  steps?: number;
  currentStep?: number;
  testMode?: TestMode;
  /** URL de documentação oficial da Meta */
  docsUrl?: string;
  /** Descrição curta da ação atual (destacada no screencast) */
  currentAction?: string;
  /** Permissões que foram concedidas (mostra check no header) */
  permissionGranted?: boolean;
}

export function MetaReviewLayout({
  children,
  permission,
  useCase,
  group,
  groupNumber,
  steps,
  currentStep,
  testMode = "DEVELOPMENT_MOCK",
  docsUrl,
  currentAction,
  permissionGranted = false,
}: MetaReviewLayoutProps) {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [isScreencast, setIsScreencast] = useState(() => {
    return new URLSearchParams(window.location.search).has("screencast");
  });

  const toggleScreencast = () => {
    setIsScreencast((prev) => {
      const next = !prev;
      // Atualiza URL sem reload
      const url = new URL(window.location.href);
      if (next) {
        url.searchParams.set("screencast", "1");
      } else {
        url.searchParams.delete("screencast");
      }
      window.history.replaceState({}, "", url.toString());
      return next;
    });
  };

  // Esconde sidebar do C8 Control no modo screencast
  useEffect(() => {
    const sidebar = document.querySelector("[data-sidebar]") as HTMLElement | null;
    const sidebarInset = document.querySelector("[data-sidebar-inset]") as HTMLElement | null;

    if (isScreencast) {
      if (sidebar) sidebar.style.display = "none";
      if (sidebarInset) sidebarInset.style.maxWidth = "100%";
      document.body.classList.add("screencast-mode");
    } else {
      if (sidebar) sidebar.style.display = "";
      if (sidebarInset) sidebarInset.style.maxWidth = "";
      document.body.classList.remove("screencast-mode");
    }

    return () => {
      if (sidebar) sidebar.style.display = "";
      if (sidebarInset) sidebarInset.style.maxWidth = "";
      document.body.classList.remove("screencast-mode");
    };
  }, [isScreencast]);

  return (
    <ScreencastContext.Provider value={{ isScreencast, toggleScreencast }}>
      <div className={cn("min-h-screen", isScreencast && "bg-[#0F172A]")}>

        {/* ── Banner de Screencast (topo) ── */}
        {isScreencast && (
          <div className="sticky top-0 z-50 border-b border-violet-500/30 bg-[#0a0f1e] px-6 py-3">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              {/* Identidade */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white/60 uppercase tracking-widest">
                      C8 Control · Meta App Review
                    </span>
                    <LiveMetaIndicator mode={testMode} showPulse className="text-[9px] px-1.5 py-0" />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <code className="text-xs font-mono text-violet-300">{permission}</code>
                    <span className="text-xs text-white/40">·</span>
                    <span className="text-xs text-white/60">{useCase}</span>
                  </div>
                </div>
              </div>

              {/* Step counter */}
              {steps && currentStep && (
                <div className="flex items-center gap-2">
                  {Array.from({ length: steps }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 w-2 rounded-full transition-all",
                        i < currentStep
                          ? "bg-violet-400"
                          : i === currentStep - 1
                          ? "bg-violet-500 scale-125 ring-2 ring-violet-400/30"
                          : "bg-white/10"
                      )}
                    />
                  ))}
                  <span className="ml-2 text-xs font-bold text-white/50">
                    STEP {currentStep} OF {steps}
                  </span>
                </div>
              )}

              {/* Stop */}
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleScreencast}
                className="h-7 gap-1 text-xs text-white/50 hover:text-white"
              >
                <VideoOff className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>

            {/* Ação atual destacada */}
            {currentAction && (
              <div className="mx-auto mt-2 max-w-5xl">
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2">
                  <span className="text-xs font-semibold text-violet-300">
                    → {currentAction}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Header normal (fora do screencast) ── */}
        {!isScreencast && (
          <div className="flex items-center justify-between gap-4 pb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => navigate(`/${slug}/meta-review`)}
              >
                <ChevronLeft className="h-4 w-4" />
                Meta Review
              </Button>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-xs text-muted-foreground">{group}</span>
            </div>

            <div className="flex items-center gap-2">
              <LiveMetaIndicator mode={testMode} />
              {docsUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs border-border h-7"
                  onClick={() => window.open(docsUrl, "_blank", "noopener")}
                >
                  <ExternalLink className="h-3 w-3" />
                  Meta Docs
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={toggleScreencast}
                className="gap-1.5 text-xs border-violet-500/30 text-violet-400 hover:bg-violet-500/10 h-7"
              >
                <Video className="h-3.5 w-3.5" />
                Start Screencast Mode
              </Button>
            </div>
          </div>
        )}

        {/* ── Header da permissão ── */}
        {!isScreencast && (
          <div className="mb-6 rounded-xl border border-border bg-card/50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    {group}
                  </span>
                  {permissionGranted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      Permission Granted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-primary/10 px-2 py-0.5 text-sm font-mono font-bold text-primary">
                    {permission}
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">{useCase}</p>
              </div>

              {steps && currentStep && (
                <div className="shrink-0 rounded-lg border border-border bg-secondary/20 px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Step</p>
                  <p className="text-xl font-bold tabular-nums">
                    {currentStep}
                    <span className="text-sm font-normal text-muted-foreground">/{steps}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Conteúdo ── */}
        <div className={cn(
          "space-y-6",
          isScreencast && "mx-auto max-w-5xl px-6 py-6"
        )}>
          {children}
        </div>

      </div>
    </ScreencastContext.Provider>
  );
}

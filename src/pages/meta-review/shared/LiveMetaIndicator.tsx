/**
 * LiveMetaIndicator
 *
 * Badge que indica claramente se a chamada é REAL (LIVE META TEST)
 * ou simulada (DEVELOPMENT MOCK). Esses dois modos nunca podem ser confundidos.
 */

import { cn } from "@/lib/utils";
import type { TestMode } from "./types";

interface LiveMetaIndicatorProps {
  mode: TestMode;
  className?: string;
  showPulse?: boolean;
}

export function LiveMetaIndicator({ mode, className, showPulse = true }: LiveMetaIndicatorProps) {
  const isLive = mode === "LIVE_META_TEST";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest border",
        isLive
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-amber-500/15 text-amber-400 border-amber-500/30",
        className
      )}
    >
      {/* Indicador pulsante */}
      <span className="relative flex h-2 w-2 shrink-0">
        {showPulse && isLive && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isLive ? "bg-emerald-400" : "bg-amber-400"
          )}
        />
      </span>
      {isLive ? "LIVE META TEST" : "DEVELOPMENT MOCK"}
    </div>
  );
}

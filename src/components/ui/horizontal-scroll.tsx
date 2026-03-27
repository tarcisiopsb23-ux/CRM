import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
}

export function HorizontalScroll({ children, className }: HorizontalScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [update]);

  const scroll = (dir: "left" | "right") => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  return (
    <div className="relative group">
      {/* Seta esquerda */}
      <button
        onClick={() => scroll("left")}
        className={cn(
          "absolute left-0 top-0 z-10 h-full w-14 flex items-center justify-start pl-1",
          "bg-gradient-to-r from-[#0F172A]/80 to-transparent",
          "transition-opacity duration-200",
          canLeft ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="h-8 w-8 rounded-full bg-slate-700/60 border border-slate-600/50 flex items-center justify-center backdrop-blur-sm hover:bg-slate-600/80 transition-colors">
          <ChevronLeft className="h-4 w-4 text-white" />
        </div>
      </button>

      {/* Container scroll */}
      <div
        ref={ref}
        className={cn("flex gap-4 overflow-x-auto scrollbar-none", className)}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>

      {/* Seta direita */}
      <button
        onClick={() => scroll("right")}
        className={cn(
          "absolute right-0 top-0 z-10 h-full w-14 flex items-center justify-end pr-1",
          "bg-gradient-to-l from-[#0F172A]/80 to-transparent",
          "transition-opacity duration-200",
          canRight ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="h-8 w-8 rounded-full bg-slate-700/60 border border-slate-600/50 flex items-center justify-center backdrop-blur-sm hover:bg-slate-600/80 transition-colors">
          <ChevronRight className="h-4 w-4 text-white" />
        </div>
      </button>
    </div>
  );
}

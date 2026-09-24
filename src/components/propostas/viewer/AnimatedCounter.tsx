/**
 * AnimatedCounter — anima um número de 0 até `value` quando entra na viewport.
 * Usa requestAnimationFrame. Respeita prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;       // ms — padrão 1400
  decimals?: number;       // casas decimais
  prefix?: string;         // ex: "R$ "
  suffix?: string;         // ex: "%"
  separator?: string;      // separador de milhar, ex: "."
  decimalSep?: string;     // separador decimal, ex: ","
  className?: string;
  threshold?: number;      // 0-1
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function formatNumber(
  val: number,
  decimals: number,
  separator: string,
  decimalSep: string
): string {
  const fixed = val.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return decPart !== undefined ? `${withSep}${decimalSep}${decPart}` : withSep;
}

export function AnimatedCounter({
  value,
  duration = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = ".",
  decimalSep = ",",
  className,
  threshold = 0.3,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(0);
  const hasAnimated = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion — mostrar valor final imediatamente
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCurrent(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.disconnect();

          const start = performance.now();

          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutQuart(progress);
            setCurrent(eased * value);

            if (progress < 1) {
              rafRef.current = requestAnimationFrame(tick);
            } else {
              setCurrent(value);
            }
          };

          rafRef.current = requestAnimationFrame(tick);
        }
      },
      { threshold }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, threshold]);

  const display = formatNumber(current, decimals, separator, decimalSep);

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}

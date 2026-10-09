/**
 * InViewFade — wrapper que anima filhos ao entrar na viewport.
 * CSS-only via IntersectionObserver + classes Tailwind, zero dependências externas.
 * Respeita `prefers-reduced-motion`.
 */
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

type Direction = "up" | "down" | "left" | "right" | "none";

interface InViewFadeProps {
  children: ReactNode;
  delay?: number;        // ms — para stagger entre elementos
  direction?: Direction; // sentido de entrada
  duration?: number;     // ms — padrão 600
  threshold?: number;    // 0-1, porcentagem visível para disparar
  className?: string;
  once?: boolean;        // anima apenas na 1ª vez (default true)
  as?: keyof JSX.IntrinsicElements;
}

const TRANSLATE: Record<Direction, string> = {
  up:    "translateY(32px)",
  down:  "translateY(-32px)",
  left:  "translateX(32px)",
  right: "translateX(-32px)",
  none:  "none",
};

export function InViewFade({
  children,
  delay = 0,
  direction = "up",
  duration = 600,
  threshold = 0.15,
  className,
  once = true,
  as: Tag = "div",
}: InViewFadeProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Se o usuário preferir movimento reduzido, mostrar imediatamente
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "none" : TRANSLATE[direction],
    transition: `opacity ${duration}ms ease ${delay}ms, transform ${duration}ms ease ${delay}ms`,
    willChange: "opacity, transform",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Element = Tag as any;

  return (
    <Element ref={ref} style={style} className={className}>
      {children}
    </Element>
  );
}

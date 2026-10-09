/**
 * HeroIlustrative — painel direito do hero com KPI cards fictícios animados
 * e gráfico de área mostrando crescimento.
 *
 * É puramente ILUSTRATIVO — os dados não são reais.
 * Um overlay semitransparente com a mensagem "Dados ilustrativos" cobre o painel,
 * deixando-o como segundo plano visual.
 */

import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Users, Target, DollarSign, Eye } from "lucide-react";

// ─── Paleta (mesma do viewer) ─────────────────────────────────────────────────
const C = {
  primary:    "oklch(0.72 0.22 295)",
  primaryDim: "oklch(0.62 0.24 295)",
  bgCard:     "oklch(0.16 0.025 285)",
  text:       "oklch(0.97 0.005 270)",
  muted:      "oklch(0.68 0.02 280)",
  dimmed:     "oklch(0.44 0.02 280)",
  border:     "rgba(255,255,255,0.08)",
  green:      "oklch(0.72 0.17 160)",
  red:        "oklch(0.65 0.18 25)",
};

// ─── Dados fictícios de crescimento ──────────────────────────────────────────

const CHART_DATA = [
  { mes: "Jan",  antes: 18, depois: 18 },
  { mes: "Fev",  antes: 21, depois: 24 },
  { mes: "Mar",  antes: 20, depois: 31 },
  { mes: "Abr",  antes: 22, depois: 42 },
  { mes: "Mai",  antes: 19, depois: 58 },
  { mes: "Jun",  antes: 23, depois: 74 },
  { mes: "Jul",  antes: 21, depois: 95 },
  { mes: "Ago",  antes: 24, depois: 118 },
  { mes: "Set",  antes: 22, depois: 142 },
  { mes: "Out",  antes: 25, depois: 171 },
  { mes: "Nov",  antes: 23, depois: 205 },
  { mes: "Dez",  antes: 26, depois: 244 },
];

// KPI cards fictícios
const KPI_CARDS = [
  {
    icon: Users,
    label: "Leads / mês",
    value: 245,
    delta: "+142%",
    positive: true,
    prefix: "",
    suffix: "",
    color: C.primary,
  },
  {
    icon: Target,
    label: "Taxa de conversão",
    value: 8.3,
    delta: "+3.8 p.p.",
    positive: true,
    prefix: "",
    suffix: "%",
    decimals: 1,
    color: C.green,
  },
  {
    icon: DollarSign,
    label: "Faturamento",
    value: 52200,
    delta: "+78%",
    positive: true,
    prefix: "R$ ",
    suffix: "",
    separator: ".",
    color: "oklch(0.72 0.18 55)",
  },
  {
    icon: Eye,
    label: "Custo por lead",
    value: 12.4,
    delta: "-38%",
    positive: false,
    prefix: "R$ ",
    suffix: "",
    decimals: 1,
    color: C.red,
    positiveIsDown: true,
  },
];

// ─── Hook: animated number ────────────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 1600, delay = 0) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        setVal(eased * target);
        if (p < 1) raf.current = requestAnimationFrame(tick);
        else setVal(target);
      };
      raf.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(t);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration, delay]);

  return val;
}

function formatVal(
  v: number,
  prefix = "",
  suffix = "",
  decimals = 0,
  separator = "."
): string {
  const fixed = v.toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${prefix}${dec !== undefined ? `${withSep},${dec}` : withSep}${suffix}`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, delta, positive, prefix, suffix,
  decimals = 0, separator, color, positiveIsDown = false, delay = 0,
}: (typeof KPI_CARDS)[0] & { delay?: number }) {
  const animated = useAnimatedNumber(value, 1600, delay);
  const isGood = positiveIsDown ? !positive : positive;

  return (
    <div
      className="rounded-xl border p-3 flex items-center gap-3"
      style={{ borderColor: C.border, backgroundColor: C.bgCard }}
    >
      <div
        className="h-8 w-8 shrink-0 grid place-items-center rounded-lg"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] truncate" style={{ color: C.dimmed }}>{label}</p>
        <p className="text-base font-bold leading-tight" style={{ color: C.text }}>
          {formatVal(animated, prefix, suffix, decimals, separator ?? ".")}
        </p>
      </div>
      <span
        className="text-[11px] font-semibold shrink-0 px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: isGood ? "oklch(0.72 0.17 160 / 0.15)" : "oklch(0.65 0.18 25 / 0.15)",
          color: isGood ? C.green : C.red,
        }}
      >
        {delta}
      </span>
    </div>
  );
}

// ─── Tooltip customizado ──────────────────────────────────────────────────────

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-xl"
      style={{ borderColor: C.border, backgroundColor: "oklch(0.18 0.03 285)" }}
    >
      <p className="mb-1" style={{ color: C.dimmed }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  /** Reservado para uso futuro — não exibido no cabeçalho */
  clientName?: string;
}

export function HeroIlustrative({ clientName }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Inicia animação após 400ms (dá tempo ao hero montar)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateX(24px)",
        transition: "opacity 800ms ease 200ms, transform 800ms ease 200ms",
      }}
    >
      {/* ── Conteúdo do painel ── */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ borderColor: C.border, backgroundColor: "oklch(0.14 0.022 285)" }}>

        {/* Header do painel */}
        <div className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: C.border }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: C.primary }} />
            <span className="text-xs font-semibold" style={{ color: C.text }}>
              Projeção de crescimento
            </span>
          </div>
          <span className="text-[10px] rounded-full px-2 py-0.5 border"
            style={{ borderColor: "oklch(0.72 0.17 160 / 0.3)", color: C.green, backgroundColor: "oklch(0.72 0.17 160 / 0.1)" }}>
            +{((CHART_DATA[11].depois / CHART_DATA[0].depois - 1) * 100).toFixed(0)}%
          </span>
        </div>

        {/* Gráfico */}
        <div className="px-2 pt-3 pb-1" style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={CHART_DATA} margin={{ top: 0, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gradDepois" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="oklch(0.72 0.22 295)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.72 0.22 295)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradAntes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="rgba(255,255,255,0.15)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="rgba(255,255,255,0.05)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="mes" tick={{ fill: "oklch(0.44 0.02 280)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.44 0.02 280)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="antes" name="Sem C8"
                stroke="rgba(255,255,255,0.2)" strokeWidth={1.5}
                fill="url(#gradAntes)" dot={false}
              />
              <Area
                type="monotone" dataKey="depois" name="Com C8"
                stroke="oklch(0.72 0.22 295)" strokeWidth={2.5}
                fill="url(#gradDepois)"
                dot={false}
                activeDot={{ r: 4, fill: "oklch(0.82 0.18 295)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 px-4 pb-3 text-[10px]" style={{ color: C.dimmed }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full inline-block" style={{ backgroundColor: C.primary }} />
            Com C8
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full inline-block" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
            Sem C8
          </span>
          <span className="ml-auto">Leads / mês (estimado)</span>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t" style={{ borderColor: C.border }}>
          {KPI_CARDS.map((kpi, i) => (
            <KpiCard key={i} {...kpi} delay={600 + i * 150} />
          ))}
        </div>
      </div>

      {/* ── Overlay ilustrativo ──
          Fina camada sobre o painel, sem cobrir o conteúdo dos cards.
          Badge posicionado ABAIXO do painel, fora do overlay. */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ backgroundColor: "oklch(0.12 0.02 285 / 0.22)" }}
      />

      {/* Badge "Dados ilustrativos" — abaixo do painel, fora do overlay */}
      <div className="mt-2 flex justify-center">
        <div
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold"
          style={{
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "oklch(0.14 0.022 285)",
            color: C.dimmed,
          }}
        >
          <Eye className="h-3 w-3" />
          Dados ilustrativos — não representam resultados garantidos
        </div>
      </div>
    </div>
  );
}

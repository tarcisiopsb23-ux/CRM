/**
 * ProjecaoChart — gráficos de projeção dinâmicos para a proposta pública.
 *
 * Recebe o JSON `projecoes` do campo JSONB da tabela proposals.
 * Formato esperado (todos os campos são opcionais — o componente renderiza
 * apenas o que estiver presente):
 *
 * {
 *   kpis?: Array<{ label: string; value: number; prefix?: string; suffix?: string }>,
 *   comparativo?: {
 *     label_antes?: string;
 *     label_depois?: string;
 *     items: Array<{ metric: string; antes: number; depois: number; suffix?: string }>
 *   },
 *   crescimento?: {
 *     label?: string;
 *     data: Array<{ mes: string; valor: number }>
 *   },
 *   roi?: {
 *     investimento: number;
 *     retorno_estimado: number;
 *     prazo_meses: number;
 *   }
 * }
 *
 * Se o campo `projecoes` for null/undefined o componente retorna null silenciosamente.
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { AnimatedCounter } from "./AnimatedCounter";
import { InViewFade } from "./InViewFade";
import { TrendingUp, BarChart3, Target } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ProjecaoKpi {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}

export interface ComparativoItem {
  metric: string;
  antes: number;
  depois: number;
  suffix?: string;
}

export interface ProjecaoData {
  kpis?: ProjecaoKpi[];
  comparativo?: {
    label_antes?: string;
    label_depois?: string;
    items: ComparativoItem[];
  };
  crescimento?: {
    label?: string;
    data: Array<{ mes: string; valor: number }>;
  };
  roi?: {
    investimento: number;
    retorno_estimado: number;
    prazo_meses: number;
  };
}

// ─── Tooltip customizado ──────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[oklch(0.18_0.03_285)] px-4 py-3 text-sm shadow-xl">
      <p className="mb-1 text-xs font-medium text-[oklch(0.65_0.02_280)]">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold text-white">
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString("pt-BR") : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── KPIs numéricos ───────────────────────────────────────────────────────────

function KpiCards({ kpis }: { kpis: ProjecaoKpi[] }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, minmax(0, 1fr))` }}
    >
      {kpis.map((kpi, i) => (
        <InViewFade key={i} delay={i * 100} direction="up">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-500/10 blur-2xl" />
            <p className="relative text-3xl font-bold text-white">
              <AnimatedCounter
                value={kpi.value}
                prefix={kpi.prefix}
                suffix={kpi.suffix}
                decimals={Number.isInteger(kpi.value) ? 0 : 1}
              />
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[oklch(0.65_0.02_280)]">
              {kpi.label}
            </p>
          </div>
        </InViewFade>
      ))}
    </div>
  );
}

// ─── Gráfico de crescimento (área) ────────────────────────────────────────────

function CrescimentoAreaChart({
  data,
  label,
}: {
  data: Array<{ mes: string; valor: number }>;
  label?: string;
}) {
  return (
    <InViewFade direction="up" delay={100}>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-violet-400" />
          <p className="text-sm font-semibold text-white">
            {label ?? "Projeção de crescimento"}
          </p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gradViolet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.62 0.24 295)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="oklch(0.62 0.24 295)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="mes"
              tick={{ fill: "oklch(0.65 0.02 280)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.65 0.02 280)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="valor"
              name="Valor"
              stroke="oklch(0.72 0.22 295)"
              strokeWidth={2.5}
              fill="url(#gradViolet)"
              dot={{ fill: "oklch(0.72 0.22 295)", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: "oklch(0.82 0.18 295)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="mt-3 text-center text-xs text-[oklch(0.5_0.02_280)]">
          * Estimativas baseadas em benchmarks do setor. Não constituem garantia de resultado.
        </p>
      </div>
    </InViewFade>
  );
}

// ─── Comparativo antes x depois (barras agrupadas) ───────────────────────────

function ComparativoBarChart({
  items,
  labelAntes,
  labelDepois,
}: {
  items: ComparativoItem[];
  labelAntes: string;
  labelDepois: string;
}) {
  const data = items.map((it) => ({
    name: it.metric,
    [labelAntes]: it.antes,
    [labelDepois]: it.depois,
    suffix: it.suffix ?? "",
  }));

  return (
    <InViewFade direction="up" delay={150}>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-violet-400" />
          <p className="text-sm font-semibold text-white">
            Comparativo: {labelAntes} × {labelDepois}
          </p>
        </div>
        <div className="mb-4 flex items-center gap-6 text-xs">
          <span className="flex items-center gap-1.5 text-[oklch(0.65_0.02_280)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.45_0.08_280)]" />
            {labelAntes}
          </span>
          <span className="flex items-center gap-1.5 text-[oklch(0.65_0.02_280)]">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
            {labelDepois}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barGap={4} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: "oklch(0.65 0.02 280)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.65 0.02 280)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={labelAntes} radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((_, i) => (
                <Cell key={i} fill="oklch(0.42 0.07 285)" />
              ))}
            </Bar>
            <Bar dataKey={labelDepois} radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((_, i) => (
                <Cell key={i} fill="oklch(0.72 0.22 295)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-3 text-center text-xs text-[oklch(0.5_0.02_280)]">
          * Estimativas baseadas em benchmarks do setor. Não constituem garantia de resultado.
        </p>
      </div>
    </InViewFade>
  );
}

// ─── ROI card ─────────────────────────────────────────────────────────────────

function RoiCard({
  investimento,
  retorno_estimado,
  prazo_meses,
}: {
  investimento: number;
  retorno_estimado: number;
  prazo_meses: number;
}) {
  const roi = ((retorno_estimado - investimento) / investimento) * 100;
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <InViewFade direction="up" delay={200}>
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-[oklch(0.22_0.06_290)] to-[oklch(0.18_0.03_285)] p-8 shadow-[0_20px_60px_-20px_oklch(0.62_0.24_295_/_0.5)]">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <Target className="h-8 w-8 text-violet-400 mb-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-2">
            Retorno estimado
          </p>
          <p className="text-4xl font-bold text-white">
            <AnimatedCounter
              value={roi}
              suffix="%"
              decimals={0}
            />
            <span className="ml-2 text-lg font-medium text-violet-300">ROI</span>
          </p>
          <p className="mt-1 text-sm text-[oklch(0.65_0.02_280)]">
            em {prazo_meses} {prazo_meses === 1 ? "mês" : "meses"}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl bg-white/5 p-4">
              <p className="text-xs text-[oklch(0.55_0.02_280)] mb-1">Investimento total</p>
              <p className="font-semibold text-white">{fmtBRL(investimento)}</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
              <p className="text-xs text-emerald-400 mb-1">Retorno estimado</p>
              <p className="font-bold text-emerald-300">{fmtBRL(retorno_estimado)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[oklch(0.5_0.02_280)]">
            * Estimativa baseada em benchmarks. Não constitui garantia de resultado.
          </p>
        </div>
      </div>
    </InViewFade>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ProjecaoChartProps {
  projecoes: ProjecaoData | null | undefined;
}

export function ProjecaoChart({ projecoes }: ProjecaoChartProps) {
  if (!projecoes) return null;

  const { kpis, comparativo, crescimento, roi } = projecoes;
  const hasContent = kpis?.length || comparativo?.items?.length || crescimento?.data?.length || roi;
  if (!hasContent) return null;

  const labelAntes = comparativo?.label_antes ?? "Antes";
  const labelDepois = comparativo?.label_depois ?? "Com C8";

  return (
    <section className="py-20 border-t border-white/5">
      <div className="mx-auto max-w-5xl px-6 space-y-12">
        {/* Cabeçalho */}
        <InViewFade direction="up">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400 mb-3">
              Projeção de resultados
            </p>
            <h2
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              O que você pode alcançar
            </h2>
            <p className="mt-3 text-sm text-[oklch(0.65_0.02_280)] max-w-xl mx-auto">
              Estimativas baseadas em benchmarks do setor e casos similares.
              Os números reais dependem de execução, mercado e sazonalidade.
            </p>
          </div>
        </InViewFade>

        {/* KPIs */}
        {kpis && kpis.length > 0 && <KpiCards kpis={kpis} />}

        {/* Grid: crescimento + comparativo */}
        {(crescimento?.data?.length || comparativo?.items?.length) && (
          <div
            className={`grid gap-6 ${
              crescimento && comparativo ? "lg:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {crescimento?.data?.length && (
              <CrescimentoAreaChart data={crescimento.data} label={crescimento.label} />
            )}
            {comparativo?.items?.length && (
              <ComparativoBarChart
                items={comparativo.items}
                labelAntes={labelAntes}
                labelDepois={labelDepois}
              />
            )}
          </div>
        )}

        {/* ROI */}
        {roi && (
          <RoiCard
            investimento={roi.investimento}
            retorno_estimado={roi.retorno_estimado}
            prazo_meses={roi.prazo_meses}
          />
        )}
      </div>
    </section>
  );
}

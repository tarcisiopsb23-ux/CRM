import { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bot, MessageCircle, Target, TrendingUp, Lightbulb,
  Clock, ArrowUp, ArrowDown, Users, CheckCircle2, DollarSign,
} from "lucide-react";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import type { ConversationKpiTotals, ConversationTrendPoint } from "@/hooks/useClientConversationKpis";

const pct = (v: number) => `${v.toFixed(1)}%`;
const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const PREVIEW_LIMIT = 4;
const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook",
};

export interface SourceKpi { source: string; value: number; }
interface CanalGrupo { leads: number; fechados: number; valor: number; conversao: number; }
interface PorStatus {
  novo: number; contato: number; proposta: number;
  negociacao: number; fechado: number; perdido: number;
}
interface Props {
  totals: ConversationKpiTotals;
  trend: ConversationTrendPoint[];
  byCampaign: Array<{
    campaign: string; conversations: number; leads_identified: number;
    conversions: number; conversion_rate: number;
  }>;
  bySource: SourceKpi[];
  byAgent: Array<{
    agent_name: string; conversations_started: number;
    conversations_finished: number; conversions: number; conversion_rate: number;
  }>;
  isLoading: boolean;
  hasData: boolean;
  hasN8n: boolean;
  canalData?: {
    manual: CanalGrupo; auto: CanalGrupo;
    tempoMedioVidaDias: number | null;
    totalContatos: number; conversas: number; porStatus: PorStatus;
  };
  theme?: "dark" | "light";
  dateRange?: { from: string; to: string };
}

function KpiCard({ icon: Icon, label, value, sub, theme, color = "text-white", alert }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  theme: "dark" | "light"; color?: string; alert?: boolean;
}) {
  const bg = theme === "dark" ? "bg-white/5 border border-white/10" : "bg-card border border-border";
  return (
    <div className={`rounded-xl p-4 ${bg} ${alert ? "ring-2 ring-red-500/40" : ""} relative`}>
      {alert && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${theme === "dark" ? "text-white/60" : "text-muted-foreground"}`} />
        <p className={`text-[10px] uppercase tracking-widest font-bold ${theme === "dark" ? "text-white/50" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-black ${theme === "dark" ? color : "text-foreground"}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-1 ${theme === "dark" ? "text-white/40" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, theme }: { children: React.ReactNode; theme: "dark" | "light" }) {
  return (
    <p className={`text-xs uppercase font-black tracking-widest mb-4 ${theme === "dark" ? "text-white/50" : "text-muted-foreground"}`}>
      {children}
    </p>
  );
}



export function ConversationKpiDashboard({
  totals, trend, byCampaign, bySource, byAgent,
  isLoading, hasData, hasN8n, canalData, theme = "dark", dateRange,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const tp = theme === "dark" ? "text-white" : "text-foreground";
  const ts = theme === "dark" ? "text-white/60" : "text-muted-foreground";
  const cb = theme === "dark" ? "bg-white/5 border border-white/10" : "bg-card border border-border";
  const gs = theme === "dark" ? "rgba(255,255,255,0.08)" : "hsl(220 20% 90%)";
  const ac = theme === "dark" ? "#ffffff80" : "#94a3b8";
  const thCls = `text-[10px] uppercase font-black tracking-widest border-b pb-3 ${theme === "dark" ? "border-white/10 text-white/40" : "border-border text-muted-foreground"}`;
  const tbCls = `divide-y ${theme === "dark" ? "divide-white/5" : "divide-border"}`;
  const rhCls = `text-sm ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-muted/50"} transition-colors`;
  const rb = (r: number) =>
    `text-xs font-black px-2 py-0.5 rounded ${r >= 20 ? "bg-emerald-500/10 text-emerald-400" : r >= 10 ? "bg-amber-500/10 text-amber-400" : "bg-slate-500/10 text-slate-400"}`;

  const fmtDias = (d: number) => {
    if (d < 1) return `${Math.round(d * 24)}h`;
    if (d < 30) return `${d.toFixed(1)}d`;
    return `${(d / 30).toFixed(1)} meses`;
  };

  // Funil com todas as etapas do CRM
  const ps = canalData?.porStatus;
  const funnelSteps = [
    { label: "Leads (total)", value: ps ? (ps.novo + ps.contato + ps.proposta + ps.negociacao + ps.fechado + ps.perdido) : 0, color: "#3b82f6" },
    { label: "Contato", value: ps?.contato ?? 0, color: "#6366f1" },
    { label: "Proposta", value: ps?.proposta ?? 0, color: "#a855f7" },
    { label: "Negociação", value: ps?.negociacao ?? 0, color: "#f59e0b" },
    { label: "Fechado", value: ps?.fechado ?? 0, color: "#10b981" },
  ];

  // Taxa de performance: avanço entre etapas consecutivas (identifica gargalos)
  const performanceBarData = funnelSteps.slice(1).map((step, i) => {
    const prev = funnelSteps[i].value;
    const taxa = parseFloat((prev > 0 ? (step.value / prev) * 100 : 0).toFixed(1));
    // Verde ≥50%, Amarelo ≥25%, Vermelho <25%
    const fill = taxa >= 50 ? "#10b981" : taxa >= 25 ? "#f59e0b" : "#ef4444";
    return {
      name: `${funnelSteps[i].label} → ${step.label}`,
      taxa,
      prev: funnelSteps[i].value,
      curr: step.value,
      fill,
    };
  });

  // Comparativo manual vs auto
  const hasComparativo = canalData && (canalData.manual.leads > 0 || canalData.auto.leads > 0);
  const comparativoData = [
    { name: "Contatos", Manual: canalData?.manual.leads ?? 0, Auto: canalData?.auto.leads ?? 0 },
    { name: "Fechados", Manual: canalData?.manual.fechados ?? 0, Auto: canalData?.auto.fechados ?? 0 },
    { name: "Conv. %", Manual: parseFloat((canalData?.manual.conversao ?? 0).toFixed(1)), Auto: parseFloat((canalData?.auto.conversao ?? 0).toFixed(1)) },
  ];

  // Desempenho no último dia do período selecionado
  const todayPoint = trend[trend.length - 1];
  const yesterdayPoint = trend[trend.length - 2];

  // Label do período selecionado
  const periodLabel = dateRange
    ? `${format(new Date(dateRange.from), "dd/MM/yyyy")} → ${format(new Date(dateRange.to), "dd/MM/yyyy")}`
    : null;

  const insights = useMemo(() => {
    const list: { type: "error" | "warn" | "positive"; msg: string; icon: string }[] = [];
    if (totals.conversion_rate > 0 && totals.conversion_rate < 10)
      list.push({ type: "error", icon: "🔴", msg: `Taxa de conversão crítica: ${pct(totals.conversion_rate)} abaixo de 10%` });
    const best = [...byCampaign].sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
    if (best && best.conversion_rate > 0)
      list.push({ type: "positive", icon: "✅", msg: `Campanha "${best.campaign}" tem maior eficiência (${pct(best.conversion_rate)})` });
    if (totals.lead_rate > 50)
      list.push({ type: "positive", icon: "✅", msg: `Alta qualificação: ${pct(totals.lead_rate)} dos contatos viram leads` });
    if (hasN8n && totals.automation_rate > 0 && totals.automation_rate < 50)
      list.push({ type: "warn", icon: "🟡", msg: `Automação abaixo de 50%: bot finalizou apenas ${pct(totals.automation_rate)} das conversas` });
    if (canalData?.tempoMedioVidaDias != null && canalData.tempoMedioVidaDias > 30)
      list.push({ type: "warn", icon: "🟡", msg: `Tempo médio de atendimento elevado: ${fmtDias(canalData.tempoMedioVidaDias)}` });
    if (ps && ps.perdido > ps.fechado && (ps.perdido + ps.fechado) > 0)
      list.push({ type: "error", icon: "🔴", msg: `Mais leads perdidos (${ps.perdido}) do que fechados (${ps.fechado}) no período` });
    if (trend.length >= 7) {
      const half = Math.floor(trend.length / 2);
      const f = trend.slice(0, half).reduce((a, b) => a + b.conversions, 0) / half;
      const s = trend.slice(half).reduce((a, b) => a + b.conversions, 0) / (trend.length - half);
      const d = f > 0 ? ((s - f) / f) * 100 : 0;
      if (d < -10) list.push({ type: "error", icon: "🔴", msg: `Conversão caiu ${Math.abs(d).toFixed(0)}% na segunda metade do período` });
      else if (d > 10) list.push({ type: "positive", icon: "✅", msg: `Conversão cresceu ${d.toFixed(0)}% na segunda metade do período` });
    }
    if (list.length === 0)
      list.push({ type: "positive", icon: "ℹ️", msg: "Sem alertas no momento. Continue monitorando os indicadores." });
    return list;
  }, [hasData, canalData, byCampaign, totals, hasN8n, trend, ps]);

  if (isLoading) return <p className={`text-sm ${ts} text-center py-12`}>Carregando dados...</p>;

  return (
    <div className="space-y-6">

      {/* ── 1. KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Original 3 */}
        <KpiCard theme={theme} icon={MessageCircle} label="Conversas" value={(canalData?.conversas ?? 0).toLocaleString("pt-BR")} sub="leads que iniciaram contato" />
        <KpiCard theme={theme} icon={Target} label="Leads" value={totals.leads_identified.toLocaleString("pt-BR")} sub={pct(totals.lead_rate) + " dos contatos"} color="text-blue-400" />
        <KpiCard theme={theme} icon={TrendingUp} label="Conversões" value={totals.conversions.toLocaleString("pt-BR")} sub={pct(totals.conversion_rate) + " dos leads"} color="text-purple-400" alert={totals.conversions > 0 && totals.conversion_rate < 10} />
        {/* Valor Gerado */}
        <KpiCard theme={theme} icon={DollarSign} label="Valor Gerado" value={fmtBRL((canalData?.manual.valor ?? 0) + (canalData?.auto.valor ?? 0))} sub="fechamentos no período" color="text-emerald-400" />
        {/* Taxa de Conversão */}
        <KpiCard theme={theme} icon={CheckCircle2} label="Taxa de Conversão" value={pct(totals.conversion_rate)} sub={`${totals.conversions} de ${totals.leads_identified} leads`} color="text-amber-400" alert={totals.conversions > 0 && totals.conversion_rate < 10} />
      </div>

      {/* ── 2. Funil + Performance lado a lado ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-stretch">
        {/* Funil visual — ocupa toda a altura da coluna */}
        <div className={`rounded-xl p-5 ${cb} flex flex-col`}>
          <SectionTitle theme={theme}>Funil de Conversão</SectionTitle>
          <div className="flex-1 flex flex-col justify-center">
            <ModernFunnel
            textVariant="white"
            steps={[
              {
                label: "Leads (total)",
                value: funnelSteps[0].value.toLocaleString("pt-BR"),
                color: "bg-slate-700",
                width: "w-full",
                percentage: funnelSteps[1].value > 0 && funnelSteps[0].value > 0
                  ? pct((funnelSteps[1].value / funnelSteps[0].value) * 100) : "0%",
                rateLabel: "→ Contato",
              },
              {
                label: "Contato",
                value: funnelSteps[1].value.toLocaleString("pt-BR"),
                color: "bg-indigo-500/40",
                width: "w-[85%]",
                percentage: funnelSteps[2].value > 0 && funnelSteps[1].value > 0
                  ? pct((funnelSteps[2].value / funnelSteps[1].value) * 100) : "0%",
                rateLabel: "→ Proposta",
              },
              {
                label: "Proposta",
                value: funnelSteps[2].value.toLocaleString("pt-BR"),
                color: "bg-purple-500/40",
                width: "w-[70%]",
                percentage: funnelSteps[3].value > 0 && funnelSteps[2].value > 0
                  ? pct((funnelSteps[3].value / funnelSteps[2].value) * 100) : "0%",
                rateLabel: "→ Negoc.",
              },
              {
                label: "Negociação",
                value: funnelSteps[3].value.toLocaleString("pt-BR"),
                color: "bg-amber-500/40",
                width: "w-[55%]",
                percentage: funnelSteps[4].value > 0 && funnelSteps[3].value > 0
                  ? pct((funnelSteps[4].value / funnelSteps[3].value) * 100) : "0%",
                rateLabel: "→ Fechado",
              },
              {
                label: "Fechado",
                value: funnelSteps[4].value.toLocaleString("pt-BR"),
                color: "bg-emerald-500/40",
                width: "w-[40%]",
              },
            ]}
          />
          </div>
          <div className={`mt-4 pt-3 border-t ${theme === "dark" ? "border-white/10" : "border-border"} flex items-center justify-between`}>
            <span className={`text-[10px] uppercase font-black tracking-widest ${ts}`}>Perdidos</span>
            <span className="text-sm font-black text-red-400">{ps?.perdido ?? 0}</span>
          </div>
        </div>

        {/* Coluna direita: Insights + Taxa de performance — mesma altura total do funil */}
        <div className="flex flex-col gap-6">
          {/* Insights e Alertas — flex-1 para dividir espaço igualmente */}
          <div className={`rounded-xl p-5 ${cb} flex-1 flex flex-col`}>
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className={`h-4 w-4 ${ts}`} />
              <SectionTitle theme={theme}>Insights e Alertas</SectionTitle>
            </div>
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                  ins.type === "error" ? "bg-red-500/10 border border-red-500/20" :
                  ins.type === "warn" ? "bg-amber-500/10 border border-amber-500/20" :
                  theme === "dark" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-muted/50 border border-border"
                }`}>
                  <span className="text-sm">{ins.icon}</span>
                  <p className={`text-xs ${tp}`}>{ins.msg}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Taxa de performance */}
          <div className={`rounded-xl p-5 ${cb} flex-1 flex flex-col`}>
            <SectionTitle theme={theme}>Taxa de Performance</SectionTitle>
            <p className={`text-[10px] -mt-2 mb-4 ${ts}`}>Avanço entre etapas — identifica gargalos no processo</p>
            <div className="space-y-3">
              {performanceBarData.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-bold ${tp}`}>{d.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] ${ts}`}>{d.prev} → {d.curr}</span>
                      <span className="text-xs font-black" style={{ color: d.fill }}>{d.taxa}%</span>
                    </div>
                  </div>
                  <div className={`h-5 rounded-lg overflow-hidden ${theme === "dark" ? "bg-white/5" : "bg-muted"}`}>
                    <div
                      className="h-5 rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(d.taxa, 1)}%`, backgroundColor: d.fill + "cc" }}
                    >
                      {d.taxa >= 12 && (
                        <span className="text-[9px] font-black text-white">{d.taxa}%</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className={`flex items-center gap-4 mt-4 pt-3 border-t ${theme === "dark" ? "border-white/10" : "border-border"}`}>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">● ≥50% bom</span>
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">● ≥25% atenção</span>
              <span className="flex items-center gap-1 text-[10px] text-red-400 font-bold">● &lt;25% gargalo</span>
            </div>
          </div>
        </div>
      </div>



      {/* ── 5. Tempo médio de atendimento ── */}
      <div className={`rounded-xl p-5 ${cb}`}>
        <SectionTitle theme={theme}>Tempo Médio de Atendimento</SectionTitle>
        <p className={`text-[10px] -mt-2 mb-4 ${ts}`}>Da abertura ao fechamento — leads fechados e perdidos</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`rounded-lg p-4 ${theme === "dark" ? "bg-white/5" : "bg-muted/50"} col-span-2 md:col-span-1`}>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <p className={`text-[10px] uppercase font-black tracking-widest ${ts}`}>Tempo Médio</p>
            </div>
            <p className="text-3xl font-black text-amber-400">
              {canalData?.tempoMedioVidaDias != null ? fmtDias(canalData.tempoMedioVidaDias) : "—"}
            </p>
            <p className={`text-[10px] mt-1 ${ts}`}>
              {canalData ? `${(ps?.fechado ?? 0) + (ps?.perdido ?? 0)} leads concluídos` : "sem dados"}
            </p>
          </div>
          <div className={`rounded-lg p-4 ${theme === "dark" ? "bg-white/5" : "bg-muted/50"}`}>
            <p className={`text-[10px] uppercase font-black tracking-widest ${ts}`}>Fechados</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{ps?.fechado ?? 0}</p>
            <p className={`text-[10px] mt-1 ${ts}`}>leads ganhos</p>
          </div>
          <div className={`rounded-lg p-4 ${theme === "dark" ? "bg-white/5" : "bg-muted/50"}`}>
            <p className={`text-[10px] uppercase font-black tracking-widest ${ts}`}>Perdidos</p>
            <p className="text-2xl font-black text-red-400 mt-1">{ps?.perdido ?? 0}</p>
            <p className={`text-[10px] mt-1 ${ts}`}>leads perdidos</p>
          </div>
          <div className={`rounded-lg p-4 ${theme === "dark" ? "bg-white/5" : "bg-muted/50"}`}>
            <p className={`text-[10px] uppercase font-black tracking-widest ${ts}`}>Taxa Fechamento</p>
            {(() => {
              const total = (ps?.fechado ?? 0) + (ps?.perdido ?? 0);
              const taxa = total > 0 ? ((ps?.fechado ?? 0) / total) * 100 : null;
              return (
                <>
                  <p className={`text-2xl font-black mt-1 ${taxa != null && taxa >= 50 ? "text-emerald-400" : "text-orange-400"}`}>
                    {taxa != null ? pct(taxa) : "—"}
                  </p>
                  <p className={`text-[10px] mt-1 ${ts}`}>dos concluídos</p>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── 6. Canal de entrada ── */}
      <div className={`rounded-xl p-5 ${cb} space-y-4`}>
        <SectionTitle theme={theme}>Canal de Entrada</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            { label: "Manual (QR / CSV)", data: canalData?.manual ?? { leads: 0, fechados: 0, valor: 0, conversao: 0 } },
            { label: "Automação (n8n)", data: canalData?.auto ?? { leads: 0, fechados: 0, valor: 0, conversao: 0 } },
          ] as const).map(({ label, data }) => (
            <div key={label} className={`rounded-lg p-4 ${theme === "dark" ? "bg-white/5" : "bg-muted/50"}`}>
              <p className={`text-[10px] uppercase font-black tracking-widest mb-3 ${ts}`}>{label}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className={ts}>Contatos</p><p className={`font-black ${tp}`}>{data.leads}</p></div>
                <div><p className={ts}>Fechados</p><p className="font-black text-emerald-400">{data.fechados}</p></div>
                <div><p className={ts}>Valor</p><p className={`font-black ${tp}`}>{fmtBRL(data.valor)}</p></div>
                <div><p className={ts}>Conversão</p><p className="font-black text-purple-400">{pct(data.conversao)}</p></div>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-white/10">
          <p className={`text-[10px] uppercase font-black tracking-widest mb-3 ${ts}`}>Distribuição por Status</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {(["novo", "contato", "proposta", "negociacao", "fechado", "perdido"] as const).map((status) => (
              <div key={status} className={`rounded-lg p-2 text-center ${theme === "dark" ? "bg-white/5" : "bg-muted/50"}`}>
                <p className={`text-[9px] uppercase font-black tracking-widest ${ts}`}>{status}</p>
                <p className={`text-lg font-black ${tp}`}>{ps?.[status] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 7. Comparativo automação vs manual ── */}
      <div className={`rounded-xl p-5 ${cb}`}>
        <SectionTitle theme={theme}>Comparativo: Manual vs Automação</SectionTitle>
        {hasComparativo ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={comparativoData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gs} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: ac, fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: ac, fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: theme === "dark" ? "#0F172A" : "#fff", border: "1px solid #334155", borderRadius: "8px" }} />
              <Legend iconType="circle" />
              <Bar dataKey="Manual" name="Manual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Auto" name="Automação" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-40">
            <Bot className="h-8 w-8" />
            <p className={`text-xs ${ts} text-center`}>Sem dados de automação no período</p>
          </div>
        )}
      </div>

      {/* ── 8. Evolução diária ── */}
      <div className={`rounded-xl p-5 ${cb}`}>
        <SectionTitle theme={theme}>Evolução Diária</SectionTitle>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} /><stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gs} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: ac, fontSize: 11 }}
                tickFormatter={(s) => { try { return format(new Date(s), "dd/MM"); } catch { return String(s); } }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: ac, fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: theme === "dark" ? "#0F172A" : "#fff", border: "1px solid #334155", borderRadius: "8px" }} />
              <Legend iconType="circle" />
              <Area type="monotone" dataKey="conversations" name="Conversas" stroke="#10b981" strokeWidth={2} fillOpacity={0} />
              <Area type="monotone" dataKey="leads_identified" name="Leads" stroke="#3b82f6" strokeWidth={2} fill="url(#gLeads)" fillOpacity={1} />
              <Area type="monotone" dataKey="conversions" name="Conversões" stroke="#a855f7" strokeWidth={2} fill="url(#gConv)" fillOpacity={1} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-40">
            <TrendingUp className="h-8 w-8" />
            <p className={`text-xs ${ts} text-center`}>Sem dados de evolução no período</p>
          </div>
        )}
      </div>




    </div>
  );
}

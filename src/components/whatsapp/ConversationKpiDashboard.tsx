import { useState, useMemo } from "react";
import {
  AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import {
  Bot, Users, MessageCircle, Target, TrendingUp, ArrowRightLeft, X,
  Clock, Lightbulb, Zap,
} from "lucide-react";
import { SalesFunnel } from "@/components/ui/sales-funnel";
import type { ConversationKpiTotals, ConversationTrendPoint } from "@/hooks/useClientConversationKpis";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pct = (v: number) => `${v.toFixed(1)}%`;
const PREVIEW_LIMIT = 4;

const fmtMin = (min: number) => {
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResponseTimings {
  avg_first_response_min: number;   // tempo médio até 1ª resposta
  avg_resolution_min: number;       // tempo médio até finalização
  avg_transfer_min: number;         // tempo médio até transferência p/ humano
}

export interface SourceKpi {
  source: string;
  value: number;
  qualification_rate?: number;  // % lead válido
  conversion_rate?: number;     // conversão por origem
}

interface Props {
  totals: ConversationKpiTotals;
  trend: ConversationTrendPoint[];
  byCampaign: Array<{ campaign: string; conversations: number; leads_identified: number; conversions: number; conversion_rate: number }>;
  bySource: SourceKpi[];
  byAgent: Array<{ agent_name: string; conversations_started: number; conversations_finished: number; conversions: number; conversion_rate: number }>;
  timings?: ResponseTimings;
  isLoading: boolean;
  hasData: boolean;
  theme?: "dark" | "light";
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function TableModal({ open, onClose, title, theme, children }: {
  open: boolean; onClose: () => void; title: string;
  theme: "dark" | "light"; children: React.ReactNode;
}) {
  if (!open) return null;
  const panelBg = theme === "dark" ? "bg-[#1e293b] border border-white/10" : "bg-white border border-border";
  const titleCls = theme === "dark" ? "text-white" : "text-foreground";
  const closeCls = theme === "dark" ? "text-white/50 hover:text-white" : "text-muted-foreground hover:text-foreground";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col ${panelBg}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme === "dark" ? "border-white/10" : "border-border"}`}>
          <p className={`text-sm font-bold ${titleCls}`}>{title}</p>
          <button onClick={onClose} className={`rounded-full p-1 transition-colors ${closeCls}`}><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, theme, color = "text-white", alert }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  theme: "dark" | "light"; color?: string; alert?: boolean;
}) {
  const bg = theme === "dark" ? "bg-white/5 border border-white/10" : "bg-card border border-border";
  const alertBorder = alert ? "ring-2 ring-red-500/40" : "";
  return (
    <div className={`rounded-xl p-4 ${bg} ${alertBorder} relative`}>
      {alert && (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
      )}
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${theme === "dark" ? "text-white/60" : "text-muted-foreground"}`} />
        <p className={`text-[10px] uppercase tracking-widest font-bold ${theme === "dark" ? "text-white/50" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-black ${theme === "dark" ? color : "text-foreground font-bold"}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-1 ${theme === "dark" ? "text-white/40" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConversationKpiDashboard({
  totals, trend, byCampaign, bySource, byAgent, timings, isLoading, hasData, theme = "dark",
}: Props) {
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [showAllAgents, setShowAllAgents] = useState(false);

  const textPrimary   = theme === "dark" ? "text-white"    : "text-foreground";
  const textSecondary = theme === "dark" ? "text-white/60" : "text-muted-foreground";
  const cardBg        = theme === "dark" ? "bg-white/5 border border-white/10" : "bg-card border border-border";
  const gridStroke    = theme === "dark" ? "rgba(255,255,255,0.08)" : "hsl(220 20% 90%)";
  const axisColor     = theme === "dark" ? "#ffffff80" : undefined;
  const theadCls      = `text-[10px] uppercase font-black tracking-widest border-b ${theme === "dark" ? "border-white/10 text-white/40" : "border-border text-muted-foreground"}`;
  const tbodyCls      = `divide-y ${theme === "dark" ? "divide-white/5" : "divide-border"}`;
  const rowHover      = `text-sm ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-muted/50"} transition-colors`;

  const rateBadge = (rate: number) =>
    `text-xs font-black px-2 py-0.5 rounded ${rate >= 20 ? "bg-emerald-500/10 text-emerald-400" : rate >= 10 ? "bg-amber-500/10 text-amber-400" : "bg-slate-500/10 text-slate-400"}`;

  const verMaisBtn = (onClick: () => void) => (
    <button onClick={onClick}
      className={`mt-3 w-full text-[11px] font-bold py-2 rounded-lg border transition-colors ${theme === "dark" ? "border-white/10 text-white/50 hover:bg-white/5 hover:text-white" : "border-border text-muted-foreground hover:bg-muted"}`}>
      Ver Mais
    </button>
  );

  // ── Qualidade da automação ──────────────────────────────────────────────────
  const botConvRate = totals.bot_finished > 0
    ? (totals.conversions * (1 - totals.transfer_rate / 100)) / totals.bot_finished * 100
    : 0;
  const humanConvRate = totals.human_transfer > 0
    ? (totals.conversions * (totals.transfer_rate / 100)) / totals.human_transfer * 100
    : 0;
  const humanVsBot = botConvRate > 0 ? humanConvRate / botConvRate : 0;

  // ── Alertas automáticos ─────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    if (!hasData) return [];
    const list: { type: "error" | "warn" | "positive"; msg: string; icon: string }[] = [];

    // Alertas graves (vermelho)
    if (totals.conversion_rate < 10)
      list.push({ type: "error", icon: "🔴", msg: `Taxa de conversão crítica: ${pct(totals.conversion_rate)} — abaixo de 10%` });
    if (timings && timings.avg_first_response_min > 10)
      list.push({ type: "error", icon: "🔴", msg: `Tempo de 1ª resposta crítico: ${fmtMin(timings.avg_first_response_min)} (ideal < 5min)` });

    // Alertas leves (amarelo)
    if (totals.transfer_rate > 40)
      list.push({ type: "warn", icon: "🟡", msg: `Alta taxa de transferência: ${pct(totals.transfer_rate)} das conversas vão para atendente` });
    if (totals.automation_rate < 50)
      list.push({ type: "warn", icon: "🟡", msg: `Automação abaixo de 50%: bot finalizou apenas ${pct(totals.automation_rate)} das conversas` });
    if (timings && timings.avg_first_response_min > 5 && timings.avg_first_response_min <= 10)
      list.push({ type: "warn", icon: "🟡", msg: `Tempo de 1ª resposta elevado: ${fmtMin(timings.avg_first_response_min)} (ideal < 5min)` });

    return list;
  }, [hasData, totals, timings]);

  // ── Insights automáticos ────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!hasData) return [];
    const list: { type: "error" | "warn" | "positive"; msg: string; icon: string }[] = [];

    const bestCampaign = [...byCampaign].sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
    if (bestCampaign)
      list.push({ type: "positive", icon: "✅", msg: `Campanha "${bestCampaign.campaign}" tem maior eficiência (${pct(bestCampaign.conversion_rate)})` });

    if (humanVsBot > 1.2)
      list.push({ type: "positive", icon: "✅", msg: `Atendente converte ${humanVsBot.toFixed(1)}x mais que o bot` });
    else if (humanVsBot > 0 && humanVsBot < 0.8)
      list.push({ type: "warn", icon: "🟡", msg: `Bot converte melhor que atendente — considere reduzir transferências` });

    if (totals.lead_rate > 50)
      list.push({ type: "positive", icon: "✅", msg: `Alta qualificação: ${pct(totals.lead_rate)} dos contatos viram leads` });

    const bestSource = [...bySource].sort((a, b) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0))[0];
    if (bestSource?.conversion_rate)
      list.push({ type: "positive", icon: "✅", msg: `${SOURCE_LABELS[bestSource.source] ?? bestSource.source} tem melhor conversão por origem (${pct(bestSource.conversion_rate)})` });

    if (trend.length >= 7) {
      const half = Math.floor(trend.length / 2);
      const firstHalf = trend.slice(0, half).reduce((a, b) => a + b.conversions, 0) / half;
      const secondHalf = trend.slice(half).reduce((a, b) => a + b.conversions, 0) / (trend.length - half);
      const delta = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
      if (delta < -10)
        list.push({ type: "error", icon: "🔴", msg: `Conversão caiu ${Math.abs(delta).toFixed(0)}% na segunda metade do período` });
      else if (delta > 10)
        list.push({ type: "positive", icon: "✅", msg: `Conversão cresceu ${delta.toFixed(0)}% na segunda metade do período` });
    }

    return list;
  }, [hasData, byCampaign, bySource, totals, humanVsBot, trend]);

  if (isLoading) return <p className={`text-sm ${textSecondary} text-center py-12`}>Carregando dados de conversas...</p>;

  const emptyState = (icon: React.ReactNode, msg: string) => (
    <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-40">
      {icon}
      <p className={`text-xs ${textSecondary} text-center`}>{msg}</p>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard theme={theme} icon={MessageCircle} label="Conversas"        value={totals.conversations.toLocaleString("pt-BR")}    sub="Total iniciadas" />
        <KpiCard theme={theme} icon={Bot}           label="Bot"              value={totals.bot_finished.toLocaleString("pt-BR")}     sub={pct(totals.automation_rate) + " automação"} color="text-emerald-400" />
        <KpiCard theme={theme} icon={Users}         label="Atendente"           value={totals.human_transfer.toLocaleString("pt-BR")}   sub={pct(totals.transfer_rate) + " transferência"} color="text-amber-400" alert={hasData && totals.transfer_rate > 40} />
        <KpiCard theme={theme} icon={Target}        label="Leads de Campanha" value={totals.leads_identified.toLocaleString("pt-BR")} sub={pct(totals.lead_rate) + " dos contatos"} color="text-blue-400" />
        <KpiCard theme={theme} icon={TrendingUp}    label="Conversões"       value={totals.conversions.toLocaleString("pt-BR")}      sub={pct(totals.conversion_rate) + " dos leads"} color="text-purple-400" alert={hasData && totals.conversion_rate < 10} />
      </div>

      {/* ── Tempo de Resposta + Qualidade da Automação + Insights ── */}
      <div className="grid grid-cols-4 gap-6">
        {/* Qualidade da Automação */}
        <div className={`col-span-4 lg:col-span-1 rounded-xl ${cardBg} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Zap className={`h-4 w-4 ${textSecondary}`} />
            <p className={`text-sm font-bold ${textPrimary}`}>Qualidade da Automação</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className={`rounded-xl p-4 ${theme === "dark" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200"}`}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 mb-1">Conversão só Bot</p>
              <p className="text-2xl font-black text-emerald-400">{pct(botConvRate)}</p>
              <p className={`text-[10px] mt-1 ${textSecondary}`}>Conversões sem intervenção humana</p>
            </div>
            <div className={`rounded-xl p-4 ${theme === "dark" ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-1">Conversão após Atendente</p>
              <p className="text-2xl font-black text-amber-400">{pct(humanConvRate)}</p>
              <p className={`text-[10px] mt-1 ${textSecondary}`}>Conversões com atendimento de atendente</p>
            </div>
            <div className={`rounded-xl p-4 ${theme === "dark" ? "bg-purple-500/10 border border-purple-500/20" : "bg-purple-50 border border-purple-200"}`}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-purple-400 mb-1">Atendente vs Bot</p>
              <p className="text-2xl font-black text-purple-400">{humanVsBot > 0 ? `${humanVsBot.toFixed(1)}x` : "—"}</p>
              <p className={`text-[10px] mt-1 ${textSecondary}`}>
                {humanVsBot > 1 ? "Atendente converte mais" : humanVsBot > 0 ? "Bot converte mais" : "Sem dados suficientes"}
              </p>
            </div>
          </div>
        </div>

        {/* Tempo de Resposta */}
        <div className={`col-span-4 lg:col-span-1 rounded-xl ${cardBg} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className={`h-4 w-4 ${textSecondary}`} />
            <p className={`text-sm font-bold ${textPrimary}`}>Tempo de Resposta</p>
          </div>
          {!timings ? emptyState(<Clock className={`h-8 w-8 ${textSecondary}`} />, "Dados de tempo não disponíveis.\nEnvie via n8n.") : (
          <div className="grid grid-cols-1 gap-4">
              {[
                { label: "1ª Resposta",            value: timings.avg_first_response_min, ideal: 5,   color: "text-blue-400",    bg: "bg-blue-500/10" },
                { label: "Finalização",             value: timings.avg_resolution_min,    ideal: 120, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "Transferência p/ Atendente", value: timings.avg_transfer_min,      ideal: 10,  color: "text-amber-400",   bg: "bg-amber-500/10" },
              ].map(({ label, value, ideal, color, bg }) => {
                const ok = value <= ideal;
                return (
                  <div key={label} className={`rounded-xl p-4 ${bg} relative`}>
                    {!ok && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                    <p className={`text-[10px] uppercase tracking-widest font-bold ${textSecondary} mb-1`}>{label}</p>
                    <p className={`text-2xl font-black ${color}`}>{fmtMin(value)}</p>
                    <p className={`text-[10px] mt-1 ${ok ? "text-emerald-400" : "text-red-400"}`}>
                      {ok ? `✓ ideal (< ${fmtMin(ideal)})` : `⚠ acima do ideal (< ${fmtMin(ideal)})`}
                    </p>
                  </div>
                );
              })}
          </div>
          )}
        </div>

        {/* Insights do Período */}
        <div className={`col-span-4 lg:col-span-2 rounded-xl ${cardBg} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            <p className={`text-sm font-bold ${textPrimary}`}>Insights e Alertas do Período</p>
          </div>
          {[...alerts, ...insights].length === 0
            ? emptyState(<Lightbulb className={`h-8 w-8 ${textSecondary}`} />, "Nenhum insight disponível.\nAcumule dados para gerar análises automáticas.")
            : (
            <div className="space-y-2">
              {[...alerts, ...insights].map((item, i) => {
                const styles = item.type === "error"
                  ? { bg: theme === "dark" ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200", text: "text-red-400" }
                  : item.type === "warn"
                  ? { bg: theme === "dark" ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200", text: "text-amber-400" }
                  : { bg: theme === "dark" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200", text: "text-emerald-400" };
                return (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl ${styles.bg}`}>
                    <span className="text-sm shrink-0">{item.icon}</span>
                    <p className={`text-sm ${styles.text}`}>{item.msg}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`rounded-xl ${cardBg} p-5`}>
          <p className={`text-sm font-bold ${textPrimary} mb-4`}>Taxas de Performance</p>
          <div className="space-y-4">
            {[
              { label: "Taxa de Automação",    value: totals.automation_rate,  desc: "Conversas finalizadas pelo bot",  color: "bg-emerald-500" },
              { label: "Taxa de Transferência",value: totals.transfer_rate,    desc: "Conversas passadas para atendente",  color: "bg-amber-500" },
              { label: "Taxa de Lead",         value: totals.lead_rate,        desc: "Contatos que viraram leads",      color: "bg-blue-500" },
              { label: "Taxa de Conversão",    value: totals.conversion_rate,  desc: "Leads que converteram",           color: "bg-purple-500" },
            ].map(({ label, value, desc, color }) => (
              <div key={label}>
                <div className="flex justify-between mb-1">
                  <span className={`text-xs ${textSecondary}`}>{label}</span>
                  <span className={`text-xs font-bold ${textPrimary}`}>{pct(value)}</span>
                </div>
                <div className={`h-1.5 rounded-full ${theme === "dark" ? "bg-white/10" : "bg-muted"}`}>
                  <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
                </div>
                <p className={`text-[10px] ${textSecondary} mt-0.5`}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-xl ${cardBg} p-5`}>
          <p className={`text-sm font-bold ${textPrimary} mb-4`}>Funil de Atendimento</p>
          <SalesFunnel steps={[
            { label: "Conversas",         value: totals.conversations,    rateLabel: "Lead" },
            { label: "Leads",             value: totals.leads_identified, rateLabel: "Conv." },
            { label: "Atendimento Humano",    value: totals.human_transfer,   rateLabel: "Conv." },
            { label: "Conversões",        value: totals.conversions,      rateLabel: "" },
          ]} />
        </div>
      </div>

      {/* ── Origem das Conversas ── */}
      <div className={`rounded-xl ${cardBg} p-5`}>
        <p className={`text-sm font-bold ${textPrimary} mb-4`}>Origem das Conversas</p>
        {bySource.length === 0
          ? emptyState(<ArrowRightLeft className={`h-8 w-8 ${textSecondary}`} />, "Nenhuma origem registrada.\nEnvie o campo \"source\" via n8n.")
          : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {bySource.map(({ source, value, qualification_rate, conversion_rate: srcConv }) => (
              <div key={source} className={`rounded-xl ${theme === "dark" ? "bg-white/5 border border-white/10" : "bg-muted/50 border border-border"} p-4`}>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRightLeft className={`h-4 w-4 ${textSecondary} shrink-0`} />
                  <p className={`text-[10px] uppercase tracking-widest font-bold ${textSecondary}`}>{SOURCE_LABELS[source] ?? source}</p>
                </div>
                <p className={`text-2xl font-black ${textPrimary} mb-3`}>{value.toLocaleString("pt-BR")}</p>
                <div className={`space-y-1.5 pt-3 border-t ${theme === "dark" ? "border-white/10" : "border-border"}`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] ${textSecondary}`}>Qualificação</span>
                    <span className={`text-[10px] font-black ${qualification_rate != null ? (qualification_rate >= 40 ? "text-emerald-400" : "text-amber-400") : textSecondary}`}>
                      {qualification_rate != null ? pct(qualification_rate) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] ${textSecondary}`}>Conversão</span>
                    <span className={`text-[10px] font-black ${srcConv != null ? (srcConv >= 20 ? "text-emerald-400" : "text-amber-400") : textSecondary}`}>
                      {srcConv != null ? pct(srcConv) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Campanhas + Atendentes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campanhas */}
        <div className={`rounded-xl ${cardBg} p-5`}>
          <p className={`text-sm font-bold ${textPrimary} mb-4`}>Conversões por Campanha</p>
          {byCampaign.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Target className={`h-8 w-8 ${textSecondary} opacity-30`} />
              <p className={`text-xs ${textSecondary}`}>Nenhuma campanha no período.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={theadCls}>
                      <th className="pb-3">Campanha</th>
                      <th className="pb-3 text-center">Conversas</th>
                      <th className="pb-3 text-center">Leads</th>
                      <th className="pb-3 text-center">Conv.</th>
                      <th className="pb-3 text-right">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyCls}>
                    {byCampaign.slice(0, PREVIEW_LIMIT).map(c => (
                      <tr key={c.campaign} className={rowHover}>
                        <td className={`py-3 font-bold ${textPrimary} max-w-[140px] truncate`} title={c.campaign}>{c.campaign}</td>
                        <td className={`py-3 text-center ${textSecondary}`}>{c.conversations.toLocaleString("pt-BR")}</td>
                        <td className="py-3 text-center font-bold text-blue-400">{c.leads_identified.toLocaleString("pt-BR")}</td>
                        <td className="py-3 text-center font-bold text-emerald-400">{c.conversions.toLocaleString("pt-BR")}</td>
                        <td className="py-3 text-right"><span className={rateBadge(c.conversion_rate)}>{c.conversion_rate.toFixed(1)}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {byCampaign.length > PREVIEW_LIMIT && verMaisBtn(() => setShowAllCampaigns(true))}
            </>
          )}
        </div>

        {/* Atendentes */}
        <div className={`rounded-xl ${cardBg} p-5`}>
          <p className={`text-sm font-bold ${textPrimary} mb-4`}>Performance dos Atendentes</p>
          {byAgent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Users className={`h-8 w-8 ${textSecondary} opacity-30`} />
              <p className={`text-xs ${textSecondary}`}>Nenhum dado de atendente disponível.</p>
              <p className={`text-[10px] ${textSecondary} opacity-60`}>Envie o campo "agents" via n8n.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={theadCls}>
                      <th className="pb-3">Atendente</th>
                      <th className="pb-3 text-center">Iniciadas</th>
                      <th className="pb-3 text-center">Finalizadas</th>
                      <th className="pb-3 text-center">Conv.</th>
                      <th className="pb-3 text-right">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyCls}>
                    {byAgent.slice(0, PREVIEW_LIMIT).map(a => (
                      <tr key={a.agent_name} className={rowHover}>
                        <td className={`py-3 font-bold ${textPrimary}`}>{a.agent_name}</td>
                        <td className={`py-3 text-center ${textSecondary}`}>{a.conversations_started.toLocaleString("pt-BR")}</td>
                        <td className={`py-3 text-center ${textSecondary}`}>{a.conversations_finished.toLocaleString("pt-BR")}</td>
                        <td className="py-3 text-center font-bold text-emerald-400">{a.conversions.toLocaleString("pt-BR")}</td>
                        <td className="py-3 text-right"><span className={rateBadge(a.conversion_rate)}>{a.conversion_rate.toFixed(1)}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {byAgent.length > PREVIEW_LIMIT && verMaisBtn(() => setShowAllAgents(true))}
            </>
          )}
        </div>
      </div>

      {/* ── Modais ── */}
      <TableModal open={showAllCampaigns} onClose={() => setShowAllCampaigns(false)} title="Conversões por Campanha" theme={theme}>
        <table className="w-full text-left border-collapse">
          <thead><tr className={theadCls}>
            <th className="pb-3">Campanha</th>
            <th className="pb-3 text-center">Conversas</th>
            <th className="pb-3 text-center">Leads</th>
            <th className="pb-3 text-center">Conv.</th>
            <th className="pb-3 text-right">Taxa</th>
          </tr></thead>
          <tbody className={tbodyCls}>
            {byCampaign.map(c => (
              <tr key={c.campaign} className={rowHover}>
                <td className={`py-3 font-bold ${textPrimary}`}>{c.campaign}</td>
                <td className={`py-3 text-center ${textSecondary}`}>{c.conversations.toLocaleString("pt-BR")}</td>
                <td className="py-3 text-center font-bold text-blue-400">{c.leads_identified.toLocaleString("pt-BR")}</td>
                <td className="py-3 text-center font-bold text-emerald-400">{c.conversions.toLocaleString("pt-BR")}</td>
                <td className="py-3 text-right"><span className={rateBadge(c.conversion_rate)}>{c.conversion_rate.toFixed(1)}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableModal>

      <TableModal open={showAllAgents} onClose={() => setShowAllAgents(false)} title="Performance dos Atendentes" theme={theme}>
        <table className="w-full text-left border-collapse">
          <thead><tr className={theadCls}>
            <th className="pb-3">Atendente</th>
            <th className="pb-3 text-center">Iniciadas</th>
            <th className="pb-3 text-center">Finalizadas</th>
            <th className="pb-3 text-center">Conv.</th>
            <th className="pb-3 text-right">Taxa</th>
          </tr></thead>
          <tbody className={tbodyCls}>
            {byAgent.map(a => (
              <tr key={a.agent_name} className={rowHover}>
                <td className={`py-3 font-bold ${textPrimary}`}>{a.agent_name}</td>
                <td className={`py-3 text-center ${textSecondary}`}>{a.conversations_started.toLocaleString("pt-BR")}</td>
                <td className={`py-3 text-center ${textSecondary}`}>{a.conversations_finished.toLocaleString("pt-BR")}</td>
                <td className="py-3 text-center font-bold text-emerald-400">{a.conversions.toLocaleString("pt-BR")}</td>
                <td className="py-3 text-right"><span className={rateBadge(a.conversion_rate)}>{a.conversion_rate.toFixed(1)}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableModal>

      {/* ── Crescimento Diário ── */}
      <div className={`rounded-xl ${cardBg} p-5`}>
        <p className={`text-sm font-bold ${textPrimary} mb-4`}>Crescimento Diário</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="date" fontSize={11} tick={{ fill: axisColor }} tickFormatter={d => format(new Date(d + "T00:00:00"), "dd/MM")} />
            <YAxis fontSize={11} tick={{ fill: axisColor }} />
            <Tooltip
              contentStyle={theme === "dark" ? { background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 } : undefined}
              labelStyle={theme === "dark" ? { color: "#fff" } : undefined}
              labelFormatter={l => format(new Date(l + "T00:00:00"), "dd/MM/yyyy")}
            />
            <Legend wrapperStyle={theme === "dark" ? { color: "#ffffff80" } : undefined} />
            <Area type="monotone" dataKey="conversations"    name="Conversas"  stroke="#94a3b8" fill="none"            strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="leads_identified" name="Leads"      stroke="#3b82f6" fill="url(#gradLeads)" strokeWidth={2}   dot={false} />
            <Area type="monotone" dataKey="conversions"      name="Conversões" stroke="#10b981" fill="url(#gradConv)"  strokeWidth={2}   dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

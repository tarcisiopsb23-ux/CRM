import { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ArrowDown, ArrowUp, BarChart3, Briefcase, Calendar,
  CheckCircle2, DollarSign, Info, KanbanSquare, ListFilter,
  MessageCircle as MessageCircleIcon, MousePointerClick,
  PieChart, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import {
  Tooltip as ShadcnTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import { MessageCircle } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DEMO_CLIENT, DEMO_LEADS, DEMO_KPIS, DEMO_KPI_HISTORY,
  DEMO_DAILY_METRICS, DEMO_CAMPAIGNS, DEMO_CONVERSATION_ROWS,
  DEMO_AGENT_KPIS, DEMO_AD_CLICK_STATS, getDemoFunnelStats,
} from "@/lib/demoData";
import type { Lead } from "@/components/crm/types";
import { COLUMNS } from "@/components/crm/types";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { LeadCard } from "@/components/crm/LeadCard";
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";

const isLowerBetter = (name: string) => /cac|cpa|cpl|cpc|cpm|custo/i.test(name);
const KPI_COLORS = ["#10b981","#7C3AED","#f59e0b","#a855f7","#f43f5e","#06b6d4","#e879f9","#34d399"];

// ─── Period Dropdown ──────────────────────────────────────────────────────────
function PeriodDropdown({ dateRange, onChange }: { dateRange: { from: string; to: string }; onChange: (r: { from: string; to: string }) => void }) {
  const presets = [
    { label: "Últimos 7 dias",  from: format(subDays(new Date(), 6), "yyyy-MM-dd"),               to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 30 dias", from: format(subDays(new Date(), 29), "yyyy-MM-dd"),              to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 60 dias", from: format(subDays(new Date(), 59), "yyyy-MM-dd"),              to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 90 dias", from: format(subDays(new Date(), 89), "yyyy-MM-dd"),              to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 6 meses", from: format(subMonths(new Date(), 6), "yyyy-MM-dd"),             to: format(new Date(), "yyyy-MM-dd") },
    { label: "Último ano",      from: format(subMonths(new Date(), 12), "yyyy-MM-dd"),            to: format(new Date(), "yyyy-MM-dd") },
    { label: "Mês atual",       from: format(startOfMonth(new Date()), "yyyy-MM-dd"),             to: format(endOfMonth(new Date()), "yyyy-MM-dd") },
    { label: "Mês anterior",    from: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), to: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") },
  ];
  const activePreset = presets.find(p => p.from === dateRange.from && p.to === dateRange.to);
  const label = activePreset ? activePreset.label : "Personalizado";
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 gap-2 bg-slate-800/80 border border-slate-700 text-slate-200 hover:bg-slate-700 text-[11px] font-bold px-3 min-w-[160px] justify-between">
            <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-white" />{label}</div>
            <span className="text-slate-500">▾</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-[#1E293B] border-slate-700 text-slate-200 w-52 shadow-2xl p-1" align="start">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-500 px-2 py-1.5">Períodos sugeridos</DropdownMenuLabel>
          {presets.map(p => (
            <DropdownMenuItem key={p.label}
              className={cn("text-sm font-medium cursor-pointer rounded-lg px-3 py-2 focus:bg-slate-700", activePreset?.label === p.label && "bg-[#7C3AED]/20 text-[#7C3AED] font-bold")}
              onClick={() => onChange({ from: p.from, to: p.to })}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-lg px-3 h-9">
        <input type="date" value={dateRange.from} onChange={e => onChange({ ...dateRange, from: e.target.value })} className="date-input-white bg-transparent text-[11px] font-bold text-slate-300 focus:outline-none w-[112px]" />
        <span className="text-slate-600 text-xs">→</span>
        <input type="date" value={dateRange.to} onChange={e => onChange({ ...dateRange, to: e.target.value })} className="date-input-white bg-transparent text-[11px] font-bold text-slate-300 focus:outline-none w-[112px]" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, info, highlight = false }: any) {
  return (
    <Card className={cn("border-slate-800 shadow-lg relative group overflow-hidden", highlight ? "bg-[#a855f7] text-white ring-2 ring-[#a855f7]/50" : "bg-[#1E293B] text-slate-100")}>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className={cn("p-2 rounded-lg", highlight ? "bg-white/20" : "bg-slate-800")}>{icon}</div>
          <ShadcnTooltip>
            <TooltipTrigger asChild>
              <button className={cn("rounded-full p-1 transition-colors", highlight ? "hover:bg-white/20 text-purple-300/60" : "hover:bg-purple-500/10 text-purple-400/60 hover:text-purple-400")}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] text-xs bg-slate-900 border-slate-800 text-white shadow-2xl">{info}</TooltipContent>
          </ShadcnTooltip>
        </div>
        <div>
          <p className={cn("text-[10px] uppercase font-black tracking-widest", highlight ? "text-white/70" : "text-slate-500")}>{label}</p>
          <p className="text-2xl font-black mt-1 leading-none">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function InsightItem({ icon, text }: any) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="mt-0.5">{icon}</div>
      <p className="text-sm text-slate-300 leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Main Demo Page ───────────────────────────────────────────────────────────
export function DemoPage() {
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 29), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });
  const [activeTab, setActiveTab] = useState<"performance" | "atendimento" | "crm">("crm");
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);
  const [demoLeads, setDemoLeads] = useState<Lead[]>(DEMO_LEADS);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Filter daily metrics by date range
  const filteredMetrics = useMemo(() =>
    DEMO_DAILY_METRICS.filter(d => d.date >= dateRange.from && d.date <= dateRange.to),
    [dateRange]
  );

  const filteredCampaigns = useMemo(() =>
    DEMO_CAMPAIGNS.filter(d => d.date >= dateRange.from && d.date <= dateRange.to),
    [dateRange]
  );

  const totals = useMemo(() => filteredMetrics.reduce((acc, curr) => ({
    spend: acc.spend + curr.total_spend,
    leads: acc.leads + curr.total_leads,
    sales: acc.sales + curr.total_sales,
    revenue: acc.revenue + curr.revenue,
    impressions: acc.impressions + curr.impressions,
    clicks: acc.clicks + curr.clicks,
  }), { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 }), [filteredMetrics]);

  const funnelStats = useMemo(() => getDemoFunnelStats(demoLeads), [demoLeads]);

  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "0.0";
  const conversionRate = totals.leads > 0 ? ((totals.sales / totals.leads) * 100).toFixed(1) : "0.0";
  const cpa = totals.sales > 0 ? (totals.spend / totals.sales).toFixed(0) : "0";

  // Campaign aggregation
  const campaignMap = new Map<string, { platform: string; name: string; spend: number; leads: number; sales: number; revenue: number }>();
  for (const c of filteredCampaigns) {
    const key = c.name;
    const existing = campaignMap.get(key) ?? { platform: c.platform, name: c.name, spend: 0, leads: 0, sales: 0, revenue: 0 };
    campaignMap.set(key, {
      ...existing,
      spend: existing.spend + c.spend,
      leads: existing.leads + (c.leads ?? 0),
      sales: existing.sales + (c.sales ?? 0),
      revenue: existing.revenue + c.revenue,
    });
  }
  const aggregatedCampaigns = Array.from(campaignMap.values()).sort((a, b) => b.spend - a.spend);

  // KPI cards
  const kpiCards = useMemo(() => DEMO_KPIS.map((kpi, idx) => {
    const entries = DEMO_KPI_HISTORY.filter(h => h.kpi_id === kpi.id).sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
    const current = entries[0]?.value ?? null;
    const prev = entries.length >= 2 ? entries[1].value : entries.length === 1 ? 0 : null;
    const growth = current !== null && prev !== null ? (prev !== 0 ? ((current - prev) / prev) * 100 : current > 0 ? 100 : 0) : null;
    return { ...kpi, current, prev, growth, color: KPI_COLORS[idx % KPI_COLORS.length] };
  }), []);

  const kpiSparkline = useMemo(() => {
    const allMonths = DEMO_KPI_HISTORY.map(h => String(h.month_year).slice(0, 7));
    const uniqueMonths = [...new Set(allMonths)].sort().slice(-12);
    const byKpi = new Map<string, { month: string; value: number }[]>();
    for (const kpi of DEMO_KPIS) {
      byKpi.set(kpi.id, uniqueMonths.map(mk => ({
        month: mk,
        value: DEMO_KPI_HISTORY.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value ?? 0,
      })));
    }
    return byKpi;
  }, []);

  const longTermData = useMemo(() => {
    const allMonths = DEMO_KPI_HISTORY.map(h => String(h.month_year).slice(0, 7));
    const uniqueMonths = [...new Set(allMonths)].sort().slice(-12);
    return uniqueMonths.map(monthStr => {
      const point: any = { name: format(parseISO(monthStr + "-01"), "MMM/yy", { locale: ptBR }) };
      DEMO_KPIS.forEach(kpi => {
        const h = DEMO_KPI_HISTORY.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(monthStr));
        point[kpi.name] = h ? h.value : null;
      });
      return point;
    });
  }, []);

  // Conversation KPIs from mock rows
  const filteredConvRows = useMemo(() =>
    DEMO_CONVERSATION_ROWS.filter(r => r.period_date >= dateRange.from && r.period_date <= dateRange.to),
    [dateRange]
  );

  const convTotals = useMemo(() => {
    const conversations = filteredConvRows.reduce((a, r) => a + r.conversations, 0);
    const bot_finished = filteredConvRows.reduce((a, r) => a + r.bot_finished, 0);
    const human_transfer = filteredConvRows.reduce((a, r) => a + r.human_transfer, 0);
    const leads_identified = filteredConvRows.reduce((a, r) => a + r.leads_identified, 0);
    const conversions = filteredConvRows.reduce((a, r) => a + r.conversions, 0);
    return {
      conversations, bot_finished, human_transfer, leads_identified, conversions,
      automation_rate: conversations > 0 ? (bot_finished / conversations) * 100 : 0,
      transfer_rate: conversations > 0 ? (human_transfer / conversations) * 100 : 0,
      conversion_rate: leads_identified > 0 ? (conversions / leads_identified) * 100 : 0,
      lead_rate: conversations > 0 ? (leads_identified / conversations) * 100 : 0,
    };
  }, [filteredConvRows]);

  const convTrend = useMemo(() => filteredConvRows.map(r => ({
    date: r.period_date,
    conversations: r.conversations,
    leads_identified: r.leads_identified,
    conversions: r.conversions,
  })), [filteredConvRows]);

  const convByCampaign = useMemo(() => {
    const map = new Map<string, { conversations: number; leads_identified: number; conversions: number }>();
    for (const r of filteredConvRows) {
      const key = r.campaign ?? "Orgânico";
      const e = map.get(key) ?? { conversations: 0, leads_identified: 0, conversions: 0 };
      map.set(key, { conversations: e.conversations + r.conversations, leads_identified: e.leads_identified + r.leads_identified, conversions: e.conversions + r.conversions });
    }
    return Array.from(map.entries()).map(([campaign, v]) => ({
      campaign, ...v, conversion_rate: v.leads_identified > 0 ? (v.conversions / v.leads_identified) * 100 : 0,
    }));
  }, [filteredConvRows]);

  const convBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredConvRows) map.set(r.source, (map.get(r.source) ?? 0) + r.conversations);
    return Array.from(map.entries()).map(([source, value]) => ({ source, value }));
  }, [filteredConvRows]);

  const convByAgent = useMemo(() => DEMO_AGENT_KPIS.map(a => ({
    ...a, conversion_rate: a.conversations_started > 0 ? (a.conversions / a.conversations_started) * 100 : 0,
  })), []);

  const canalData = useMemo(() => {
    const leads = demoLeads.filter(l => l.created_at >= dateRange.from && l.created_at <= dateRange.to + "T23:59:59");
    const isAuto = (o: string | null) => o != null && /n8n|automa/i.test(o);
    const manual = leads.filter(l => !isAuto(l.origin));
    const auto = leads.filter(l => isAuto(l.origin));
    const calcGrupo = (g: Lead[]) => {
      const fechados = g.filter(l => l.status === "fechado");
      const valor = fechados.reduce((a, l) => a + (l.proposal_value ?? 0), 0);
      return { leads: g.length, fechados: fechados.length, valor, conversao: g.length > 0 ? (fechados.length / g.length) * 100 : 0 };
    };
    const count = (s: string) => leads.filter(l => l.status === s).length;
    return {
      manual: calcGrupo(manual), auto: calcGrupo(auto),
      tempoMedioVidaDias: 12.4,
      totalContatos: leads.length,
      conversas: leads.filter(l => l.status !== "novo").length,
      porStatus: { novo: count("novo"), contato: count("contato"), proposta: count("proposta"), negociacao: count("negociacao"), fechado: count("fechado"), perdido: count("perdido") },
    };
  }, [demoLeads, dateRange]);

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.id as Lead["status"]] = demoLeads.filter(l => l.status === c.id);
    return acc;
  }, {} as Record<Lead["status"], Lead[]>);

  const handleDragStart = (e: DragStartEvent) => setActiveLead(demoLeads.find(l => l.id === e.active.id) ?? null);
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = COLUMNS.find(c => c.id === over.id)?.id as Lead["status"] | undefined;
    if (!newStatus) return;
    setDemoLeads(prev => prev.map(l => l.id === active.id ? { ...l, status: newStatus } : l));
  };

  const fmtVal = (v: number, unit: string) =>
    unit === "currency" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
    : unit === "percentage" ? `${v}%` : String(v);

  const selectedKpi = DEMO_KPIS.find(k => k.id === (activeKpiId ?? DEMO_KPIS[0]?.id)) ?? DEMO_KPIS[0];
  const selectedColor = selectedKpi ? KPI_COLORS[DEMO_KPIS.indexOf(selectedKpi) % KPI_COLORS.length] : "#7C3AED";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8 selection:bg-[#7C3AED]/30">
        <div className="max-w-[1600px] mx-auto space-y-8">

          {/* Demo Banner */}
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3">
            <span className="text-amber-400 text-lg">🎯</span>
            <p className="text-amber-300 text-sm font-bold">Modo Demo — dados fictícios para apresentação. Nenhuma informação real é exibida.</p>
          </div>

          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <img src="/favicon.png" alt="Logo" className="h-10 w-10 rounded-xl shadow-lg object-contain" />
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">C8 Control</h1>
              </div>
              <p className="text-slate-300 font-bold pl-[52px]">Agência Demo</p>
            </div>
            <PeriodDropdown dateRange={dateRange} onChange={setDateRange} />
          </header>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700 w-fit">
            {(["crm", "performance", "atendimento"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn("flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                  activeTab === tab ? "bg-[#7C3AED] text-white shadow" : "text-slate-400 hover:text-slate-200"
                )}>
                {tab === "crm" && <><KanbanSquare className="h-4 w-4" /> CRM</>}
                {tab === "performance" && <><BarChart3 className="h-4 w-4" /> Performance</>}
                {tab === "atendimento" && <><MessageCircle className="h-4 w-4" /> Atendimento</>}
              </button>
            ))}
          </div>

          {/* ── PERFORMANCE TAB ── */}
          {activeTab === "performance" && (
          <div className="space-y-8">
            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <MetricCard label="Investimento" value={`R$ ${totals.spend.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5 text-[#7C3AED]" />} info="Total investido em anúncios no período." />
              <MetricCard label="Leads" value={totals.leads} icon={<Users className="h-5 w-5 text-blue-400" />} info="Leads gerados no período." />
              <MetricCard label="Vendas" value={totals.sales} icon={<Target className="h-5 w-5 text-emerald-400" />} info="Negócios fechados no período." />
              <MetricCard label="Conversão" value={`${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} info="Taxa de conversão de leads em vendas." />
              <MetricCard label="Faturamento Est." value={`R$ ${totals.revenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-white" />} info="Faturamento estimado no período." highlight />
              <MetricCard label="ROAS" value={`${roas}x`} icon={<PieChart className="h-5 w-5 text-orange-400" />} info="Retorno sobre investimento em anúncios." />
            </div>

            {/* Daily chart + Funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
              <div className="lg:col-span-2">
                <Card className="bg-[#1E293B] border-slate-800 shadow-2xl h-full flex flex-col">
                  <CardHeader><CardTitle className="text-xl font-bold text-white">Evolução Diária</CardTitle></CardHeader>
                  <CardContent className="flex-1 min-h-[350px] pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredMetrics}>
                        <defs>
                          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} /><stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }}
                          tickFormatter={s => { try { return format(new Date(String(s)), "dd/MM"); } catch { return String(s); } }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} />
                        <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                        <Area type="monotone" dataKey="revenue" name="Faturamento Est. (R$)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#gRev)" />
                        <Area type="monotone" dataKey="total_spend" name="Investimento (R$)" stroke="#7C3AED" strokeWidth={3} fillOpacity={1} fill="url(#gSpend)" />
                        <Line type="monotone" dataKey="total_leads" name="Leads" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden h-full flex flex-col">
                <CardHeader><CardTitle className="text-xl font-bold text-white">Funil de Conversão</CardTitle></CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center pt-6">
                  <ModernFunnel textVariant="white" steps={[
                    { label: "Impressões", value: totals.impressions.toLocaleString("pt-BR"), color: "bg-slate-700", width: "w-full", percentage: ((totals.clicks / (totals.impressions || 1)) * 100).toFixed(1) + "%", rateLabel: "CTR" },
                    { label: "Cliques", value: totals.clicks.toLocaleString("pt-BR"), color: "bg-[#7C3AED]/40", width: "w-[88%]", percentage: ((totals.leads / (totals.clicks || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. CONV." },
                    { label: "Leads", value: totals.leads.toLocaleString("pt-BR"), color: "bg-blue-500/40", width: "w-[76%]", percentage: ((funnelStats.contato / (totals.leads || 1)) * 100).toFixed(1) + "%", rateLabel: "QUALIF." },
                    { label: "Qualificados", value: funnelStats.contato.toLocaleString("pt-BR"), color: "bg-indigo-500/40", width: "w-[64%]", percentage: ((totals.sales / (funnelStats.contato || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. FECH." },
                    { label: "Fechados", value: totals.sales.toLocaleString("pt-BR"), color: "bg-emerald-500/40", width: "w-[52%]" },
                  ]} />
                  <div className="mt-8 pt-6 border-t border-slate-700 text-center">
                    <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Resultado Final</p>
                    <p className="text-3xl font-black text-emerald-400 mt-2">R$ {totals.revenue.toLocaleString("pt-BR")}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Campaigns table */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader><CardTitle className="text-xl font-bold text-white">Top Campanhas do Período</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                        <th className="pb-4">Plataforma</th><th className="pb-4">Campanha</th><th className="pb-4">Invest.</th>
                        <th className="pb-4 text-center">Leads</th><th className="pb-4 text-center">Vendas</th><th className="pb-4 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {aggregatedCampaigns.map((c, idx) => {
                        const roasCamp = c.spend > 0 ? (c.revenue / c.spend).toFixed(1) : "0.0";
                        return (
                          <tr key={idx} className="text-sm hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 text-slate-400 font-bold">{c.platform}</td>
                            <td className="py-4 font-bold text-slate-200">{c.name}</td>
                            <td className="py-4 text-slate-400">R$ {c.spend.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                            <td className="py-4 text-slate-400 font-bold text-center">{c.leads}</td>
                            <td className="py-4 text-slate-400 font-bold text-center">{c.sales}</td>
                            <td className="py-4 text-right">
                              <span className={cn("font-black px-2 py-1 rounded text-xs", Number(roasCamp) >= 4 ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400")}>
                                {roasCamp}x
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
                <CardHeader><CardTitle className="text-xl font-bold text-white flex items-center gap-2"><Briefcase className="h-5 w-5 text-[#7C3AED]" />Indicadores de Negócio</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kpiCards.map(kpi => {
                      const pctMeta = kpi.target_value && kpi.current !== null ? Math.min((kpi.current / kpi.target_value) * 100, 150) : null;
                      const metaOk = pctMeta !== null && (isLowerBetter(kpi.name) ? pctMeta <= 100 : pctMeta >= 100);
                      const metaColor = pctMeta === null ? "#475569" : metaOk ? "#10b981" : pctMeta >= 80 ? "#f59e0b" : "#ef4444";
                      return (
                        <Card key={kpi.id} className="bg-slate-900/30 border-slate-800 p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + "18" }}>
                              <BarChart3 className="h-4 w-4" style={{ color: kpi.color }} />
                            </div>
                            {kpi.growth !== null && (
                              <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                                (isLowerBetter(kpi.name) ? kpi.growth <= 0 : kpi.growth >= 0) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                              )}>
                                {kpi.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                {Math.abs(kpi.growth).toFixed(0)}%
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">{kpi.name}</p>
                          <p className="text-2xl font-black text-white mt-1">{kpi.current !== null ? fmtVal(kpi.current, kpi.unit) : "—"}</p>
                          {kpi.target_value !== null && (
                            <div className="mt-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500">Meta: {fmtVal(kpi.target_value, kpi.unit)}/mês</span>
                                {pctMeta !== null && <span className="text-[10px] font-black" style={{ color: metaColor }}>{pctMeta.toFixed(0)}%</span>}
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pctMeta ?? 0, 100)}%`, backgroundColor: metaColor }} />
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
                <CardHeader><CardTitle className="text-xl font-bold text-white">Observações Estratégicas</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <InsightItem icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} text={<>CPA calculado em <span className="text-emerald-400 font-bold">R$ {cpa}</span> no período.</>} />
                  <InsightItem icon={<TrendingUp className="h-4 w-4 text-[#7C3AED]" />} text={<>ROAS de <span className="text-[#7C3AED] font-bold">{roas}x</span> — cada R$ 1 investido gerou R$ {roas} em faturamento estimado.</>} />
                  <InsightItem icon={<Users className="h-4 w-4 text-blue-400" />} text={<><span className="text-blue-400 font-bold">{totals.leads}</span> leads com taxa de conversão de <span className="text-blue-400 font-bold">{conversionRate}%</span>.</>} />
                  {kpiCards.filter(k => k.growth !== null && (isLowerBetter(k.name) ? k.growth <= -5 : k.growth >= 5)).slice(0, 2).map(k => (
                    <InsightItem key={k.id} icon={<Zap className="h-4 w-4 text-yellow-400" />} text={<><span className="text-yellow-400 font-bold">{k.name}</span>: variação de {k.growth! >= 0 ? "+" : ""}{k.growth!.toFixed(1)}% vs mês anterior.</>} />
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Long-term evolution */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2"><Briefcase className="h-5 w-5 text-[#7C3AED]" />Evolução de Longo Prazo</CardTitle>
                <p className="text-sm text-slate-400">Últimos 12 meses — selecione o indicador</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  {DEMO_KPIS.map((kpi, idx) => {
                    const color = KPI_COLORS[idx % KPI_COLORS.length];
                    const isActive = (activeKpiId ?? DEMO_KPIS[0]?.id) === kpi.id;
                    return (
                      <button key={kpi.id} onClick={() => setActiveKpiId(kpi.id)}
                        className={cn("px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border",
                          isActive ? "text-white border-transparent" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300"
                        )}
                        style={isActive ? { backgroundColor: color + "22", borderColor: color, color } : {}}>
                        {kpi.name}
                      </button>
                    );
                  })}
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={longTermData} barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} />
                    {selectedKpi && (
                      <Bar dataKey={selectedKpi.name} name={selectedKpi.name} fill={selectedColor} radius={[4, 4, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          )}

          {/* ── ATENDIMENTO TAB ── */}
          {activeTab === "atendimento" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <MessageCircle className="h-5 w-5 text-emerald-400" />
                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Atendimento e Conversas</h2>
              </div>
              <ConversationKpiDashboard
                totals={convTotals} trend={convTrend} byCampaign={convByCampaign}
                bySource={convBySource} byAgent={convByAgent}
                isLoading={false} hasData={true} hasN8n={true}
                canalData={canalData} theme="dark" dateRange={dateRange}
              />
            </div>
          )}

          {/* ── CRM TAB ── */}
          {activeTab === "crm" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">CRM</h2>
                  <p className="text-slate-400 text-sm">{demoLeads.length} leads no total (demo — arraste os cards entre colunas)</p>
                </div>
              </div>
              {/* CRM stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: "Leads Ativos", value: demoLeads.filter(l => !["fechado","follow_up","perdido"].includes(l.status)).length, color: "text-[#7C3AED]" },
                  { label: "Novos", value: funnelStats.novo, color: "text-slate-300" },
                  { label: "Em Negociação", value: funnelStats.negociacao, color: "text-orange-400" },
                  { label: "Fechados", value: funnelStats.fechado, color: "text-emerald-400" },
                  { label: "Valor Fechado", value: `R$ ${demoLeads.filter(l => l.status === "fechado").reduce((a, l) => a + (l.proposal_value ?? 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, color: "text-emerald-400" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500 uppercase font-black tracking-widest truncate">{s.label}</p>
                      <p className={cn("text-2xl font-black leading-tight", s.color)}>{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Kanban */}
              <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {COLUMNS.map(col => (
                    <KanbanColumn key={col.id} col={col} leads={grouped[col.id] ?? []}
                      onEdit={() => {}} onDelete={() => {}} />
                  ))}
                </div>
                <DragOverlay>
                  {activeLead && (
                    <div className="opacity-90 rotate-1 scale-105 pointer-events-none">
                      <LeadCard lead={activeLead} onEdit={() => {}} onDelete={() => {}} isDragging />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          )}

        </div>
      </div>
    </TooltipProvider>
  );
}

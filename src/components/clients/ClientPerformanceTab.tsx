import { useEffect, useMemo, useState } from "react";
import { useClientReports } from "@/hooks/useHubPerformance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  Activity, ArrowDown, ArrowUp, BarChart3, Briefcase, Calendar,
  CheckCircle2, DollarSign, Info, MessageCircle,
  MousePointer2, PieChart, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import {
  Tooltip as ShadcnTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import { HorizontalScroll } from "@/components/ui/horizontal-scroll";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, subDays, startOfMonth, subMonths, parseISO, isBefore, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { useClientConversationKpis } from "@/hooks/useClientConversationKpis";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import { fmtKpiValue } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";

const isLowerBetter = (name: string) => /cac|cpa|cpl|cpc|cpm|custo/i.test(name);

// Agrega linhas diárias de campaign_data por (platform, campaign_name)
function aggregateCampaigns(rows: any[]) {
  const map = new Map<string, any>();
  for (const r of rows) {
    const key = `${r.platform}||${r.campaign_id ?? r.campaign_name ?? ""}`;
    if (!map.has(key)) {
      map.set(key, {
        platform: r.platform,
        campaign_name: r.campaign_name ?? "—",
        objective: r.objective ?? null,
        objective_metric_label: r.objective_metric_label ?? null,
        spend: 0, leads: 0, sales: 0, clicks: 0, impressions: 0, revenue: 0, reach: 0,
        objective_metric_value: 0,
      });
    }
    const agg = map.get(key)!;
    agg.spend                  += r.spend                  ?? 0;
    agg.leads                  += r.leads                  ?? 0;
    agg.sales                  += r.sales                  ?? 0;
    agg.clicks                 += r.clicks                 ?? 0;
    agg.impressions            += r.impressions            ?? 0;
    agg.revenue                += r.revenue                ?? 0;
    agg.reach                  += r.reach                  ?? 0;
    agg.objective_metric_value += r.objective_metric_value ?? 0;
    if (!agg.objective && r.objective) agg.objective = r.objective;
    if (!agg.objective_metric_label && r.objective_metric_label) agg.objective_metric_label = r.objective_metric_label;
  }
  return Array.from(map.values()).map(c => {
    const hasRealMetric = c.objective_metric_label && c.objective_metric_value > 0;
    const resultLabel = hasRealMetric ? c.objective_metric_label
      : c.sales > 0 ? "Vendas" : c.leads > 0 ? "Leads" : "Cliques";
    const mainResult = hasRealMetric ? c.objective_metric_value
      : c.sales > 0 ? c.sales : c.leads > 0 ? c.leads : c.clicks;
    const objective = c.objective ?? (c.sales > 0 ? "Vendas" : c.leads > 0 ? "Geração de Leads" : "Tráfego");
    const cpr = c.spend > 0 && mainResult > 0 ? c.spend / mainResult : 0;
    return { ...c, objective, mainResult, resultLabel, cpr };
  }).sort((a, b) => b.spend - a.spend);
}
const KPI_COLORS = ["#10b981","#2D8CC7","#f59e0b","#a855f7","#f43f5e","#06b6d4","#e879f9","#34d399"];

type Period = "7d" | "30d" | "90d" | "180d" | "1y" | "custom";

function getPeriodRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const to = format(today, "yyyy-MM-dd");
  if (period === "7d")   return { from: format(subDays(today, 7), "yyyy-MM-dd"), to };
  if (period === "30d")  return { from: format(subDays(today, 30), "yyyy-MM-dd"), to };
  if (period === "90d")  return { from: format(subDays(today, 90), "yyyy-MM-dd"), to };
  if (period === "180d") return { from: format(subDays(today, 180), "yyyy-MM-dd"), to };
  if (period === "1y")   return { from: format(subYears(today, 1), "yyyy-MM-dd"), to };
  return { from: format(subDays(today, 30), "yyyy-MM-dd"), to };
}

export function ClientPerformanceTab({ organizationId, clientId }: { organizationId: string; clientId: string }) {
  const [period, setPeriod] = useState<Period>("30d");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [contractStartDate, setContractStartDate] = useState<Date | null>(null);
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"performance" | "atendimento">("performance");

  const dateRange = useMemo(() =>
    period === "custom" ? { from: customFrom, to: customTo } : getPeriodRange(period),
    [period, customFrom, customTo]
  );

  useEffect(() => {
    supabase.from("contracts")
      .select("start_date, contract_date, is_dashboard_reference")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .order("start_date", { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const ref = data.find((c: any) => c.is_dashboard_reference) ?? data[0];
        const raw = String(ref.contract_date ?? ref.start_date).substring(0, 10);
        setContractStartDate(startOfMonth(parseISO(raw)));
      });
  }, [organizationId, clientId]);

  const { campaignDataQuery, dailyMetricsQuery } = useClientReports(organizationId, clientId, dateRange);
  const campaigns = useMemo(() => aggregateCampaigns((campaignDataQuery.data ?? []) as any[]), [campaignDataQuery.data]);
  const [campaignFilter, setCampaignFilter] = useState<"Todas" | "meta" | "google">("Todas");
  const filteredCampaigns = useMemo(() =>
    campaignFilter === "Todas" ? campaigns : campaigns.filter((c: any) => c.platform === campaignFilter),
    [campaigns, campaignFilter]
  );
  const dailyMetrics = (dailyMetricsQuery.data ?? []) as any[];
  const { data: kpis = [] } = useClientKPIs(organizationId, clientId);
  const { data: kpiHistory = [] } = useClientKPIHistory(organizationId, clientId);
  const kpisArr = kpis as any[];
  const historyArr = kpiHistory as any[];

  const conversationKpis = useClientConversationKpis(organizationId, clientId, dateRange);

  const totals = useMemo(() => dailyMetrics.reduce((acc, curr) => ({
    spend: acc.spend + (curr.total_spend || 0),
    leads: acc.leads + (curr.total_leads || 0),
    sales: acc.sales + (curr.total_sales || 0),
    revenue: acc.revenue + (curr.total_revenue || curr.revenue || 0),
    impressions: acc.impressions + (curr.total_impressions || curr.impressions || 0),
    clicks: acc.clicks + (curr.total_clicks || curr.clicks || 0),
  }), { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 }), [dailyMetrics]);

  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "0.0";
  const cpa = totals.sales > 0 ? (totals.spend / totals.sales).toFixed(0) : "0";
  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0.00";
  const cpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(2) : "0.00";
  const cpm = totals.impressions > 0 ? ((totals.spend / totals.impressions) * 1000).toFixed(2) : "0.00";
  const cpl = totals.leads > 0 ? (totals.spend / totals.leads).toFixed(2) : "0.00";
  const ticketMedio = totals.sales > 0 ? (totals.revenue / totals.sales).toFixed(0) : "0";
  const conversionRate = totals.leads > 0 ? ((totals.sales / totals.leads) * 100).toFixed(1) : "0.0";

  const fmtVal = (v: number | null | undefined, unit: string) => fmtKpiValue(v, unit);

  // KPI cards — mesmo padrão do public/dashboard
  const kpiCards = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    return kpisArr.map((kpi, idx) => {
      const history = historyArr
        .filter((h: any) => h.kpi_id === kpi.id)
        .sort((a: any, b: any) => String(b.month_year).localeCompare(String(a.month_year)));

      const postHistory = contractStart
        ? history.filter((h: any) => !isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart))
        : history;
      const preHistory = contractStart
        ? history.filter((h: any) => isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart))
        : [];

      if (postHistory.length === 0) {
        return { ...kpi, current: null, prev: null, growth: null, color: KPI_COLORS[idx % KPI_COLORS.length] };
      }

      const currentEntry = postHistory[0];
      const current = currentEntry?.value ?? null;
      let prevEntry = postHistory[1] ?? null;
      if (!prevEntry && preHistory.length > 0) prevEntry = preHistory[0];
      const prev = prevEntry?.value ?? null;
      const growth = current !== null && prev !== null && prev !== 0
        ? ((current - prev) / prev) * 100 : null;
      return { ...kpi, current, prev, growth, color: KPI_COLORS[idx % KPI_COLORS.length] };
    });
  }, [kpisArr, historyArr, contractStartDate]);

  // Sparkline (6 meses) por KPI
  const kpiSparkline = useMemo(() => {
    const monthKeys = Array.from({ length: 6 }).map((_, i) => format(subMonths(new Date(), i), "yyyy-MM")).reverse();
    const byKpi = new Map<string, { month: string; value: number }[]>();
    for (const kpi of kpisArr) {
      byKpi.set(kpi.id, monthKeys.map(mk => ({
        month: mk,
        value: historyArr.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value ?? 0,
      })));
    }
    return byKpi;
  }, [kpisArr, historyArr]);

  // Evolução longo prazo (12 meses, pre/post contract)
  const selectedKpi = kpisArr.find(k => k.id === (activeKpiId ?? kpisArr[0]?.id)) ?? kpisArr[0];
  const selectedColor = selectedKpi ? KPI_COLORS[kpisArr.indexOf(selectedKpi) % KPI_COLORS.length] : "#2D8CC7";

  const longTermData = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    return Array.from({ length: 12 }).map((_, i) => {
      const month = startOfMonth(subMonths(new Date(), 11 - i));
      const monthStr = format(month, "yyyy-MM");
      const isVigencia = contractStart ? !isBefore(month, contractStart) : false;
      const point: any = { name: format(month, "MMM/yy", { locale: ptBR }), isVigencia };
      kpisArr.forEach(kpi => {
        const h = historyArr.find((h: any) => h.kpi_id === kpi.id && String(h.month_year).substring(0, 7) === monthStr);
        point[kpi.name] = h ? h.value : null;
      });
      return point;
    });
  }, [kpisArr, historyArr, contractStartDate]);

  // Impacto da parceria — mesmo padrão do public/dashboard
  const partnershipImpact = useMemo(() => {
    if (!contractStartDate || historyArr.length === 0) return [];
    const splitDate = startOfMonth(contractStartDate);
    return kpisArr.map(kpi => {
      const kpiEntries = historyArr
        .filter((h: any) => h.kpi_id === kpi.id)
        .sort((a: any, b: any) => String(a.month_year).localeCompare(String(b.month_year)));
      if (kpiEntries.length < 2) return null;
      const pre = kpiEntries.filter((h: any) => isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), splitDate));
      const post = kpiEntries.filter((h: any) => !isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), splitDate));
      if (pre.length === 0 || post.length === 0) return null;
      const preLast12 = pre.slice(-12);
      const preAvg = preLast12.reduce((a: number, h: any) => a + Number(h.value), 0) / preLast12.length;
      const postAvg = post.reduce((a: number, h: any) => a + Number(h.value), 0) / post.length;
      return { name: kpi.name, unit: kpi.unit, pre: preAvg, post: postAvg, postMonths: post.length, growth: preAvg !== 0 ? ((postAvg - preAvg) / preAvg) * 100 : null };
    }).filter(Boolean);
  }, [kpisArr, historyArr, contractStartDate]);

  // Comparativo de performance — mesmo padrão do public/dashboard
  const perfRows = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    const fmtRow = (v: number, unit: string) => fmtKpiValue(v, unit);
    return kpisArr.map(kpi => {
      const all = historyArr
        .filter((h: any) => h.kpi_id === kpi.id)
        .sort((a: any, b: any) => String(b.month_year).localeCompare(String(a.month_year)));
      const postHistory = contractStart
        ? all.filter((h: any) => !isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart))
        : all;
      const preHistory = contractStart
        ? all.filter((h: any) => isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart))
        : [];
      const preLast12 = preHistory.slice(0, 12);
      const preAvg = preLast12.length > 0 ? preLast12.reduce((a: number, h: any) => a + Number(h.value), 0) / preLast12.length : null;
      const postLast12 = postHistory.slice(0, 12);
      const postAvg = postLast12.length > 0 ? postLast12.reduce((a: number, h: any) => a + Number(h.value), 0) / postLast12.length : null;
      const displayCurrent = postAvg ?? postHistory[0]?.value ?? null;
      const target = kpi.target_value ?? null;
      const vsAvg = displayCurrent !== null && preAvg !== null && preAvg !== 0 ? ((displayCurrent - preAvg) / preAvg) * 100 : null;
      const pctMeta = displayCurrent !== null && target !== null && target !== 0 ? (displayCurrent / target) * 100 : null;
      const lower = isLowerBetter(kpi.name);
      let status = "Sem dados";
      if (displayCurrent !== null) {
        if (pctMeta !== null && (lower ? pctMeta <= 100 : pctMeta >= 100)) status = "Meta atingida";
        else if (pctMeta !== null && (lower ? pctMeta <= 105 : pctMeta >= 90)) status = "Próximo da meta";
        else if (vsAvg !== null && (lower ? vsAvg <= -5 : vsAvg >= 5)) status = "Acima da média";
        else if (vsAvg !== null && (lower ? vsAvg >= 5 : vsAvg <= -5)) status = "Abaixo da média";
        else if (vsAvg !== null) status = "Na média";
      }
      return { kpi, current: displayCurrent, preAvg, target, vsAvg, pctMeta, status, fmt: fmtRow };
    });
  }, [kpisArr, historyArr, contractStartDate]);

  // Consolidado mensal (12 meses)
  const consolidadoMonths = useMemo(() =>
    Array.from({ length: 12 }).map((_, i) => subMonths(new Date(), 11 - i)), []);

  const isLoading = dailyMetricsQuery.isLoading;

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-500">

        {/* ── TABS ── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
          <button
            onClick={() => setActiveTab("performance")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === "performance"
                ? "bg-white text-violet-700 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <BarChart3 className="h-4 w-4" /> Performance
          </button>
          <button
            onClick={() => setActiveTab("atendimento")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === "atendimento"
                ? "bg-white text-emerald-700 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <MessageCircle className="h-4 w-4" /> Atendimento
          </button>
        </div>

        {/* ── FILTRO DE PERÍODO ── */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-black uppercase tracking-widest text-violet-600">Período</span>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px] h-9 text-xs font-bold border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="180d">Últimos 180 dias</SelectItem>
              <SelectItem value="1y">Último ano</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="h-9 w-[130px] text-xs border-slate-200" />
              <span className="text-slate-400 text-xs">até</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="h-9 w-[130px] text-xs border-slate-200" />
            </div>
          )}
          <div className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {format(new Date(dateRange.from), "dd/MM/yyyy")} — {format(new Date(dateRange.to), "dd/MM/yyyy")}
          </div>
        </div>

        {/* ── ABA: PERFORMANCE ── */}
        {activeTab === "performance" && (
        <div className="space-y-8">

        {/* ── 1. MÉTRICAS DE CAMPANHA ── */}
        <div>
          <SectionTitle icon={<DollarSign className="h-4 w-4 text-blue-500" />} label="Métricas de Campanha" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-3">
            <MetricCard label="Investimento" value={`R$ ${totals.spend.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5 text-blue-500" />} info="Valor total investido em mídia paga no período selecionado." />
            <MetricCard label="Leads" value={totals.leads} icon={<Users className="h-5 w-5 text-indigo-500" />} info="Total de leads gerados pelas campanhas no período." />
            <MetricCard label="Vendas" value={totals.sales} icon={<Target className="h-5 w-5 text-emerald-500" />} info="Total de vendas atribuídas às campanhas no período." />
            <MetricCard label="Conversão" value={`${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} info="Taxa de conversão de leads em vendas (vendas ÷ leads × 100)." />
            <MetricCard label="Faturamento Est." value={`R$ ${totals.revenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-white" />} info="Receita estimada gerada pelas vendas atribuídas às campanhas." highlight />
            <MetricCard label="ROAS" value={`${roas}x`} icon={<PieChart className="h-5 w-5 text-orange-500" />} info="Retorno sobre investimento em anúncios (faturamento ÷ investimento)." />
          </div>
        </div>

        {/* ── 2. EVOLUÇÃO DIÁRIA + FUNIL ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          <Card className="lg:col-span-2 border-none shadow-sm ring-1 ring-slate-200 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle className="text-base font-bold text-slate-800">Evolução Diária</CardTitle>
                <p className="text-xs text-slate-500 mt-1">Investimento vs Faturamento vs Leads</p>
              </div>
              <InfoTooltip text="Acompanhe dia a dia a evolução do investimento, faturamento estimado e volume de leads. Identifique picos de performance e o impacto de ajustes nas campanhas." />
            </CardHeader>
            <CardContent className="flex-1 min-h-[380px] pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyMetrics}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2D8CC7" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2D8CC7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={s => format(new Date(String(s)), "dd/MM")} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} itemStyle={{ color: "#1e293b", fontSize: "12px", fontWeight: "bold" }} labelStyle={{ color: "#64748b", fontSize: "11px" }} />
                  <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                  <Area type="monotone" dataKey="total_revenue" name="Faturamento Est. (R$)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#gRev)" />
                  <Area type="monotone" dataKey="total_spend" name="Investimento (R$)" stroke="#2D8CC7" strokeWidth={3} fillOpacity={1} fill="url(#gSpend)" />
                  <Line type="monotone" dataKey="total_leads" name="Leads" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm ring-1 ring-slate-200 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-base font-bold text-slate-800">Funil de Conversão</CardTitle>
              <InfoTooltip text="Visualize como os usuários avançam em cada etapa da jornada: de impressões até vendas. As taxas entre etapas revelam onde há maior perda e onde focar otimizações." />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center pt-2">
              <ModernFunnel textVariant="white" steps={[
                { label: "Impressões", value: totals.impressions.toLocaleString("pt-BR"), color: "bg-slate-400", width: "w-full", percentage: ((totals.clicks / (totals.impressions || 1)) * 100).toFixed(1) + "%", rateLabel: "CTR" },
                { label: "Cliques", value: totals.clicks.toLocaleString("pt-BR"), color: "bg-blue-400", width: "w-[85%]", percentage: ((totals.leads / (totals.clicks || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. CONV." },
                { label: "Leads", value: totals.leads, color: "bg-indigo-500", width: "w-[70%]", percentage: ((totals.sales / (totals.leads || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. FECH." },
                { label: "Vendas", value: totals.sales, color: "bg-emerald-500", width: "w-[55%]" },
              ]} />
              <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">Faturamento Estimado</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">R$ {totals.revenue.toLocaleString("pt-BR")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── 3. EFICIÊNCIA DO TRÁFEGO ── */}
        <div>
          <SectionTitle icon={<MousePointer2 className="h-4 w-4 text-indigo-500" />} label="Eficiência do Tráfego" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-3">
            <MetricCard label="CTR" value={`${ctr}%`} icon={<MousePointer2 className="h-5 w-5 text-blue-500" />} info="Taxa de clique (CTR). Fórmula: cliques ÷ impressões × 100. Indica o quão atrativo é o anúncio para o público." />
            <MetricCard label="CPC" value={`R$ ${Number(cpc).toLocaleString("pt-BR")}`} icon={<ArrowDown className="h-5 w-5 text-emerald-500" />} info="Custo por clique (CPC). Fórmula: investimento ÷ cliques. Quanto menor, mais eficiente o tráfego gerado." />
            <MetricCard label="CPM" value={`R$ ${Number(cpm).toLocaleString("pt-BR")}`} icon={<Activity className="h-5 w-5 text-orange-500" />} info="Custo por mil impressões (CPM). Fórmula: investimento ÷ impressões × 1000. Mede o custo de alcance." />
            <MetricCard label="CPL" value={`R$ ${Number(cpl).toLocaleString("pt-BR")}`} icon={<Users className="h-5 w-5 text-purple-500" />} info="Custo por lead (CPL). Fórmula: investimento ÷ leads. Quanto menor, mais eficiente a geração de leads." />
            <MetricCard label="CPA" value={`R$ ${cpa}`} icon={<Zap className="h-5 w-5 text-slate-600" />} info="Custo por aquisição (CPA). Fórmula: investimento ÷ vendas. Indica o custo médio para fechar uma venda." />
            <MetricCard label="Ticket Médio" value={`R$ ${Number(ticketMedio).toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} info="Ticket médio estimado. Fórmula: faturamento ÷ vendas. Valor médio gerado por cada venda fechada." />
          </div>
        </div>

        {/* ── 4. TOP CAMPANHAS ── */}
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-bold text-slate-800">Top Campanhas do Período</CardTitle>
            <div className="flex items-center gap-2">
              {(["Todas", "meta", "google"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setCampaignFilter(f)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                    campaignFilter === f
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {f === "Todas" ? "Todas" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <InfoTooltip text="Ranking das campanhas com maior volume de resultado no período. Compare eficiência entre campanhas e plataformas — identifique quais geram melhor ROAS e menor custo por aquisição." />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="overflow-y-auto" style={{ maxHeight: "336px" }}>
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
                      <th className="px-3 py-3 w-24">Plataforma</th>
                      <th className="px-6 py-3">Campanha</th>
                      <th className="px-6 py-3 w-32">Investimento</th>
                      <th className="px-3 py-3 text-center w-20">Alcance</th>
                      <th className="px-3 py-3 text-center w-28">Resultado</th>
                      <th className="px-6 py-3 text-center w-32">Custo/Result.</th>
                      <th className="px-6 py-3 text-right w-32">Faturamento</th>
                      <th className="px-6 py-3 text-right w-20">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredCampaigns.length === 0 ? (
                      <tr><td colSpan={8} className="py-10 text-center text-slate-400 text-sm italic">Sem dados de campanhas para este período.</td></tr>
                    ) : filteredCampaigns.map((c: any) => {
                      const r = c.spend > 0 && c.revenue > 0 ? (c.revenue / c.spend).toFixed(1) : "0.0";
                      return (
                        <tr key={`${c.platform}-${c.campaign_name}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-4 text-slate-500 font-bold text-sm w-24">{c.platform}</td>
                          <td className="px-6 py-4 font-bold text-slate-800 text-sm">
                            <div>{c.campaign_name}</div>
                            <div className="text-[10px] font-normal text-slate-400 uppercase tracking-wide mt-0.5">{c.objective}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-sm w-32">R$ {c.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-4 text-slate-600 text-center text-sm w-20">{c.reach > 0 ? c.reach.toLocaleString("pt-BR") : "—"}</td>
                          <td className="px-3 py-4 text-slate-600 font-bold text-center text-sm w-28">
                            <div>{c.mainResult}</div>
                            <div className="text-[10px] font-normal text-slate-400">{c.resultLabel}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-bold text-center text-sm w-32">
                            {c.cpr > 0 ? `R$ ${c.cpr.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-bold text-right text-sm w-32">
                            {c.revenue > 0 ? `R$ ${c.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-right w-20">
                            <span className={cn("font-black px-2 py-1 rounded text-xs", Number(r) >= 4 ? "bg-emerald-500/10 text-emerald-600" : "bg-orange-500/10 text-orange-500")}>
                              {r}x
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 5. INDICADORES DE NEGÓCIO (KPIs manuais) ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon={<Briefcase className="h-4 w-4 text-violet-500" />} label="Indicadores de Negócio" />
            <InfoTooltip text="Indicadores-chave registrados manualmente pela equipe. Cada card exibe o valor do mês atual e a variação percentual em relação ao mês anterior (MoM)." />
          </div>
          {kpisArr.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <BarChart3 className="h-10 w-10 opacity-20" />
              <p className="text-sm text-center">Nenhum indicador cadastrado ainda.<br />Configure os KPIs na aba de configurações do cliente.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map(kpi => (
                <Card key={kpi.id} className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + "18" }}>
                        <BarChart3 className="h-4 w-4" style={{ color: kpi.color }} />
                      </div>
                      <div className="flex items-center gap-2">
                        {kpi.growth !== null && (
                          <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                            (isLowerBetter(kpi.name) ? kpi.growth <= 0 : kpi.growth >= 0)
                              ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                          )}>
                            {kpi.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {Math.abs(kpi.growth).toFixed(0)}%
                          </div>
                        )}
                        <InfoTooltip text={`${kpi.name}: valor do mês atual com variação percentual em relação ao mês anterior. O mini-gráfico mostra a tendência dos últimos 6 meses.`} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">{kpi.name}</p>
                      <p className="text-2xl font-black text-slate-900 mt-1">
                        {kpi.current !== null ? fmtVal(kpi.current, kpi.unit) : <span className="text-slate-300">—</span>}
                      </p>
                      {kpi.prev !== null ? (
                        <p className="text-[10px] text-slate-400 mt-1">Anterior: <span className="font-bold">{fmtVal(kpi.prev, kpi.unit)}</span></p>
                      ) : (
                        <p className="text-[10px] text-slate-300 mt-1">Mês atual vs anterior</p>
                      )}
                    </div>
                    <div className="h-10">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={kpiSparkline.get(kpi.id) ?? []}>
                          <Line type="monotone" dataKey="value" stroke={kpi.color} strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── 6. EVOLUÇÃO DE LONGO PRAZO ── */}
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-slate-800">Evolução de Longo Prazo</CardTitle>
                <InfoTooltip text="Histórico de 12 meses do indicador selecionado. Barras cinzas representam o período anterior ao contrato; barras coloridas representam o período de parceria ativa com a agência." />
              </div>
              <p className="text-xs text-slate-500 mt-1">12 meses — histórico anterior vs parceria ativa</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {kpisArr.map((kpi, idx) => (
                <button key={kpi.id}
                  onClick={() => setActiveKpiId(kpi.id)}
                  className={cn("text-[10px] font-black px-3 py-1.5 rounded-full border transition-all",
                    (activeKpiId ?? kpisArr[0]?.id) === kpi.id
                      ? "text-white border-transparent shadow-sm"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  )}
                  style={(activeKpiId ?? kpisArr[0]?.id) === kpi.id ? { backgroundColor: KPI_COLORS[idx % KPI_COLORS.length], borderColor: KPI_COLORS[idx % KPI_COLORS.length] } : {}}
                >
                  {kpi.name}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {kpisArr.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Nenhum KPI cadastrado.</div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-sm bg-slate-300" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Histórico Anterior</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: selectedColor }} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Parceria Ativa</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={longTermData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
                      itemStyle={{ color: "#fff", fontSize: "12px", fontWeight: "bold" }}
                      labelStyle={{ color: "#a855f7", fontSize: "11px", fontWeight: "bold" }}
                      cursor={{ fill: "rgba(148,163,184,0.08)" }}
                    />
                    {selectedKpi && (
                      <Bar dataKey={selectedKpi.name} radius={[4, 4, 0, 0]}>
                        {longTermData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.isVigencia ? selectedColor : "#cbd5e1"} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── 7. IMPACTO DA PARCERIA ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon={<Activity className="h-4 w-4 text-emerald-500" />} label="Impacto da Parceria" />
            <InfoTooltip text="Comparação entre a média dos indicadores antes e depois do início do contrato com a agência. O percentual mostra o crescimento (ou redução) médio após a parceria." />
          </div>
          {partnershipImpact.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Activity className="h-8 w-8 opacity-20" />
              <p className="text-sm text-center">Dados insuficientes para calcular o impacto.<br />São necessários registros antes e após o início do contrato.</p>
            </div>
          ) : (
            <HorizontalScroll>
              {(partnershipImpact as any[]).map((item, idx) => {
                const lower = isLowerBetter(item.name);
                const isPositive = lower ? (item.growth ?? 0) <= 0 : (item.growth ?? 0) >= 0;
                return (
                  <div key={idx} className="flex-none min-w-[325px] bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">{item.name}</p>
                      <InfoTooltip text={`${item.name}: comparação entre a média antes do contrato (${item.pre.toFixed(1)}) e a média após o início da parceria (${item.post.toFixed(1)}).`} />
                    </div>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Antes</p>
                        <p className="text-lg font-black text-slate-400">{fmtVal(item.pre, item.unit)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Atual</p>
                        <p className="text-2xl font-black text-slate-900">{fmtVal(item.post, item.unit)}</p>
                      </div>
                    </div>
                    {item.growth !== null && (
                      <div className={cn("inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full",
                        isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                      )}>
                        {(item.growth ?? 0) >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(item.growth ?? 0).toFixed(1)}% vs antes
                      </div>
                    )}
                  </div>
                );
              })}
            </HorizontalScroll>
          )}
        </div>

        {/* ── 8. COMPARATIVO DE PERFORMANCE ── */}
        <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold text-slate-800">Comparativo de Performance</CardTitle>
              <InfoTooltip text="Comparação do valor atual de cada KPI com a média histórica e a meta definida. O status indica se o indicador está acima, na média ou abaixo do esperado." />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {perfRows.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Nenhum KPI cadastrado para comparar.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500">Indicador</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">Atual</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">Média Hist.</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">Meta</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">vs Média</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">% Meta</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perfRows.map(({ kpi, current, preAvg, target, vsAvg, pctMeta, status, fmt }) => {
                      const statusColor = status === "Meta atingida" ? "bg-emerald-500/10 text-emerald-600"
                        : status === "Próximo da meta" ? "bg-blue-500/10 text-blue-600"
                        : status === "Acima da média" ? "bg-violet-500/10 text-violet-600"
                        : status === "Abaixo da média" ? "bg-red-500/10 text-red-500"
                        : status === "Na média" ? "bg-slate-100 text-slate-500"
                        : "bg-slate-100 text-slate-400";
                      return (
                        <TableRow key={kpi.id} className="hover:bg-slate-50">
                          <TableCell className="font-bold text-slate-800">{kpi.name}</TableCell>
                          <TableCell className="text-center font-bold text-slate-700">{current !== null ? fmt(current, kpi.unit) : "—"}</TableCell>
                          <TableCell className="text-center text-slate-500">{preAvg !== null ? fmt(preAvg, kpi.unit) : "—"}</TableCell>
                          <TableCell className="text-center text-slate-500">{target !== null ? fmt(target, kpi.unit) : "—"}</TableCell>
                          <TableCell className="text-center">
                            {vsAvg !== null ? (
                              <span className={cn("text-xs font-bold", vsAvg >= 0 ? "text-emerald-600" : "text-red-500")}>
                                {vsAvg >= 0 ? "+" : ""}{vsAvg.toFixed(1)}%
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {pctMeta !== null ? (
                              <span className={cn("text-xs font-bold", pctMeta >= 100 ? "text-emerald-600" : "text-orange-500")}>
                                {pctMeta.toFixed(0)}%
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("text-[10px] font-black px-2 py-1 rounded-full", statusColor)}>{status}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 9. CONSOLIDADO MENSAL ── */}
        {kpisArr.length > 0 && (
          <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-800">Consolidado Mensal (12 meses)</CardTitle>
              <InfoTooltip text="Tabela com os valores registrados de cada KPI nos últimos 12 meses. Permite acompanhar a evolução histórica de todos os indicadores em uma visão consolidada." />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-black text-[10px] uppercase tracking-widest text-slate-500 min-w-[200px] sticky left-0 bg-slate-50 z-10">Indicador</TableHead>
                      {consolidadoMonths.map(m => (
                        <TableHead key={m.toISOString()} className="text-center font-black text-[10px] uppercase tracking-widest text-slate-500 min-w-[110px] px-4">
                          {format(m, "MMM/yy", { locale: ptBR })}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpisArr.map(kpi => (
                      <TableRow key={kpi.id} className="hover:bg-slate-50">
                        <TableCell className="font-bold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100">{kpi.name}</TableCell>
                        {consolidadoMonths.map(m => {
                          const mk = format(m, "yyyy-MM");
                          const v = historyArr.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value;
                          return (
                            <TableCell key={mk} className="text-center text-slate-600 text-sm px-4 whitespace-nowrap">
                              {v !== undefined ? fmtVal(v, kpi.unit) : <span className="text-slate-300">—</span>}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        </div>
        )} {/* fim activeTab === "performance" */}

        {/* ── ABA: ATENDIMENTO ── */}
        {activeTab === "atendimento" && (
          <ConversationKpiDashboard
            totals={conversationKpis.totals}
            trend={conversationKpis.trend}
            byCampaign={conversationKpis.byCampaign}
            bySource={conversationKpis.bySource}
            byAgent={conversationKpis.byAgent}
            isLoading={conversationKpis.isLoading}
            hasData={conversationKpis.hasData}
            theme="light"
          />
        )}

    </div>
    </TooltipProvider>
  );
}

// ── Sub-components ──

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-xs font-black uppercase tracking-widest text-violet-600">{label}</h2>
    </div>
  );
}

function MetricCard({ label, value, icon, info, highlight = false }: {
  label: string; value: React.ReactNode; icon: React.ReactNode; info: string; highlight?: boolean;
}) {
  return (
    <Card className={cn(
      "border-none shadow-sm ring-1 ring-slate-200 relative overflow-hidden transition-all hover:ring-violet-200",
      highlight ? "bg-[#a855f7] ring-[#a855f7]/40" : "bg-white"
    )}>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className={cn("p-2 rounded-lg", highlight ? "bg-white/20" : "bg-slate-50")}>
            {icon}
          </div>
          <InfoTooltip text={info} />
        </div>
        <div>
          <p className={cn("text-[9px] uppercase font-black tracking-widest", highlight ? "text-white/70" : "text-slate-500")}>
            {label}
          </p>
          <p className={cn("text-xl font-black mt-1 leading-none", highlight ? "text-white" : "text-slate-900")}>
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <ShadcnTooltip>
      <TooltipTrigger asChild>
        <button className="rounded-full p-1 transition-colors hover:bg-slate-100 text-purple-400/60 hover:text-purple-400">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-[11px] bg-slate-900 border-slate-800 text-white shadow-xl leading-relaxed">
        {text}
      </TooltipContent>
    </ShadcnTooltip>
  );
}

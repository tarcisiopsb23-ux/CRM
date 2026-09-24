import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ArrowDown, ArrowUp, BarChart3, Briefcase,
  CheckCircle2, DollarSign, Info, ListFilter,
  PieChart, Target, TrendingUp, Users, Zap, Globe,
} from "lucide-react";
import {
  Tooltip as ShadcnTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HorizontalScroll } from "@/components/ui/horizontal-scroll";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import { supabase } from "@/lib/supabase";
import {
  format, subDays, startOfMonth, endOfMonth, parseISO,
  isBefore, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { useClientReports } from "@/hooks/useHubPerformance";
import { fmtKpiValue } from "@/lib/formatters";
import { useClientAuth } from "@/hooks/useClientAuth";
import { usePartnershipImpact, fmtImpact, isLowerBetterImpact } from "@/hooks/usePartnershipImpact";
import { useCampaignDemographics } from "@/hooks/useCampaignDemographics";

const isLowerBetter = (name: string) => /cac|cpa|cpl|cpc|cpm|custo|inadimpl|churn|cancelamento|devolução|reclamação|tempo.*espera|prazo.*entrega/i.test(name);
const KPI_COLORS = ["#10b981","#2D8CC7","#f59e0b","#a855f7","#f43f5e","#06b6d4","#e879f9","#34d399"];

function aggregateCampaigns(rows: any[]) {
  const map = new Map<string, any>();
  for (const r of rows) {
    const key = `${r.platform}||${r.campaign_id ?? r.campaign_name ?? ""}`;
    if (!map.has(key)) {
      map.set(key, {
        platform: r.platform, campaign_name: r.campaign_name ?? "—",
        campaign_id: r.campaign_id ?? null, objective: r.objective ?? null,
        objective_metric_label: r.objective_metric_label ?? null,
        spend: 0, leads: 0, sales: 0, clicks: 0, impressions: 0, revenue: 0, reach: 0,
        objective_metric_value: 0, daily: [] as any[],
      });
    }
    const agg = map.get(key)!;
    agg.spend += r.spend ?? 0; agg.leads += r.leads ?? 0; agg.sales += r.sales ?? 0;
    agg.clicks += r.clicks ?? 0; agg.impressions += r.impressions ?? 0;
    agg.revenue += r.revenue ?? 0; agg.reach += r.reach ?? 0;
    agg.objective_metric_value += r.objective_metric_value ?? 0;
    if (!agg.objective && r.objective) agg.objective = r.objective;
    if (!agg.objective_metric_label && r.objective_metric_label) agg.objective_metric_label = r.objective_metric_label;
    agg.daily.push(r);
  }
  return Array.from(map.values()).map(c => {
    const hasRealMetric = c.objective_metric_label && c.objective_metric_value > 0;
    const resultLabel = hasRealMetric ? c.objective_metric_label : c.sales > 0 ? "Vendas" : c.leads > 0 ? "Leads" : "Cliques";
    const mainResult = hasRealMetric ? c.objective_metric_value : c.sales > 0 ? c.sales : c.leads > 0 ? c.leads : c.clicks;
    const objective = c.objective ?? (c.sales > 0 ? "Vendas" : c.leads > 0 ? "Geração de Leads" : "Tráfego");
    const cpr = c.spend > 0 && mainResult > 0 ? c.spend / mainResult : 0;
    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
    const cpc = c.clicks > 0 ? c.spend / c.clicks : 0;
    const cpm = c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0;
    const roas = c.spend > 0 && c.revenue > 0 ? c.revenue / c.spend : 0;
    const daily = [...c.daily].sort((a: any, b: any) => a.date > b.date ? 1 : -1);
    return { ...c, objective, mainResult, resultLabel, cpr, ctr, cpc, cpm, roas, daily };
  }).sort((a, b) => b.spend - a.spend);
}

export function PerformancePage() {
  const { auth } = useClientAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateRange = {
    from: searchParams.get('from') ?? format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: searchParams.get('to') ?? format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  };
  const stableDateRange = useMemo(() => dateRange, [dateRange.from, dateRange.to]);

  const [contractStartDate, setContractStartDate] = useState<Date | null>(null);
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);
  const [autoFallbackApplied, setAutoFallbackApplied] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<"Todas" | "meta" | "google">("Todas");
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  useEffect(() => {
    if (!auth?.id) return;
    const fetchContracts = async () => {
      const { data: allContracts, error: contractsError } = await supabase
        .rpc('get_client_contracts_public', { p_client_id: auth.id });
      let contracts = (allContracts ?? []) as any[];
      if (contractsError || contracts.length === 0) {
        const { data: directContracts } = await supabase
          .from("contracts")
          .select("id, start_date, contract_date, is_dashboard_reference")
          .eq("client_id", auth.id)
          .order("start_date", { ascending: true });
        contracts = (directContracts ?? []) as any[];
      }
      if (contracts.length > 0) {
        const refContract = contracts.find((c: any) => c.is_dashboard_reference === true) ?? contracts[0];
        const rawDate = String(refContract.contract_date ?? refContract.start_date).substring(0, 10);
        setContractStartDate(startOfMonth(parseISO(rawDate)));
      }
    };
    fetchContracts();
  }, [auth?.id]);

  const { data: kpisRaw } = useQuery({
    queryKey: ["public_client_kpis", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return [];
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_client_kpis_public', { p_client_id: auth.id });
      if (!rpcError && rpcData && rpcData.length > 0) return rpcData;
      const { data, error } = await supabase.from("client_kpis").select("*").eq("client_id", auth.id).order("name", { ascending: true });
      if (error) return [];
      return data || [];
    },
    enabled: !!auth?.id,
  });
  const kpis = ((kpisRaw ?? []) as any[]).filter((k: any) => k.name !== "__lead_manual" && k.name !== "__sale_manual");

  const { data: kpiHistoryRaw } = useQuery({
    queryKey: ["public_client_kpi_history", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return [];
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_client_kpi_history_public', { p_client_id: auth.id });
      if (!rpcError && rpcData && rpcData.length > 0) return rpcData;
      const { data, error } = await supabase.from("client_kpi_history").select("*").eq("client_id", auth.id).order("month_year", { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!auth?.id,
  });
  const kpiHistory = (kpiHistoryRaw ?? []) as any[];

  const { campaignDataQuery } = useClientReports(auth?.id, stableDateRange);
  const realCampaigns = useMemo(() => aggregateCampaigns((campaignDataQuery.data ?? []) as any[]), [campaignDataQuery.data]);
  const filteredRealCampaigns = useMemo(() =>
    campaignFilter === "Todas" ? realCampaigns : realCampaigns.filter((c: any) => c.platform === campaignFilter),
    [realCampaigns, campaignFilter]
  );

  // ── Mapeamento de métricas de conversão ─────────────────────────────────────
  const conversionConfig = useMemo(() => {
    const meta = (auth?.metadata ?? {}) as Record<string, any>;
    const cfg = meta.conversion_metrics ?? {};
    const leadFields: string[] = Array.isArray(cfg.lead_fields) ? cfg.lead_fields
      : (cfg.lead_field && cfg.lead_field !== "none") ? [cfg.lead_field] : ["leads"];
    const saleFields: string[] = Array.isArray(cfg.sale_fields) ? cfg.sale_fields
      : (cfg.sale_field && cfg.sale_field !== "none") ? [cfg.sale_field] : ["sales"];
    const dashboardKpis: string[] = Array.isArray(meta.dashboard_kpis) ? meta.dashboard_kpis : [];
    return { leadFields, saleFields, dashboardKpis };
  }, [auth?.metadata]);

  const { data: manualKpiHistory } = useQuery({
    queryKey: ["public_manual_kpi_history", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return [];
      const { data, error } = await supabase
        .from("client_kpi_history")
        .select("kpi_id, month_year, value")
        .eq("client_id", auth.id);
      if (error) return [];
      return data || [];
    },
    enabled: !!auth?.id && (conversionConfig.leadFields?.includes("manual") ?? false),
  });

  const { data: manualKpiIds } = useQuery({
    queryKey: ["public_manual_kpi_ids", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return null;
      const { data } = await supabase
        .from("client_kpis")
        .select("id, name")
        .eq("client_id", auth.id)
        .in("name", ["__lead_manual", "__sale_manual"]);
      const leadKpi = data?.find((k: any) => k.name === "__lead_manual");
      const saleKpi = data?.find((k: any) => k.name === "__sale_manual");
      return { leadKpiId: leadKpi?.id ?? null, saleKpiId: saleKpi?.id ?? null };
    },
    enabled: !!auth?.id && ((conversionConfig.leadFields?.includes("manual") ?? false) || (conversionConfig.saleFields?.includes("manual") ?? false)),
  });

  const realDailyMetrics = useMemo(() => {
    const rows = (campaignDataQuery.data ?? []) as any[];
    const { leadFields, saleFields } = conversionConfig;
    const hasManualLead = leadFields.includes("manual");
    const hasManualSale = saleFields.includes("manual");
    const fixedFields = ["leads","clicks","sales","revenue","impressions","reach","spend","objective_metric_value"];
    const byDate: Record<string, any> = {};
    for (const r of rows) {
      const d = r.date; if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d, total_spend: 0, total_leads: 0, total_sales: 0, total_revenue: 0, total_impressions: 0, total_clicks: 0 };
      byDate[d].total_spend       += Number(r.spend ?? 0);
      byDate[d].total_revenue     += Number(r.revenue ?? 0);
      byDate[d].total_impressions += Number(r.impressions ?? 0);
      byDate[d].total_clicks      += Number(r.clicks ?? 0);
      if (!hasManualLead) {
        for (const f of leadFields) {
          if (!f || f === "none") continue;
          if (fixedFields.includes(f)) byDate[d].total_leads += Number(r[f] ?? 0);
          else if (r.objective_metric_label === f) byDate[d].total_leads += Number(r.objective_metric_value ?? 0);
        }
      }
      if (!hasManualSale) {
        for (const f of saleFields) {
          if (!f || f === "none") continue;
          if (fixedFields.includes(f)) byDate[d].total_sales += Number(r[f] ?? 0);
          else if (r.objective_metric_label === f) byDate[d].total_sales += Number(r.objective_metric_value ?? 0);
        }
      }
    }
    const result = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    if ((hasManualLead || hasManualSale) && manualKpiHistory && manualKpiIds) {
      const { leadKpiId, saleKpiId } = manualKpiIds;
      for (const entry of (manualKpiHistory as any[])) {
        const monthPrefix = String(entry.month_year).substring(0, 7);
        const daysInMonth = result.filter((d: any) => d.date.startsWith(monthPrefix));
        if (daysInMonth.length === 0) continue;
        const perDay = entry.value / daysInMonth.length;
        daysInMonth.forEach((day: any) => {
          if (hasManualLead && entry.kpi_id === leadKpiId) day.total_leads += perDay;
          if (hasManualSale && entry.kpi_id === saleKpiId) day.total_sales += perDay;
        });
      }
    }
    return result;
  }, [campaignDataQuery.data, conversionConfig, manualKpiHistory, manualKpiIds]);

  const totals = useMemo(() => realDailyMetrics.reduce((acc, curr) => ({
    spend: acc.spend + (curr.total_spend || 0), leads: acc.leads + (curr.total_leads || 0),
    sales: acc.sales + (curr.total_sales || 0), revenue: acc.revenue + (curr.total_revenue || 0),
    impressions: acc.impressions + (curr.total_impressions || 0), clicks: acc.clicks + (curr.total_clicks || 0),
  }), { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 }), [realDailyMetrics]);

  const kpiCards = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    return kpis.map((kpi, idx) => {
      const history = kpiHistory.filter(h => h.kpi_id === kpi.id).sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
      const postHistory = contractStart ? history.filter(h => !isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart)) : history;
      const preHistory = contractStart ? history.filter(h => isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart)) : [];
      if (postHistory.length === 0) return { ...kpi, current: null, prev: null, growth: null, color: KPI_COLORS[idx % KPI_COLORS.length] };
      const current = postHistory[0]?.value ?? null;
      let prevEntry = postHistory[1] ?? null;
      if (!prevEntry && preHistory.length > 0) prevEntry = preHistory[0];
      const prev = prevEntry?.value ?? null;
      const growth = current !== null && prev !== null && prev !== 0 ? ((current - prev) / prev) * 100 : null;
      return { ...kpi, current, prev, growth, color: KPI_COLORS[idx % KPI_COLORS.length] };
    });
  }, [kpis, kpiHistory, contractStartDate]);

  // Filtra pelos IDs selecionados para o dashboard (vazio = exibe todos)
  const visibleKpiCards = useMemo(() => {
    const { dashboardKpis } = conversionConfig;
    if (!dashboardKpis || dashboardKpis.length === 0) return kpiCards as any[];
    return (kpiCards as any[]).filter((k: any) => dashboardKpis.includes(k.id));
  }, [kpiCards, conversionConfig]);

  const longTermData = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    return Array.from({ length: 12 }).map((_, i) => {
      const month = startOfMonth(subMonths(new Date(), 12 - i));
      const monthStr = format(month, "yyyy-MM");
      const isVigencia = contractStart ? !isBefore(month, contractStart) : false;
      const point: any = { name: format(month, "MMM/yy", { locale: ptBR }), isVigencia };
      kpis.forEach(kpi => {
        const h = kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).substring(0, 7) === monthStr);
        point[kpi.name] = h ? h.value : null;
      });
      return point;
    });
  }, [kpis, kpiHistory, contractStartDate]);

  // Impacto da parceria — dois cards para faturamento, um para os demais
  const partnershipImpact = usePartnershipImpact(kpis, kpiHistory, contractStartDate);

  const perfRows = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    const fmt = (v: number, unit: string) => fmtKpiValue(v, unit);
    return kpis.map(kpi => {
      const allHistory = kpiHistory.filter(h => h.kpi_id === kpi.id).sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
      const postHistory = contractStart ? allHistory.filter(h => !isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart)) : allHistory;
      const preHistory = contractStart ? allHistory.filter(h => isBefore(startOfMonth(parseISO(String(h.month_year).substring(0, 10))), contractStart)) : [];
      const current = postHistory[0]?.value ?? null;
      const preLast12 = preHistory.slice(0, 12);
      const preAvg = preLast12.length > 0 ? preLast12.reduce((a, h) => a + Number(h.value), 0) / preLast12.length : null;
      const postLast12 = postHistory.slice(0, 12);
      const postAvg = postLast12.length > 0 ? postLast12.reduce((a, h) => a + Number(h.value), 0) / postLast12.length : null;
      const target = kpi.target_value ?? null;
      const displayCurrent = postAvg ?? current;
      const vsAvg = displayCurrent !== null && preAvg !== null && preAvg !== 0 ? ((displayCurrent - preAvg) / preAvg) * 100 : null;
      const pctMeta = displayCurrent !== null && target !== null && target !== 0 ? (displayCurrent / target) * 100 : null;
      const lower = isLowerBetter(kpi.name);
      let status = "Sem dados";
      if (current !== null) {
        if (pctMeta !== null && (lower ? pctMeta <= 100 : pctMeta >= 100)) status = "Meta atingida";
        else if (pctMeta !== null && (lower ? pctMeta <= 105 : pctMeta >= 90)) status = "Próximo da meta";
        else if (vsAvg !== null && (lower ? vsAvg <= -5 : vsAvg >= 5)) status = "Acima da média";
        else if (vsAvg !== null && (lower ? vsAvg >= 5 : vsAvg <= -5)) status = "Abaixo da média";
        else if (vsAvg !== null) status = "Na média";
      }
      return { kpi, current: displayCurrent, preAvg, postAvg, target, vsAvg, pctMeta, status, fmt };
    });
  }, [kpis, kpiHistory, contractStartDate]);

  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "0.0";
  const cpa = totals.sales > 0 ? (totals.spend / totals.sales).toFixed(0) : "0";
  // Se não há leads, usa cliques como denominador (igual ao funil adaptativo)
  const conversionRate = totals.leads > 0
    ? ((totals.sales / totals.leads) * 100).toFixed(1)
    : totals.clicks > 0
      ? ((totals.sales / totals.clicks) * 100).toFixed(1)
      : "0.0";
  const conversionLabel = totals.leads > 0 ? "Leads → Vendas" : totals.clicks > 0 ? "Cliques → Vendas" : "Conversão";
  const isZero = totals.spend === 0 && totals.revenue === 0 && totals.clicks === 0;

  // Fallback automático: se mês atual sem dados, recua para mês anterior (só uma vez)
  useEffect(() => {
    const isCurrentMonth = !searchParams.get('from') ||
      searchParams.get('from') === format(startOfMonth(new Date()), 'yyyy-MM-dd');
    if (
      !campaignDataQuery.isLoading &&
      isZero &&
      !autoFallbackApplied &&
      isCurrentMonth
    ) {
      setAutoFallbackApplied(true);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('from', format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
        next.set('to',   format(endOfMonth(subMonths(new Date(), 1)),   'yyyy-MM-dd'));
        return next;
      });
    }
  }, [campaignDataQuery.isLoading, isZero, autoFallbackApplied, searchParams]);
  const fmtVal = (v: number, unit: string) => fmtKpiValue(v, unit);
  const defaultKpi = kpis.find(k => /faturamento/i.test(k.name)) ?? kpis[0];
  const sortedKpis = [...kpis.filter(k => /faturamento/i.test(k.name)), ...kpis.filter(k => !/faturamento/i.test(k.name))];
  const selectedKpi = sortedKpis.find(k => k.id === (activeKpiId ?? defaultKpi?.id)) ?? defaultKpi;
  const selectedColor = selectedKpi ? KPI_COLORS[kpis.indexOf(selectedKpi) % KPI_COLORS.length] : "#2D8CC7";

  // ── Aba Audiência — dados demográficos do Banco A ─────────────────────────
  const demographicsEnabled = auth?.modules_config?.demographics_enabled === true;
  const { aggregated: demo, isLoading: demoLoading, hasData: demoHasData } =
    useCampaignDemographics(
      auth?.organization_id,
      auth?.id,
      { from: dateRange.from, to: dateRange.to }
    );

  const DONUT_COLORS = ["#2D8CC7","#10b981","#f59e0b","#a855f7","#f43f5e","#06b6d4"];

  return (
    <TooltipProvider>
      <div className="space-y-8 max-w-[1600px] mx-auto">

        {/* ── BANNER: dados zerados ── */}
        {isZero && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">
              Nenhum dado encontrado para o período selecionado. Use o filtro no canto superior direito para selecionar o mês atual ou períodos anteriores.
            </p>
          </div>
        )}

        {/* ── 1. IMPACTO DA PARCERIA ── */}
        {partnershipImpact.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Zap className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Impacto da Parceria</h2>
              <InfoTooltip text="Compara a média dos indicadores antes e depois do início do contrato." />
            </div>
            <HorizontalScroll>
              {partnershipImpact.map((item) => (
                <Card key={item.id} className="bg-[#1E293B] border-slate-800 shadow-2xl p-7 relative overflow-hidden flex-none w-auto min-w-[411px]">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-[11px] uppercase font-black tracking-widest text-slate-400">{item.label}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{item.subtitle}</p>
                      </div>
                      <div className="flex items-end gap-6">
                        <div className="space-y-1"><p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Média Antes</p><p className="text-base font-black text-slate-400">{fmtImpact(item.pre, item.unit)}</p></div>
                        <ArrowUp className="h-4 w-4 text-slate-600 mb-1" />
                        <div className="space-y-1">
                          <p className="text-[9px] text-[#2D8CC7] uppercase font-bold tracking-wider">
                            {item.type === "ultimo_mes" ? "Último Mês" : "Média Atual"}
                          </p>
                          <p className="text-2xl font-black text-white">{fmtImpact(item.post, item.unit)}</p>
                        </div>
                      </div>
                    </div>
                    <div className={cn("flex flex-col items-center justify-center h-20 w-20 rounded-2xl border shadow-lg shrink-0",
                      (isLowerBetterImpact(item.kpiName) ? (item.growth ?? 0) <= 0 : (item.growth ?? 0) >= 0) ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400")}>
                      <span className="text-sm font-black">{(item.growth ?? 0) >= 0 ? "+" : ""}{Number(item.growth ?? 0).toFixed(0)}%</span>
                      <span className="text-[9px] font-bold uppercase opacity-70 mt-0.5">Cresc.</span>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 h-full w-32 bg-gradient-to-l from-[#2D8CC7]/5 to-transparent pointer-events-none" />
                </Card>
              ))}
            </HorizontalScroll>
          </div>
        )}

        {/* ── 2. MÉTRICAS DE ANÚNCIOS ── */}
        <div className={`grid gap-4 ${totals.leads > 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"}`}>
          <MetricCard label="Investimento" value={`R$ ${totals.spend.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5 text-[#2D8CC7]" />} info="Valor total investido em mídia paga no período." />
          {totals.leads > 0 && (
            <MetricCard label="Leads" value={totals.leads} icon={<Users className="h-5 w-5 text-blue-400" />} info="Número total de leads gerados pelas campanhas no período." />
          )}
          <MetricCard label="Vendas" value={totals.sales} icon={<Target className="h-5 w-5 text-emerald-400" />} info="Total de vendas fechadas e atribuídas às campanhas no período." />
          <MetricCard label="Conversão" value={`${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} info={`Taxa de conversão: ${conversionLabel}.`} />
          <MetricCard label="Faturamento Estimado" value={`R$ ${totals.revenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-white" />} info="Receita total estimada gerada pelas vendas atribuídas às campanhas." highlight />
          <MetricCard label="ROAS" value={`${roas}x`} icon={<PieChart className="h-5 w-5 text-orange-400" />} info="Return on Ad Spend — retorno sobre o investimento em anúncios." />
        </div>

        {/* ── 2. EVOLUÇÃO DIÁRIA + FUNIL ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          <div className="lg:col-span-2">
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <div>
                  <CardTitle className="text-xl font-bold text-white">Evolução Diária</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">Investimento vs Faturamento vs Leads</p>
                </div>
                <InfoTooltip text="Acompanhe dia a dia a evolução do investimento, faturamento estimado e leads gerados." />
              </CardHeader>
              <CardContent className="flex-1 min-h-[450px] pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={realDailyMetrics}>
                    <defs>
                      <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2D8CC7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2D8CC7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={s => format(new Date(String(s)), "dd/MM")} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
                    <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                    <Area type="monotone" dataKey="total_revenue" name="Faturamento Est. (R$)" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#gRev)" />
                    <Area type="monotone" dataKey="total_spend" name="Investimento (R$)" stroke="#2D8CC7" strokeWidth={4} fillOpacity={1} fill="url(#gSpend)" />
                    <Line type="monotone" dataKey="total_leads" name="Leads" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-xl font-bold text-white">Funil de Conversão</CardTitle>
              <InfoTooltip text="Visualize como os usuários avançam em cada etapa da jornada de compra." />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center pt-6">
              <ModernFunnel textVariant="white" steps={(() => {
                const hasLeads = totals.leads > 0;
                return [
                  { label: "Impressões", value: totals.impressions.toLocaleString("pt-BR"), color: "bg-slate-700", width: "w-full", percentage: ((totals.clicks / (totals.impressions || 1)) * 100).toFixed(1) + "%", rateLabel: "CTR" },
                  ...(hasLeads ? [
                    { label: "Cliques", value: totals.clicks.toLocaleString("pt-BR"), color: "bg-[#2D8CC7]/40", width: "w-[85%]", percentage: ((totals.leads / (totals.clicks || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. CONV." },
                    { label: "Leads", value: totals.leads, color: "bg-blue-500/40", width: "w-[70%]", percentage: ((totals.sales / (totals.leads || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. FECH." },
                    { label: "Vendas", value: totals.sales, color: "bg-emerald-500/40", width: "w-[55%]" },
                  ] : [
                    { label: "Cliques", value: totals.clicks.toLocaleString("pt-BR"), color: "bg-[#2D8CC7]/40", width: "w-[85%]", percentage: ((totals.sales / (totals.clicks || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. CONV." },
                    { label: "Vendas", value: totals.sales, color: "bg-emerald-500/40", width: "w-[70%]" },
                  ]),
                ];
              })()} />
              <div className="mt-8 pt-6 border-t border-slate-700 text-center w-full">
                <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Resultado Final</p>
                <p className="text-3xl font-black text-emerald-400 mt-2">R$ {totals.revenue.toLocaleString("pt-BR")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── 3. TOP CAMPANHAS ── */}
        <div className="grid grid-cols-1 gap-8">
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white">Top Campanhas do Período</CardTitle>
              <div className="flex items-center gap-2">
                {(["Todas", "meta", "google"] as const).map(f => (
                  <button key={f} onClick={() => setCampaignFilter(f)}
                    className={cn("px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                      campaignFilter === f ? "bg-white text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}>
                    {f === "Todas" ? "Todas" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
                <InfoTooltip text="Ranking das campanhas com maior volume de resultado no período." />
              </div>
            </CardHeader>
            <CardContent>
              {selectedCampaign && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedCampaign(null)}>
                  <div className="bg-[#0F172A] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedCampaign.platform}</p>
                        <h2 className="text-lg font-black text-white mt-0.5">{selectedCampaign.campaign_name}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{selectedCampaign.objective}</p>
                      </div>
                      <button onClick={() => setSelectedCampaign(null)} className="text-slate-400 hover:text-white text-2xl font-bold leading-none">×</button>
                    </div>
                    <div className="px-6 py-4 grid grid-cols-4 gap-3 border-b border-slate-800">
                      {[
                        { label: "Investimento", value: `R$ ${selectedCampaign.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
                        { label: "Impressões", value: selectedCampaign.impressions > 0 ? selectedCampaign.impressions.toLocaleString("pt-BR") : "—" },
                        { label: "Cliques", value: selectedCampaign.clicks > 0 ? selectedCampaign.clicks.toLocaleString("pt-BR") : "—" },
                        { label: "CTR", value: selectedCampaign.ctr > 0 ? `${selectedCampaign.ctr.toFixed(2)}%` : "—" },
                        { label: "CPC", value: selectedCampaign.cpc > 0 ? `R$ ${selectedCampaign.cpc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                        { label: "CPM", value: selectedCampaign.cpm > 0 ? `R$ ${selectedCampaign.cpm.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                        { label: "Alcance", value: selectedCampaign.reach > 0 ? selectedCampaign.reach.toLocaleString("pt-BR") : "—" },
                        { label: selectedCampaign.resultLabel, value: String(selectedCampaign.mainResult) },
                        { label: "Custo/Result.", value: selectedCampaign.cpr > 0 ? `R$ ${selectedCampaign.cpr.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—" },
                        { label: "Faturamento", value: selectedCampaign.revenue > 0 ? `R$ ${selectedCampaign.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                        { label: "ROAS", value: selectedCampaign.roas > 0 ? `${selectedCampaign.roas.toFixed(1)}x` : "—" },
                      ].map((m: any) => (
                        <div key={m.label} className="bg-slate-800/50 rounded-xl p-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{m.label}</p>
                          <p className="text-base font-black text-white mt-1">{m.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 overflow-auto px-6 py-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Resultados por Dia</p>
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                            <th className="pb-2 pr-4">Data</th><th className="pb-2 pr-4 text-right">Invest.</th>
                            <th className="pb-2 pr-4 text-right">Impressões</th><th className="pb-2 pr-4 text-right">Cliques</th>
                            <th className="pb-2 pr-4 text-right">CTR</th><th className="pb-2 pr-4 text-right">CPC</th>
                            <th className="pb-2 pr-4 text-right">Alcance</th><th className="pb-2 pr-4 text-right">{selectedCampaign.resultLabel}</th>
                            <th className="pb-2 text-right">Faturamento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {selectedCampaign.daily.map((d: any) => {
                            const dCtr = d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) : "—";
                            const dCpc = d.clicks > 0 ? `R$ ${(d.spend / d.clicks).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
                            const dResult = selectedCampaign.objective_metric_label && d.objective_metric_value > 0 ? d.objective_metric_value : d.sales > 0 ? d.sales : d.leads > 0 ? d.leads : d.clicks;
                            return (
                              <tr key={d.date} className="hover:bg-slate-800/30">
                                <td className="py-2 pr-4 text-slate-300 font-medium">{d.date}</td>
                                <td className="py-2 pr-4 text-right text-slate-400">R$ {(d.spend ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                                <td className="py-2 pr-4 text-right text-slate-500">{d.impressions > 0 ? d.impressions.toLocaleString("pt-BR") : "—"}</td>
                                <td className="py-2 pr-4 text-right text-slate-500">{d.clicks > 0 ? d.clicks.toLocaleString("pt-BR") : "—"}</td>
                                <td className="py-2 pr-4 text-right text-slate-500">{dCtr !== "—" ? `${dCtr}%` : "—"}</td>
                                <td className="py-2 pr-4 text-right text-slate-500">{dCpc}</td>
                                <td className="py-2 pr-4 text-right text-slate-500">{d.reach > 0 ? d.reach.toLocaleString("pt-BR") : "—"}</td>
                                <td className="py-2 pr-4 text-right font-bold text-slate-200">{dResult}</td>
                                <td className="py-2 text-right text-slate-400">{d.revenue > 0 ? `R$ ${d.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto scrollbar-dark">
                <div className="overflow-y-auto scrollbar-dark" style={{ maxHeight: "336px" }}>
                  <table className="text-left border-collapse whitespace-nowrap" style={{ minWidth: "1300px", width: "100%" }}>
                    <thead className="sticky top-0 bg-[#1E293B] z-10">
                      <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                        <th className="px-4 py-3 w-20">Plat.</th><th className="px-4 py-3 min-w-[350px]">Campanha</th>
                        <th className="px-4 py-3 text-right w-32">Investimento</th><th className="px-4 py-3 text-center w-32">Resultado</th>
                        <th className="px-4 py-3 text-right w-32">Custo/Result.</th><th className="px-4 py-3 text-right w-28">Faturamento</th>
                        <th className="px-4 py-3 text-right w-20">ROAS</th><th className="px-4 py-3 text-right w-28">Impressões</th>
                        <th className="px-4 py-3 text-right w-24">Cliques</th><th className="px-4 py-3 text-right w-20">CTR</th>
                        <th className="px-4 py-3 text-right w-24">CPC</th><th className="px-4 py-3 text-right w-24">CPM</th>
                        <th className="px-4 py-3 text-right w-24">Alcance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredRealCampaigns.length === 0 ? (
                        <tr><td colSpan={13} className="py-8 text-center text-slate-500 text-sm italic">Sem dados de campanhas para este período.</td></tr>
                      ) : filteredRealCampaigns.map((c: any) => (
                        <tr key={`${c.platform}-${c.campaign_name}`} className="text-sm hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => setSelectedCampaign(c)}>
                          <td className="px-4 py-3 text-slate-400 font-bold w-20">{c.platform}</td>
                          <td className="px-4 py-3 min-w-[350px] whitespace-normal">
                            <div className="font-bold text-slate-200 hover:text-blue-400 transition-colors">{c.campaign_name}</div>
                            <div className="text-[10px] font-normal text-slate-500 uppercase tracking-wide mt-0.5">{c.objective}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-right w-32">R$ {c.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-center w-32">
                            <div className="font-black text-slate-200 text-sm">{c.mainResult.toLocaleString("pt-BR")}</div>
                            <div className="text-[10px] font-normal text-slate-500">{c.resultLabel}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300 text-right w-32">{c.cpr > 0 ? `R$ ${c.cpr.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                          <td className="px-4 py-3 text-slate-300 text-right w-28">{c.revenue > 0 ? `R$ ${c.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td className="px-4 py-3 text-right w-20">
                            <span className={cn("font-black px-2 py-1 rounded text-xs", c.roas >= 4 ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400")}>
                              {c.roas > 0 ? `${c.roas.toFixed(1)}x` : "0.0x"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-right w-28">{c.impressions > 0 ? c.impressions.toLocaleString("pt-BR") : "—"}</td>
                          <td className="px-4 py-3 text-slate-500 text-right w-24">{c.clicks > 0 ? c.clicks.toLocaleString("pt-BR") : "—"}</td>
                          <td className="px-4 py-3 text-right w-20">
                            <span className={cn("font-bold", c.ctr >= 2 ? "text-emerald-400" : c.ctr >= 1 ? "text-slate-300" : c.ctr > 0 ? "text-orange-400" : "text-slate-500")}>
                              {c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-right w-24">{c.cpc > 0 ? `R$ ${c.cpc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                          <td className="px-4 py-3 text-slate-500 text-right w-24">{c.cpm > 0 ? `R$ ${c.cpm.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                          <td className="px-4 py-3 text-slate-500 text-right w-24">{c.reach > 0 ? c.reach.toLocaleString("pt-BR") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observações estratégicas */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white">Observações Estratégicas</CardTitle>
              <InfoTooltip text="Análise automática dos principais números do período." />
            </CardHeader>
            <CardContent className="space-y-3">
              {Number(cpa) > 0 && (<InsightItem icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} text={<>Eficiência: CPA calculado em <span className="text-emerald-400 font-bold">R$ {cpa}</span> no período.</>} />)}
              {Number(roas) > 0 && (<InsightItem icon={<TrendingUp className="h-4 w-4 text-[#2D8CC7]" />} text={<>ROAS de <span className="text-[#2D8CC7] font-bold">{roas}x</span> — cada R$ 1 investido gerou R$ {roas} em faturamento estimado.</>} />)}
              {totals.leads > 0 && (<InsightItem icon={<Users className="h-4 w-4 text-blue-400" />} text={<><span className="text-blue-400 font-bold">{totals.leads}</span> leads gerados com taxa de conversão de <span className="text-blue-400 font-bold">{conversionRate}%</span>.</>} />)}
              {kpiCards.filter(k => k.growth !== null && (isLowerBetter(k.name) ? k.growth <= -5 : k.growth >= 5)).slice(0, 2).map(k => (
                <InsightItem key={k.id} icon={<Zap className="h-4 w-4 text-yellow-400" />} text={<><span className="text-yellow-400 font-bold">{k.name}</span>: variação de {k.growth! >= 0 ? "+" : ""}{k.growth!.toFixed(1)}% vs mês anterior.</>} />
              ))}
              {Number(cpa) === 0 && Number(roas) === 0 && totals.leads === 0 && kpiCards.filter(k => k.growth !== null && (isLowerBetter(k.name) ? k.growth <= -5 : k.growth >= 5)).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">Nenhuma observação disponível para o período selecionado.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 5. INDICADORES DE NEGÓCIO ── */}
        <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-[#2D8CC7]" />Indicadores de Negócio
            </CardTitle>
            <InfoTooltip text="Indicadores-chave de negócio registrados manualmente pela equipe." />
          </CardHeader>
          <CardContent>
            {visibleKpiCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                <BarChart3 className="h-10 w-10 opacity-20" />
                <p className="text-sm text-center">Nenhum indicador cadastrado ainda.<br />Os KPIs aparecerão aqui após serem configurados.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {visibleKpiCards.map(kpi => (
                  <Card key={kpi.id} className="bg-slate-900/30 border-slate-800 p-5">
                    <div className="flex items-start justify-between">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + "18" }}>
                        <BarChart3 className="h-4 w-4" style={{ color: kpi.color }} />
                      </div>
                      <div className="flex items-start gap-2">
                        {kpi.growth !== null && (
                          <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                            (isLowerBetter(kpi.name) ? kpi.growth <= 0 : kpi.growth >= 0) ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                            {kpi.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {Math.abs(kpi.growth).toFixed(0)}%
                          </div>
                        )}
                        <InfoTooltip text={`${kpi.name}: valor do mês atual com variação percentual em relação ao mês anterior.`} />
                      </div>
                    </div>
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mt-3">{kpi.name}</p>
                    <p className="text-2xl font-black text-white mt-1">
                      {kpi.current !== null ? fmtVal(kpi.current, kpi.unit) : <span className="text-slate-600 text-base font-bold">Sem dados</span>}
                    </p>
                    {kpi.prev !== null ? (
                      <p className="text-[10px] text-slate-500 mt-2">Anterior: <span className="text-slate-400 font-bold">{fmtVal(kpi.prev, kpi.unit)}</span></p>
                    ) : (
                      <p className="text-[9px] text-slate-600 mt-2">Mês atual vs anterior</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 5. EVOLUÇÃO DE LONGO PRAZO ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-[#2D8CC7]" />Evolução de Longo Prazo
                <InfoTooltip text="Gráfico de barras com a evolução mensal de cada KPI nos últimos 12 meses." />
              </h2>
              <p className="text-sm text-slate-400 mt-1">Últimos 12 meses — selecione o indicador</p>
            </div>
            {kpis.length > 0 && contractStartDate && (
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-slate-600" /> HISTÓRICO ANTERIOR</div>
                <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: selectedColor }} /> PARCERIA ATIVA</div>
              </div>
            )}
          </div>
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
            <CardContent className="pt-6">
              {kpis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                  <TrendingUp className="h-10 w-10 opacity-20" />
                  <p className="text-sm text-center">Nenhum indicador cadastrado ainda.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    {sortedKpis.map((kpi) => {
                      const color = KPI_COLORS[kpis.indexOf(kpi) % KPI_COLORS.length];
                      const isActive = (activeKpiId ?? defaultKpi?.id) === kpi.id;
                      return (
                        <button key={kpi.id} onClick={() => setActiveKpiId(kpi.id)}
                          className={cn("px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border",
                            isActive ? "text-white border-transparent" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300")}
                          style={isActive ? { backgroundColor: color + "22", borderColor: color, color } : {}}>
                          {kpi.name}
                        </button>
                      );
                    })}
                  </div>
                  {contractStartDate && (
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-[#334155]" /><span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Histórico Anterior</span></div>
                      <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm" style={{ backgroundColor: selectedColor }} /><span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Vigência do Contrato</span></div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={longTermData} barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px", color: "#fff" }} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#a855f7", fontWeight: "bold", marginBottom: "4px" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(value: any) => selectedKpi ? [fmtVal(value, selectedKpi.unit), selectedKpi.name] : [value, ""]} />
                      <Bar dataKey={selectedKpi?.name ?? ""} radius={[6, 6, 0, 0]}
                        shape={(props: any) => {
                          const { x, y, width, height, payload } = props;
                          const color = payload?.isVigencia ? selectedColor : "#334155";
                          const r = 6;
                          return <path d={`M${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height} L${x},${y+height} Z`} fill={color} opacity={0.9} />;
                        }} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 4. INDICADORES DE NEGÓCIO ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <ListFilter className="h-5 w-5 text-[#2D8CC7]" />
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">Comparativo de Performance</h2>
            <InfoTooltip text="Tabela que cruza a média histórica, a meta definida e o resultado atual de cada KPI." />
          </div>
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              {perfRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                  <ListFilter className="h-10 w-10 opacity-20" />
                  <p className="text-sm text-center">Nenhum indicador cadastrado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/40">
                        {["KPI", "Média Histórica (Pré)", "Meta", "Resultado Atual (Pós)", "vs Histórico", "% Meta", "Status"].map(h => (
                          <th key={h} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {perfRows.map(({ kpi, current, preAvg, postAvg, target, vsAvg, pctMeta, status, fmt }) => {
                        const lower = isLowerBetter(kpi.name);
                        const vsPositive = vsAvg !== null && (lower ? vsAvg <= 0 : vsAvg >= 0);
                        const statusColor = status === "Meta atingida" ? "text-emerald-400 bg-emerald-500/10" : status === "Próximo da meta" ? "text-yellow-400 bg-yellow-500/10" : status === "Acima da média" ? "text-blue-400 bg-blue-500/10" : status === "Abaixo da média" ? "text-red-400 bg-red-500/10" : status === "Sem dados" ? "text-slate-600 bg-slate-800/50" : "text-slate-400 bg-slate-700/30";
                        const displayCurrent = postAvg ?? current;
                        return (
                          <tr key={kpi.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-4"><p className="text-sm font-bold text-white">{kpi.name}</p><p className="text-[10px] text-slate-500 uppercase font-bold">{kpi.category}</p></td>
                            <td className="px-5 py-4 text-sm text-slate-400 font-semibold whitespace-nowrap">{preAvg !== null ? fmt(preAvg, kpi.unit) : <span className="text-slate-600">—</span>}</td>
                            <td className="px-5 py-4 text-sm text-slate-400 font-semibold whitespace-nowrap">{target !== null ? fmt(target, kpi.unit) : <span className="text-slate-600 text-xs italic">Não definida</span>}</td>
                            <td className="px-5 py-4 text-sm font-black text-white whitespace-nowrap">{displayCurrent !== null ? fmt(displayCurrent, kpi.unit) : <span className="text-slate-600">—</span>}</td>
                            <td className="px-5 py-4 whitespace-nowrap">{vsAvg !== null ? (<span className={cn("flex items-center gap-1 text-xs font-black", vsPositive ? "text-emerald-400" : "text-red-400")}>{vsAvg >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(vsAvg).toFixed(2)}%</span>) : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-4 whitespace-nowrap">{pctMeta !== null ? (<div className="space-y-1"><span className="text-xs font-black text-slate-300">{pctMeta.toFixed(2)}%</span><div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className={cn("h-full rounded-full", pctMeta >= 100 ? "bg-emerald-400" : pctMeta >= 80 ? "bg-yellow-400" : "bg-red-400")} style={{ width: `${Math.min(pctMeta, 100)}%` }} /></div></div>) : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-4"><span className={cn("text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider whitespace-nowrap", statusColor)}>{status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 8. CONSOLIDADO MENSAL ── */}
        {(() => {
          const months = Array.from({ length: 12 }).map((_, i) => subMonths(new Date(), 12 - i));
          return (
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white">Consolidado Mensal</CardTitle>
                <InfoTooltip text="Histórico completo dos últimos 12 meses para cada indicador de negócio cadastrado." />
              </CardHeader>
              <CardContent className="p-0">
                {kpis.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                    <ListFilter className="h-10 w-10 opacity-20" />
                    <p className="text-sm text-center">A tabela consolidada aparecerá aqui após o cadastro e registro dos indicadores.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                          <th className="pb-4 pl-5 min-w-[180px] sticky left-0 bg-[#1E293B] z-10">Indicador</th>
                          {months.map(m => (<th key={m.toISOString()} className="pb-4 px-5 text-center min-w-[110px]">{format(m, "MMM/yy", { locale: ptBR })}</th>))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {kpis.map(kpi => (
                          <tr key={kpi.id} className="text-sm group hover:bg-[#2d3f55] transition-colors">
                            <td className="py-4 pl-5 pr-4 font-bold text-slate-200 sticky left-0 bg-[#1E293B] group-hover:bg-[#2d3f55] z-10 border-r border-slate-800 group-hover:text-white transition-colors">{kpi.name}</td>
                            {months.map(m => {
                              const mk = format(m, "yyyy-MM");
                              const val = kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value;
                              return (<td key={mk} className="py-4 px-5 text-center text-slate-300 font-bold group-hover:text-white transition-colors">{val !== undefined ? fmtVal(val, kpi.unit) : <span className="text-slate-700 group-hover:text-slate-500">—</span>}</td>);
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* ── ABA AUDIÊNCIA (condicional: demographics_enabled) ── */}
        {demographicsEnabled && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-border/40 pb-3">
              <Globe className="h-5 w-5 text-[#2D8CC7]" />
              <h2 className="text-lg font-bold text-foreground">Audiência</h2>
              <span className="text-xs text-muted-foreground ml-1">Dados demográficos das campanhas</span>
            </div>

            {demoLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2D8CC7] border-t-transparent" />
              </div>
            ) : !demoHasData ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Globe className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">
                  Nenhum dado demográfico disponível para o período selecionado.
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Os dados são enviados pelo n8n via Meta Ads e Google Ads.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Linha 1: Gênero + Dispositivo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Gênero */}
                  <Card className="bg-[#1E293B] border-slate-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-100">Distribuição por Gênero</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <RePieChart>
                          <Pie data={demo.byGender} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={70} label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}>
                            {demo.byGender.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
                        </RePieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Dispositivo */}
                  <Card className="bg-[#1E293B] border-slate-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-100">Distribuição por Dispositivo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <RePieChart>
                          <Pie data={demo.byDevice} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={70} label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}>
                            {demo.byDevice.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
                        </RePieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Linha 2: Faixa etária */}
                {demo.byAge.length > 0 && (
                  <Card className="bg-[#1E293B] border-slate-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-100">Distribuição por Faixa Etária</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={demo.byAge} layout="vertical" margin={{ left: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                          <YAxis type="category" dataKey="label" width={70} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#f1f5f9" }} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                          <Bar dataKey="impressions" name="Impressões" fill="#2D8CC7" radius={[0,4,4,0]} />
                          <Bar dataKey="clicks" name="Cliques" fill="#10b981" radius={[0,4,4,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Linha 3: Plataforma */}
                {demo.byPlatform.length > 0 && (
                  <Card className="bg-[#1E293B] border-slate-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-100">Performance por Plataforma</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={demo.byPlatform}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} formatter={(v: number) => v.toLocaleString("pt-BR")} />
                          <Bar dataKey="impressions" name="Impressões" fill="#2D8CC7" radius={[4,4,0,0]} />
                          <Bar dataKey="clicks" name="Cliques" fill="#10b981" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Linha 4: Top cidades */}
                {demo.byLocation.length > 0 && (
                  <Card className="bg-[#1E293B] border-slate-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-100">Top Localidades</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-700">
                              <th className="pb-2 text-left">Cidade</th>
                              <th className="pb-2 text-left">Estado</th>
                              <th className="pb-2 text-right">Cliques</th>
                              <th className="pb-2 text-right">Conversões</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {demo.byLocation.slice(0, 15).map((loc, i) => (
                              <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2 font-medium text-slate-200">{loc.city || "—"}</td>
                                <td className="py-2 text-slate-400">{loc.state || "—"}</td>
                                <td className="py-2 text-right text-slate-300">{loc.clicks.toLocaleString("pt-BR")}</td>
                                <td className="py-2 text-right font-bold text-emerald-400">{loc.conversions.toLocaleString("pt-BR")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {/* Linha 5: Heatmap Eficiência Hora × Dia */}
                {demo.heatmap.length > 0 && (
                  <Card className="bg-[#1E293B] border-slate-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-slate-100">
                        Eficiência por Hora × Dia da Semana
                        {!demo.hasHourData && (
                          <span className="ml-2 text-[10px] font-normal text-slate-500">
                            (distribuição estimada — dados por hora não disponíveis)
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <HeatmapChart data={demo.heatmap} />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

// Heatmap de eficiência por hora × dia da semana
const DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function HeatmapChart({ data }: { data: { day: number; hour: number; value: number }[] }) {
  if (!data.length) return null;

  // Monta mapa day→hour→value
  const map: Record<number, Record<number, number>> = {};
  let maxVal = 0;
  for (const d of data) {
    if (!map[d.day]) map[d.day] = {};
    map[d.day][d.hour] = d.value;
    if (d.value > maxVal) maxVal = d.value;
  }

  // Descobre quais horas têm dados
  const activeHours = HOURS.filter(h => data.some(d => d.hour === h));
  if (!activeHours.length) return null;

  function getColor(val: number): string {
    if (maxVal === 0) return "bg-slate-800";
    const ratio = val / maxVal;
    if (ratio === 0)   return "bg-slate-800/40";
    if (ratio < 0.25)  return "bg-[#2D8CC7]/20";
    if (ratio < 0.5)   return "bg-[#2D8CC7]/50";
    if (ratio < 0.75)  return "bg-[#2D8CC7]/75";
    return "bg-[#2D8CC7]";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Header: horas */}
        <div className="flex gap-0.5 mb-1 pl-8">
          {activeHours.map(h => (
            <div key={h} className="w-6 text-center text-[9px] text-slate-500 shrink-0">
              {h === 0 ? "00" : h < 10 ? `0${h}` : h}
            </div>
          ))}
        </div>
        {/* Linhas: dias */}
        {DAYS_PT.map((day, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-7 text-[10px] text-slate-400 font-medium shrink-0">{day}</div>
            {activeHours.map(h => {
              const val = map[dayIdx]?.[h] ?? 0;
              return (
                <div
                  key={h}
                  className={`w-6 h-5 rounded-sm shrink-0 ${getColor(val)} transition-colors`}
                  title={`${day} ${h}h: ${val.toLocaleString("pt-BR")} cliques`}
                />
              );
            })}
          </div>
        ))}
        {/* Legenda */}
        <div className="flex items-center gap-2 mt-3 pl-8">
          <span className="text-[10px] text-slate-500">Menos</span>
          {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
            const bg = r === 0 ? "bg-slate-800/40"
              : r < 0.25 ? "bg-[#2D8CC7]/20"
              : r < 0.5  ? "bg-[#2D8CC7]/50"
              : r < 0.75 ? "bg-[#2D8CC7]/75"
              : "bg-[#2D8CC7]";
            return <div key={i} className={`w-4 h-4 rounded-sm ${bg}`} />;
          })}
          <span className="text-[10px] text-slate-500">Mais</span>
        </div>
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
          <InfoTooltip text={info} light={highlight} />
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

function InfoTooltip({ text, light = false }: any) {
  return (
    <ShadcnTooltip>
      <TooltipTrigger asChild>
        <button className={cn("rounded-full p-1 transition-colors", light ? "hover:bg-white/20 text-purple-300/60" : "hover:bg-purple-500/10 text-purple-400/60 hover:text-purple-400")}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[200px] text-xs bg-slate-900 border-slate-800 text-white shadow-2xl">{text}</TooltipContent>
    </ShadcnTooltip>
  );
}

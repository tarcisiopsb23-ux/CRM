import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, Users, DollarSign, TrendingUp, Tag,
  UtensilsCrossed, CalendarDays, Megaphone, AlertCircle, Activity,
  Clock, Info, ArrowUp, ArrowDown, CheckCircle2, Target, Zap,
  Bell, Plus, Check, ShoppingBag,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useClientReports } from "@/hooks/useHubPerformance";
import {
  usePartnershipImpact, fmtImpact, isLowerBetterImpact,
  type ImpactCard,
} from "@/hooks/usePartnershipImpact";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { fmtKpiValue } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useAiReminders } from "@/hooks/useAiReminders";
import { toast } from "sonner";

const KPI_COLORS = ["#10b981","#2D8CC7","#f59e0b","#a855f7","#f43f5e","#06b6d4","#e879f9","#34d399"];

export function DashboardGeralPage() {
  const { auth } = useClientAuth();
  const dc = useDynamicClient();
  const [searchParams] = useSearchParams();

  const dateRange = useMemo(() => ({
    from: searchParams.get("from") ?? format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to:   searchParams.get("to")   ?? format(endOfMonth(new Date()),   "yyyy-MM-dd"),
  }), [searchParams.get("from"), searchParams.get("to")]);

  // ── Mapeamento de métricas de conversão (igual ao PerformancePage) ──────────
  const conversionConfig = useMemo(() => {
    const meta = (auth?.metadata ?? {}) as Record<string, any>;
    const cfg = meta.conversion_metrics ?? {};
    const leadFields: string[] = Array.isArray(cfg.lead_fields) ? cfg.lead_fields
      : (cfg.lead_field && cfg.lead_field !== "none") ? [cfg.lead_field] : ["leads"];
    const saleFields: string[] = Array.isArray(cfg.sale_fields) ? cfg.sale_fields
      : (cfg.sale_field && cfg.sale_field !== "none") ? [cfg.sale_field] : ["sales"];
    return { leadFields, saleFields };
  }, [auth?.metadata]);

  // ── Dados de campanhas ─────────────────────────────────────────────────────
  const { campaignDataQuery } = useClientReports(auth?.id, dateRange);

  const { totalLeads, totalSales, totalClicks, totalSpend, totalRevenue, activeCampaigns, dailyData } = useMemo(() => {
    const rows = (campaignDataQuery.data ?? []) as any[];
    const { leadFields, saleFields } = conversionConfig;
    const fixedFields = ["leads","clicks","sales","revenue","impressions","reach","spend","objective_metric_value"];
    const campaignSet = new Set<string>();
    const byDate: Record<string, any> = {};
    let totalLeads = 0, totalSales = 0, totalClicks = 0, totalSpend = 0, totalRevenue = 0;
    for (const r of rows) {
      if (r.campaign_name) campaignSet.add(`${r.platform}||${r.campaign_name}`);
      totalClicks  += Number(r.clicks  ?? 0);
      totalSpend   += Number(r.spend   ?? 0);
      totalRevenue += Number(r.revenue ?? 0);
      // Leads: respeita leadFields configurado
      for (const f of leadFields) {
        if (!f || f === "none" || f === "manual") continue;
        if (fixedFields.includes(f)) totalLeads += Number(r[f] ?? 0);
        else if (r.objective_metric_label === f) totalLeads += Number(r.objective_metric_value ?? 0);
      }
      // Vendas: respeita saleFields configurado
      for (const f of saleFields) {
        if (!f || f === "none" || f === "manual") continue;
        if (fixedFields.includes(f)) totalSales += Number(r[f] ?? 0);
        else if (r.objective_metric_label === f) totalSales += Number(r.objective_metric_value ?? 0);
      }
      const d = r.date;
      if (d) {
        if (!byDate[d]) byDate[d] = { date: d, total_leads: 0, total_spend: 0, total_revenue: 0 };
        byDate[d].total_leads   += Number(r.leads   ?? 0);
        byDate[d].total_spend   += Number(r.spend   ?? 0);
        byDate[d].total_revenue += Number(r.revenue ?? 0);
      }
    }
    return {
      totalLeads, totalSales, totalClicks, totalSpend, totalRevenue,
      activeCampaigns: campaignSet.size,
      dailyData: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [campaignDataQuery.data, conversionConfig]);

  const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : "0.0";
  // Regra adaptativa: se não há leads usa cliques como denominador (igual ao PerformancePage)
  const conversionRate = totalLeads > 0
    ? ((totalSales / totalLeads) * 100).toFixed(1)
    : totalClicks > 0
      ? ((totalSales / totalClicks) * 100).toFixed(1)
      : "—";
  const conversionLabel = totalLeads > 0 ? "Conversão" : totalClicks > 0 ? "Conversão (Cliques)" : "Conversão";

  const isLoaded = !campaignDataQuery.isLoading;
  const isZero   = isLoaded && totalLeads === 0 && totalSpend === 0 && totalRevenue === 0;

  // ── Lembretes rápidos (Banco B) ───────────────────────────────────────────
  const clientId = auth?.user?.client_id;
  const reminders = useAiReminders(clientId);
  const [reminderText, setReminderText] = useState("");

  // ── CRM: contatos e faturamento (Banco B, condicional) ────────────────────
  const crmEnabled = auth?.modules_config?.crm_enabled !== false;
  const { data: crmStats } = useQuery({
    queryKey: ["crm_stats_geral", clientId],
    queryFn: async () => {
      if (!dc || !clientId) return null;
      const [{ count: contactsCount }, { data: deals }] = await Promise.all([
        dc.from("crm_contacts").select("id", { count: "exact", head: true }),
        dc.from("crm_deals")
          .select("value, product:crm_products(price)")
          .eq("status", "won"),
      ]);
      const revenue = (deals ?? []).reduce((s: number, d: any) =>
        s + (d.value || d.product?.price || 0), 0);
      return { contacts: contactsCount ?? 0, revenue };
    },
    enabled: !!dc && !!clientId && crmEnabled,
    staleTime: 60_000,
  });
  const { data: kpisRaw } = useQuery({
    queryKey: ["public_client_kpis", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return [];
      const { data: rpcData, error } = await supabase.rpc("get_client_kpis_public", { p_client_id: auth.id });
      if (!error && rpcData?.length) return rpcData;
      const { data } = await supabase.from("client_kpis").select("*").eq("client_id", auth.id);
      return data ?? [];
    },
    enabled: !!auth?.id,
  });
  const kpis = ((kpisRaw ?? []) as any[]).filter((k: any) => k.name !== "__lead_manual" && k.name !== "__sale_manual");

  const { data: kpiHistoryRaw } = useQuery({
    queryKey: ["public_client_kpi_history", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return [];
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_client_kpi_history_public', { p_client_id: auth.id });
      if (!rpcError && rpcData?.length) return rpcData;
      const { data } = await supabase.from("client_kpi_history").select("*").eq("client_id", auth.id).order("month_year", { ascending: false });
      return data ?? [];
    },
    enabled: !!auth?.id,
  });
  const kpiHistory = (kpiHistoryRaw ?? []) as any[];

  // Data de início do contrato (para calcular impacto)
  const { data: contractStartDate } = useQuery({
    queryKey: ["public_contract_start", auth?.id],
    queryFn: async () => {
      if (!auth?.id) return null;
      const { data: allContracts } = await supabase.rpc('get_client_contracts_public', { p_client_id: auth.id });
      const contracts = (allContracts ?? []) as any[];
      if (contracts.length === 0) return null;
      const refContract = contracts.find((c: any) => c.is_dashboard_reference) ?? contracts[0];
      const rawDate = String(refContract.contract_date ?? refContract.start_date).substring(0, 10);
      return startOfMonth(parseISO(rawDate));
    },
    enabled: !!auth?.id,
  });

  // ── Impacto da Parceria ────────────────────────────────────────────────────
  const allImpactCards = usePartnershipImpact(kpis, kpiHistory, contractStartDate ?? null);

  // ── Seleção configurada em metadata ───────────────────────────────────────
  const geralCards: string[] = useMemo(() => {
    const meta = (auth?.metadata ?? {}) as Record<string, any>;
    return Array.isArray(meta.geral_dashboard_cards) ? meta.geral_dashboard_cards : [];
  }, [auth?.metadata]);

  // 4 cards selecionados — se nada configurado, exibe os primeiros 4 disponíveis
  const selectedImpactCards: ImpactCard[] = useMemo(() => {
    if (geralCards.length === 0) return allImpactCards.slice(0, 4);
    return geralCards
      .map(id => allImpactCards.find(c => c.id === id))
      .filter(Boolean) as ImpactCard[];
  }, [geralCards, allImpactCards]);

  // KPI cards — valor do mês mais recente vs anterior
  const kpiCards = useMemo(() => {
    const monthKeys = Array.from({ length: 6 }).map((_, i) => format(subMonths(new Date(), i), "yyyy-MM")).reverse();
    return kpis.map((kpi, idx) => {
      const history = kpiHistory
        .filter(h => h.kpi_id === kpi.id)
        .sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
      const current = history[0]?.value ?? null;
      const prev = history[1]?.value ?? null;
      const growth = current !== null && prev !== null && prev !== 0
        ? ((current - prev) / prev) * 100 : null;
      return { ...kpi, current, prev, growth, color: KPI_COLORS[idx % KPI_COLORS.length] };
    });
  }, [kpis, kpiHistory]);

  // ── IA ────────────────────────────────────────────────────────────────────
  const iaEnabled = !!(dc && auth?.show_ia_content);
  const iaCounts = useQueries({
    queries: iaEnabled ? [
      { queryKey: ["ia_count", "ai_promotions"],  queryFn: async () => { const { count } = await dc!.from("ai_promotions").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; }, staleTime: 60_000 },
      { queryKey: ["ia_count", "ai_suggestions"], queryFn: async () => { const { count } = await dc!.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; }, staleTime: 60_000 },
      { queryKey: ["ia_count", "ai_events"],      queryFn: async () => { const { count } = await dc!.from("ai_events").select("id", { count: "exact", head: true }); return count ?? 0; }, staleTime: 60_000 },
      { queryKey: ["ia_count", "ai_notices"],     queryFn: async () => { const { count } = await dc!.from("ai_notices").select("id", { count: "exact", head: true }).eq("status", "active"); return count ?? 0; }, staleTime: 60_000 },
    ] : ([] as { queryKey: string[]; queryFn: () => Promise<number>; staleTime: number }[]),
  });
  const { data: nextEvents = [] } = useQuery({
    queryKey: ["ia_next_event"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await dc!.from("ai_events").select("*").eq("status", "active").gte("date", today).order("date", { ascending: true }).limit(10);
      return (data ?? []) as any[];
    },
    enabled: !!dc && !!auth?.show_ia_content,
    staleTime: 60_000,
  });
  const { data: highPriorityNotices } = useQuery({
    queryKey: ["ia_high_notices"],
    queryFn: async () => { const { data } = await dc!.from("ai_notices").select("*").eq("status", "active").eq("priority", "alta").limit(5); return data ?? []; },
    enabled: !!dc && !!auth?.show_ia_content,
    staleTime: 60_000,
  });
  const iaCountLabels = [
    { label: "Eventos",   icon: CalendarDays,   color: "text-emerald-400" },
    { label: "Promoções", icon: Tag,             color: "text-violet-400" },
    { label: "Sugestões", icon: UtensilsCrossed, color: "text-amber-400" },
    { label: "Avisos",    icon: Megaphone,       color: "text-red-400" },
  ];

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">

      {/* ── Banner dados zerados ── */}
      {isZero && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            Nenhum dado encontrado para o período selecionado. Use o filtro no canto superior direito para selecionar o mês atual ou meses anteriores.
          </p>
        </div>
      )}

      {/* ── 1. CARDS SELECIONADOS DE IMPACTO DA PARCERIA ── */}
      {selectedImpactCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {selectedImpactCards.map(item => {
            const positive = isLowerBetterImpact(item.kpiName)
              ? (item.growth ?? 0) <= 0
              : (item.growth ?? 0) >= 0;
            return (
              <Card key={item.id} className="bg-card border-border shadow-lg relative overflow-hidden">
                <CardContent className="p-4 flex flex-col gap-2">
                  {/* Header: label + subtitle */}
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Zap className="h-3 w-3 text-yellow-400 shrink-0" />
                      <span className="break-words leading-tight">{item.label}</span>
                    </p>
                    <p className="text-[9px] text-muted-foreground/60 mt-0.5 break-words leading-snug">{item.subtitle}</p>
                  </div>
                  {/* Valor Atual — destaque principal, no topo */}
                  <div className="min-w-0">
                    <p className="text-[9px] text-primary uppercase font-bold">
                      {item.type === "ultimo_mes" ? "Último Mês" : "Atual"}
                    </p>
                    <p className="text-xl font-black text-foreground break-all leading-tight">{fmtImpact(item.post, item.unit)}</p>
                  </div>
                  {/* Linha inferior: Antes + badge % */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Antes</p>
                      <p className="text-sm font-black text-muted-foreground break-all leading-tight">{fmtImpact(item.pre, item.unit)}</p>
                    </div>
                    {item.growth !== null && (
                      <div className={cn("inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shrink-0",
                        positive ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                      )}>
                        {(item.growth ?? 0) >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(item.growth ?? 0).toFixed(0)}% vs antes
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 2. CARDS DE CAMPANHA ── */}
      <div className={`grid gap-4 ${totalLeads > 0 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"}`}>
        <SummaryCard label="Campanhas Ativas" value={activeCampaigns}                              icon={<BarChart3    className="h-5 w-5 text-[#2D8CC7]"   />} />
        {totalLeads > 0 && (
          <SummaryCard label="Leads"           value={totalLeads.toLocaleString("pt-BR")}          icon={<Users        className="h-5 w-5 text-blue-400"    />} />
        )}
        <SummaryCard label="Vendas"            value={totalSales.toLocaleString("pt-BR")}          icon={<Target       className="h-5 w-5 text-emerald-500" />} />
        <SummaryCard label={conversionLabel}   value={conversionRate === "—" ? "—" : `${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} />
        <SummaryCard label="Faturamento Est."  value={`R$ ${totalRevenue.toLocaleString("pt-BR")}`} icon={<TrendingUp  className="h-5 w-5 text-emerald-400" />} highlight />
        <SummaryCard label="ROAS"              value={`${roas}x`}                                  icon={<DollarSign   className="h-5 w-5 text-orange-400"  />} />
      </div>

      {/* ── Cards IA (condicional) ── */}
      {auth?.show_ia_content && dc && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {iaCountLabels.map((item, i) => {
            const count = iaCounts[i]?.data ?? 0;
            const Icon = item.icon;
            return (
              <Card key={item.label} className="bg-card border-border">
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Icon className={cn("h-5 w-5", item.color)} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-foreground">{count}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{item.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 3. EVOLUÇÃO DIÁRIA + PRÓXIMO EVENTO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <Card className="lg:col-span-2 bg-card border-border shadow-2xl">
          <CardHeader>
            <CardTitle className="text-foreground text-lg font-bold">Evolução Diária</CardTitle>
            <p className="text-muted-foreground text-sm">Investimento vs Faturamento vs Leads</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2D8CC7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2D8CC7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickFormatter={(s) => { try { return format(new Date(String(s)), "dd/MM"); } catch { return s; } }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
                <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                <Area type="monotone" dataKey="total_revenue" name="Faturamento Est. (R$)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#gRev)" />
                <Area type="monotone" dataKey="total_spend"   name="Investimento (R$)"     stroke="#2D8CC7" strokeWidth={3} fillOpacity={1} fill="url(#gSpend)" />
                <Line  type="monotone" dataKey="total_leads"  name="Leads"                 stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-2xl flex flex-col">
          <CardHeader className="shrink-0">
            <CardTitle className="text-foreground text-lg font-bold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#2D8CC7]" />Próximos Eventos
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            {!auth?.show_ia_content || !dc ? (
              <div className="flex flex-col items-center justify-center h-full py-8 gap-2 text-muted-foreground px-6">
                <CalendarDays className="h-8 w-8 opacity-20" />
                <p className="text-sm text-center">Habilite o Conteúdo IA para ver os próximos eventos.</p>
              </div>
            ) : nextEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 gap-2 text-muted-foreground px-6">
                <CalendarDays className="h-8 w-8 opacity-20" />
                <p className="text-sm">Nenhum evento futuro cadastrado.</p>
              </div>
            ) : (
              <div className="h-full overflow-y-auto divide-y divide-border/40 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {nextEvents.map((ev: any, idx: number) => (
                  <div key={ev.id} className={cn(
                    "flex items-start gap-3 px-5 py-4",
                    idx === 0 && "bg-primary/5"
                  )}>
                    {/* Mini calendário */}
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-ember text-primary-foreground shadow-glow">
                      <span className="text-[9px] font-medium uppercase tracking-wider opacity-80">
                        {format(new Date(ev.date + "T00:00:00"), "MMM", { locale: ptBR })}
                      </span>
                      <span className="font-display text-lg font-black leading-none">
                        {format(new Date(ev.date + "T00:00:00"), "dd")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-foreground leading-snug truncate">{ev.title}</p>
                      {ev.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ev.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {format(new Date(ev.date + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}
                        </span>
                        {ev.time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />{ev.time}
                          </span>
                        )}
                      </div>
                    </div>
                    {idx === 0 && (
                      <span className="ml-auto shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
                        Próximo
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Avisos ── */}
      {auth?.show_ia_content && dc && highPriorityNotices && highPriorityNotices.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-foreground font-bold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-400" />Avisos de Alta Prioridade
          </h3>
          {(highPriorityNotices as any[]).map((n: any) => (
            <div key={n.id} className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-200 font-medium">{n.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Lembretes Rápidos (condicional: só quando banco B conectado) ── */}
      {dc && clientId && (
        <Card className="bg-card border-border shadow-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground text-base font-bold flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" /> Lembretes Rápidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Input rápido */}
            <form
              onSubmit={async e => {
                e.preventDefault();
                if (!reminderText.trim()) return;
                try {
                  await reminders.create.mutateAsync({ client_id: clientId, text: reminderText.trim(), created_by: auth?.user?.id ?? null });
                  setReminderText("");
                } catch { toast.error("Erro ao criar lembrete."); }
              }}
              className="flex gap-2"
            >
              <Input
                value={reminderText}
                onChange={e => setReminderText(e.target.value)}
                placeholder="Novo lembrete..."
                className="flex-1 h-8 text-sm bg-muted/20"
              />
              <Button type="submit" size="sm" className="h-8 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/20" disabled={reminders.create.isPending}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>

            {/* Lista */}
            {(reminders.data ?? []).slice(0, 5).map(r => {
              const overdue = r.due_date ? isPast(new Date(r.due_date)) && !r.completed : false;
              return (
                <div key={r.id} className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 border transition-all",
                  r.completed ? "opacity-50 border-transparent bg-muted/10" :
                  overdue ? "border-red-500/20 bg-red-500/5" : "border-border/40 bg-muted/10"
                )}>
                  <button
                    onClick={() => reminders.toggleComplete.mutate({ id: r.id, completed: !r.completed })}
                    className={cn("h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
                      r.completed ? "bg-emerald-500 border-emerald-500" : overdue ? "border-red-400" : "border-border"
                    )}
                  >
                    {r.completed && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", r.completed ? "line-through text-muted-foreground" : "text-foreground")}>
                      {r.text}
                    </p>
                    {r.due_date && (
                      <p className={cn("text-[10px]", overdue && !r.completed ? "text-red-400" : "text-muted-foreground")}>
                        {format(new Date(r.due_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {overdue && !r.completed && " — VENCIDO"}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => reminders.remove.mutate(r.id)}
                    className="h-4 w-4 shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {(reminders.data ?? []).length === 0 && !reminders.isLoading && (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum lembrete. Adicione acima.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Cards CRM (condicional: só quando módulo ativo e com dados) ── */}
      {crmEnabled && dc && crmStats && (crmStats.contacts > 0 || crmStats.revenue > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {crmStats.contacts > 0 && (
            <Card className="bg-card border-border shadow-lg">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Contatos no CRM</p>
                  <p className="text-2xl font-black text-foreground">{crmStats.contacts.toLocaleString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {crmStats.revenue > 0 && (
            <Card className="bg-card border-border shadow-lg">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                  <ShoppingBag className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Faturamento CRM</p>
                  <p className="text-2xl font-black text-foreground">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(crmStats.revenue)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">negociações ganhas</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Feed ── */}
      <Card className="bg-card border-border shadow-2xl">
        <CardHeader>
          <CardTitle className="text-foreground text-lg font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeCampaigns === 0 && totalLeads === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
              <Activity className="h-8 w-8 opacity-20" />
              <p className="text-sm">Nenhuma atividade registrada no período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {totalLeads > 0 && <FeedItem color="bg-blue-400" text={`${totalLeads.toLocaleString("pt-BR")} leads gerados no período`} time="período selecionado" />}
              {activeCampaigns > 0 && <FeedItem color="bg-[#2D8CC7]" text={`${activeCampaigns} campanhas ativas monitoradas`} time="período selecionado" />}
              {Number(roas) > 0 && <FeedItem color="bg-emerald-400" text={`ROAS de ${roas}x — R$ ${totalRevenue.toLocaleString("pt-BR")} em faturamento estimado`} time="período selecionado" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, highlight = false }: {
  label: string; value: string | number; icon: React.ReactNode; highlight?: boolean;
}) {
  return (
    <Card className={cn("border-border shadow-lg", highlight ? "bg-primary/20 border-emerald-500/30" : "bg-card")}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-lg bg-secondary">{icon}</div>
        </div>
        <div>
          <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">{label}</p>
          <p className="text-2xl font-black text-foreground mt-1">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedItem({ color, text, time }: { color: string; text: string; time: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", color)} />
      <div className="flex-1">
        <p className="text-sm text-foreground/90">{text}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}

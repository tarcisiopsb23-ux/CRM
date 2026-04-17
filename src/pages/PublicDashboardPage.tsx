import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TenantSelector } from "@/components/auth/TenantSelector";
import { SupportBannerBar } from "@/components/auth/SupportLayout";
import { ContractExpiryBanner } from "@/components/ContractExpiryBanner";
import { useTenantStatus } from "@/hooks/useTenantStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ArrowDown, ArrowUp, BarChart3, Briefcase, Calendar,
  CheckCircle2, DollarSign, Info, KanbanSquare, ListFilter, Lock, LogOut,
  Package, MessageCircle as MessageCircleIcon, MousePointerClick,
  PieChart, Settings, Target, TrendingUp, Users, Zap,
} from "lucide-react";import {
  Tooltip as ShadcnTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import { supabase, supabaseCrm } from "@/lib/supabase";
import { toast } from "sonner";
import {
  format, subDays, startOfMonth, endOfMonth,
  subMonths, parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useClientKPIs, useClientKPIHistory } from "@/hooks/useClientKPIs";
import { useClientReports } from "@/hooks/useHubPerformance";
import { useClientConversationKpis } from "@/hooks/useClientConversationKpis";
import { useTrackingInjection } from "@/hooks/useTrackingInjection";
import { useAdClickSessions } from "@/hooks/useAdClickSessions";
import { useGA4Metrics, useGoogleAdsMetrics } from "@/hooks/useGoogleAnalytics";
import { useMetaAdsMetrics } from "@/hooks/useMetaAds";
import { useOAuthTokens } from "@/hooks/useOAuthTokens";
import { useFunnelStats } from "@/hooks/useFunnelStats";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { canManageRole } from "@/hooks/useAuth";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import { MessageCircle } from "lucide-react";
import { CrmSection } from "@/components/crm/CrmSection";
import { AdClickSection } from "@/components/performance/AdClickSection";
import { GoogleMetaDashboard } from "@/components/performance/GoogleMetaDashboard";
import { initiateGoogleOAuth, initiateMetaOAuth } from "@/lib/oauth";
import { KpiResultDialog } from "@/components/kpi/KpiResultDialog";

const isLowerBetter = (name: string) => /cac|cpa|cpl|cpc|cpm|custo/i.test(name);
const KPI_COLORS = ["#10b981","#7C3AED","#f59e0b","#a855f7","#f43f5e","#06b6d4","#e879f9","#34d399"];

export function PublicDashboardPage() {
  const navigate = useNavigate();
  const { session, tenantId, role, isSupport, loading: authLoading, signOut } = useAuth();
  const tenantStatus = useTenantStatus();
  useInactivityLogout();
  const canManage = canManageRole(role, isSupport);
  const [clientData, setClientData] = useState<any>(null);
  const [clientDataLoaded, setClientDataLoaded] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showKpiDialog, setShowKpiDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"performance" | "atendimento" | "crm">("crm");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(
    () => sessionStorage.getItem("support_selected_tenant_id")
  );
  const [selectedTenantName, setSelectedTenantName] = useState<string | undefined>(
    () => sessionStorage.getItem("support_selected_tenant_name") ?? undefined
  );

  // Dashboard flags — todos ativos por padrão após carregar
  const dashPerformance: boolean = clientDataLoaded ? (clientData?.metadata?.dashboard_performance ?? true) : false;
  const dashAtendimento: boolean = clientDataLoaded ? (clientData?.metadata?.dashboard_atendimento ?? true) : false;
  const dashCrm: boolean         = clientDataLoaded ? (clientData?.metadata?.dashboard_crm         ?? true) : false;

  // Dynamic title
  const activeCount = [dashPerformance, dashAtendimento, dashCrm].filter(Boolean).length;
  const dashboardTitle =
    activeCount >= 2 ? "C8 Control" :
    dashAtendimento ? "C8 Control" :
    dashCrm ? "C8 Control" :
    "C8 Control";

  // Ensure activeTab is valid when flags change
  const resolvedTab: "performance" | "atendimento" | "crm" = (() => {
    const enabled = (
      (dashCrm ? ["crm"] : []) as ("performance" | "atendimento" | "crm")[]
    ).concat(
      dashAtendimento ? ["atendimento"] : [],
      dashPerformance ? ["performance"] : []
    );
    if (enabled.length === 0) return "performance";
    return enabled.includes(activeTab as any) ? activeTab as any : enabled[0];
  })();

  // Redirect to login when session is gone
  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/login");
    }
  }, [authLoading, session, navigate]);

  // Fetch client metadata from CRM_DB using RLS (tenant_id from JWT)
  // Suporte com tenant_id próprio (novo modelo): usa tenantId diretamente
  // Suporte sem tenant_id (modelo antigo): usa selectedTenantId do TenantSelector
  const isSupportWithTenant = isSupport && !!tenantId;
  const effectiveTenantId = isSupportWithTenant
    ? tenantId
    : isSupport
      ? selectedTenantId
      : tenantId;
  useEffect(() => {
    if (!effectiveTenantId || effectiveTenantId === "") return;
    const fetchClientData = async () => {
      const { data: clients, error } = await supabaseCrm
        .from("clients")
        .select("id, name, company, favicon_url, metadata")
        .eq("tenant_id", effectiveTenantId)
        .limit(1);
      if (error) console.warn("[Dashboard] erro ao buscar clientData:", error.message);
      if (clients && clients.length > 0) {
        const fresh = clients[0];
        const meta = fresh.metadata ?? {};
        setClientData({
          ...fresh,
          company: fresh.company ?? null,
          metadata: {
            ...meta,
            dashboard_performance: meta.dashboard_performance ?? true,
            dashboard_atendimento: meta.dashboard_atendimento ?? true,
            dashboard_crm:         meta.dashboard_crm         ?? true,
            dashboard_crm:         fresh.dashboard_crm         ?? true,
          },
        });
      }
      setClientDataLoaded(true);
    };
    fetchClientData();
  }, [effectiveTenantId]);

  // Tracking injection removed — GTM and Meta Pixel are now injected only
  // in the WhatsAppRedirectPage (/wa) to avoid tracking the client dashboard.

  // clientId is the effective tenant ID (support uses selectedTenantId)
  const clientId: string | undefined = effectiveTenantId ?? undefined;

  const kpisQuery = useClientKPIs(clientId);
  const kpiHistoryQuery = useClientKPIHistory(clientId);
  const kpis = (kpisQuery.data ?? []) as any[];
  const kpiHistory = (kpiHistoryQuery.data ?? []) as any[];
  const { campaignDataQuery, dailyMetricsQuery } = useClientReports(clientId, dateRange);
  const realCampaigns = (campaignDataQuery.data ?? []) as any[];
  const realDailyMetrics = (dailyMetricsQuery.data ?? []) as any[];
  const adClickQuery = useAdClickSessions(clientId, dateRange);
  const { googleToken, metaToken } = useOAuthTokens(clientId);
  const ga4Query = useGA4Metrics(googleToken ? clientId : undefined, dateRange);
  const gadsQuery = useGoogleAdsMetrics(googleToken ? clientId : undefined, dateRange);
  const metaQuery = useMetaAdsMetrics(metaToken ? clientId : undefined, dateRange);

  // totals must be declared before funnelStats (which references it)
  const totals = useMemo(() => realDailyMetrics.reduce((acc: any, curr: any) => ({
    spend: acc.spend + (curr.total_spend || 0),
    leads: acc.leads + (curr.total_leads || 0),
    sales: acc.sales + (curr.total_sales || 0),
    revenue: acc.revenue + (curr.revenue || 0),
    impressions: acc.impressions + (curr.impressions || 0),
    clicks: acc.clicks + (curr.clicks || 0),
  }), { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 }), [realDailyMetrics]);

  const funnelStats = useFunnelStats(clientId, dateRange);

  const handleLogoff = async () => {
    await signOut();
    navigate("/login");
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return;
    try {
      const { data: client } = await supabase.from("clients").select("id, metadata").limit(1).single();
      if (!client) return;
      const { error } = await supabase.from("clients")
        .update({ metadata: { ...(client.metadata as any || {}), dashboard_password: newPassword.trim() } })
        .eq("id", client.id);
      if (error) throw error;
      toast.success("Senha atualizada com sucesso!");
      setShowPasswordDialog(false);
      setNewPassword("");
    } catch { toast.error("Erro ao atualizar senha."); }
  };

  // ── Consolidated metrics: real API data takes priority over manual daily_metrics ──
  const consolidated = useMemo(() => {
    const gads = gadsQuery.data;
    const meta = metaQuery.data;
    const funnel = funnelStats.data;
    const adClicks = adClickQuery.data?.totalClicks ?? 0;

    // Spend: Google Ads + Meta Ads, fallback to daily_metrics
    const spend = (gads || meta)
      ? (gads?.spend ?? 0) + (meta?.spend ?? 0)
      : totals.spend;

    // Impressions: Google Ads + Meta Ads, fallback to daily_metrics
    const impressions = (gads || meta)
      ? (gads?.impressions ?? 0) + (meta?.impressions ?? 0)
      : totals.impressions;

    // Clicks: Google Ads + Meta Ads + ad_click_sessions, fallback to daily_metrics
    const clicks = (gads || meta || adClicks > 0)
      ? (gads?.clicks ?? 0) + (meta?.clicks ?? 0) + adClicks
      : totals.clicks;

    // Leads: CRM "novo" stage history, fallback to daily_metrics
    const leads = funnel ? funnel.novo : totals.leads;

    // Qualified: CRM "contato" stage history
    const qualified = funnel?.contato ?? 0;

    // Sales: CRM "fechado" stage history, fallback to daily_metrics
    const sales = funnel ? funnel.fechado : totals.sales;

    // Revenue: from daily_metrics (manually entered or API-fed)
    const revenue = totals.revenue;

    const roas = spend > 0 ? (revenue / spend).toFixed(1) : "0.0";
    const conversionRate = leads > 0 ? ((sales / leads) * 100).toFixed(1) : "0.0";
    const cpa = sales > 0 ? (spend / sales).toFixed(0) : "0";

    // Daily chart: merge Google Ads + Meta Ads by day, fallback to daily_metrics
    const dailyMap = new Map<string, { date: string; total_spend: number; revenue: number; total_leads: number; impressions: number; clicks: number }>();
    // Start with daily_metrics as base
    for (const d of realDailyMetrics) {
      dailyMap.set(d.date, { ...d });
    }
    // Override/merge with Google Ads daily data
    if (gads?.byDay) {
      for (const d of gads.byDay) {
        const existing = dailyMap.get(d.date) ?? { date: d.date, total_spend: 0, revenue: 0, total_leads: 0, impressions: 0, clicks: 0 };
        dailyMap.set(d.date, { ...existing, total_spend: existing.total_spend + d.spend, clicks: existing.clicks + d.clicks });
      }
    }
    // Merge Meta Ads daily data
    if (meta?.byDay) {
      for (const d of meta.byDay) {
        const existing = dailyMap.get(d.date) ?? { date: d.date, total_spend: 0, revenue: 0, total_leads: 0, impressions: 0, clicks: 0 };
        dailyMap.set(d.date, {
          ...existing,
          total_spend: existing.total_spend + d.spend,
          impressions: existing.impressions + d.impressions,
          clicks: existing.clicks + d.clicks,
          total_leads: existing.total_leads + d.leads,
        });
      }
    }
    const dailyData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Campaigns: Google Ads + Meta Ads merged with ad_click_sessions by campaign name
    // Normalize name for matching: lowercase + trim
    const normalize = (s: string) => s.toLowerCase().trim();

    // Build ad_click_sessions map: normalized campaign name → tracked clicks count
    const adClicksByCampaign = new Map<string, number>();
    if (adClickQuery.data?.byCampaign) {
      for (const c of adClickQuery.data.byCampaign) {
        const key = normalize(c.campaign);
        adClicksByCampaign.set(key, (adClicksByCampaign.get(key) ?? 0) + c.clicks);
      }
    }

    const campaigns: {
      platform: string; name: string; spend: number;
      leads: number; sales: number; revenue: number;
      trackedClicks: number; // from ad_click_sessions
    }[] = [];

    if (gads?.byCampaign?.length) {
      for (const c of gads.byCampaign) {
        campaigns.push({
          platform: "Google Ads", name: c.campaign,
          spend: c.spend, leads: 0, sales: c.conversions, revenue: c.roas * c.spend,
          trackedClicks: adClicksByCampaign.get(normalize(c.campaign)) ?? 0,
        });
      }
    }
    if (meta?.byCampaign?.length) {
      for (const c of meta.byCampaign) {
        campaigns.push({
          platform: "Meta Ads", name: c.campaign_name,
          spend: c.spend, leads: c.leads, sales: c.purchases, revenue: c.roas * c.spend,
          trackedClicks: adClicksByCampaign.get(normalize(c.campaign_name)) ?? 0,
        });
      }
    }

    // If no API campaigns, fall back to campaign_data + enrich with ad_click_sessions
    const finalCampaigns = campaigns.length > 0
      ? campaigns
      : realCampaigns.map((c: any) => ({
          ...c,
          trackedClicks: adClicksByCampaign.get(normalize(c.name ?? "")) ?? 0,
        }));

    // Add campaigns that exist ONLY in ad_click_sessions (no API match)
    // These are campaigns tracked via the /wa link but not connected to any ad platform API
    const matchedNames = new Set(finalCampaigns.map((c: any) => normalize(c.name ?? "")));
    const adOnlyCampaigns: typeof campaigns = [];
    for (const [normName, trackedClicks] of adClicksByCampaign.entries()) {
      if (!matchedNames.has(normName)) {
        // Find original (non-normalized) name and source from byCampaign
        const original = adClickQuery.data?.byCampaign.find(
          c => normalize(c.campaign) === normName
        );
        adOnlyCampaigns.push({
          platform: original?.source ?? "Link Rastreado",
          name: original?.campaign ?? normName,
          spend: 0,
          leads: 0,
          sales: 0,
          revenue: 0,
          trackedClicks,
        });
      }
    }

    const allCampaigns = [...finalCampaigns, ...adOnlyCampaigns]
      .sort((a: any, b: any) => (b.trackedClicks + (b.spend ?? 0)) - (a.trackedClicks + (a.spend ?? 0)));

    return { spend, impressions, clicks, leads, qualified, sales, revenue, roas, conversionRate, cpa, dailyData, finalCampaigns: allCampaigns };
  }, [gadsQuery.data, metaQuery.data, funnelStats.data, adClickQuery.data, totals, realDailyMetrics, realCampaigns]);

  // KPI cards – mês atual vs anterior
  const kpiCards = useMemo(() => {
    return kpis.map((kpi, idx) => {
      // Pega todos os registros deste KPI ordenados do mais recente ao mais antigo
      const kpiEntries = kpiHistory
        .filter(h => h.kpi_id === kpi.id)
        .sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));

      const current = kpiEntries[0]?.value ?? null;
      // Se há apenas 1 registro, prev = 0 para permitir comparação
      const prev = kpiEntries.length >= 2 ? kpiEntries[1].value : (kpiEntries.length === 1 ? 0 : null);
      const growth = current !== null && prev !== null
        ? (prev !== 0 ? ((current - prev) / prev) * 100 : (current > 0 ? 100 : 0))
        : null;
      return { ...kpi, current, prev, growth, color: KPI_COLORS[idx % KPI_COLORS.length] };
    });
  }, [kpis, kpiHistory]);

  // Sparkline – até 12 meses, baseado nos registros existentes
  const kpiSparkline = useMemo(() => {
    const allMonths = kpiHistory.map(h => String(h.month_year).slice(0, 7));
    const uniqueMonths = [...new Set(allMonths)].sort();
    // Pega até 12 meses mais recentes com pelo menos 1 registro
    const relevantMonths = uniqueMonths.slice(-12);
    const byKpi = new Map<string, { month: string; value: number }[]>();
    for (const kpi of kpis) {
      byKpi.set(kpi.id, relevantMonths.map(mk => ({
        month: mk,
        value: kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value ?? 0,
      })));
    }
    return byKpi;
  }, [kpis, kpiHistory]);

  // Evolução longo prazo – até 12 meses com registros
  const longTermData = useMemo(() => {
    const allMonths = kpiHistory.map(h => String(h.month_year).slice(0, 7));
    const uniqueMonths = [...new Set(allMonths)].sort();
    const relevantMonths = uniqueMonths.slice(-12);
    return relevantMonths.map(monthStr => {
      const point: any = { name: format(parseISO(monthStr + "-01"), "MMM/yy", { locale: ptBR }) };
      kpis.forEach(kpi => {
        const h = kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(monthStr));
        point[kpi.name] = h ? h.value : null;
      });
      return point;
    });
  }, [kpis, kpiHistory]);

  // Tabela comparativa de performance
  const perfRows = useMemo(() => {
    const currentKey = format(new Date(), "yyyy-MM");
    const fmt = (v: number, unit: string) =>
      unit === "currency" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
      : unit === "percentage" ? `${v.toFixed(2)}%` : String(v);
    return kpis.map(kpi => {
      const history = kpiHistory.filter(h => h.kpi_id === kpi.id);
      const current = history.find(h => String(h.month_year).startsWith(currentKey))?.value ?? null;
      const avg = history.length > 0 ? history.reduce((a, h) => a + h.value, 0) / history.length : null;
      const target = kpi.target_value ?? null;
      const vsAvg = current !== null && avg !== null && avg !== 0 ? ((current - avg) / avg) * 100 : null;
      const pctMeta = current !== null && target !== null && target !== 0 ? (current / target) * 100 : null;
      const lower = isLowerBetter(kpi.name);
      let status = "Sem dados";
      if (vsAvg !== null) {
        if (pctMeta !== null && (lower ? pctMeta <= 100 : pctMeta >= 100)) status = "Meta atingida";
        else if (pctMeta !== null && (lower ? pctMeta <= 105 : pctMeta >= 90)) status = "Próximo da meta";
        else if (lower ? vsAvg <= -5 : vsAvg >= 5) status = "Acima da média";
        else if (lower ? vsAvg >= 5 : vsAvg <= -5) status = "Abaixo da média";
        else status = "Na média";
      }
      return { kpi, current, avg, target, vsAvg, pctMeta, status, fmt };
    });
  }, [kpis, kpiHistory]);

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#111827]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#7C3AED] border-t-transparent" />
        <p className="text-slate-400 font-medium tracking-wide">Iniciando C8 Control...</p>
      </div>
    </div>
  );

  // Suporte sem tenant_id (modelo antigo) — mostrar seletor de tenant
  // Suporte com tenant_id (novo modelo do Maestr.IA) — vai direto para o dashboard
  if (isSupport && !tenantId && !selectedTenantId) {
    return (
      <TenantSelector
        onSelect={(id, name) => {
          setSelectedTenantId(id);
          setSelectedTenantName(name);
          sessionStorage.setItem("support_selected_tenant_id", id);
          sessionStorage.setItem("support_selected_tenant_name", name);
          void supabaseCrm.from("audit_logs").insert({
            tenant_id:  id,
            user_id:    session?.user?.id ?? "unknown",
            user_email: session?.user?.email ?? null,
            user_role:  "agency",
            action:     `Suporte acessou dashboard do tenant: ${name ?? id}`,
            category:   "support",
            ip_hint:    "browser",
          });
        }}
      />
    );
  }

  // Use consolidated values (real API data > manual daily_metrics)
  const roas = consolidated.roas;
  const cpa = consolidated.cpa;
  const conversionRate = consolidated.conversionRate;
  const selectedKpi = kpis.find(k => k.id === (activeKpiId ?? kpis[0]?.id)) ?? kpis[0];
  const selectedColor = selectedKpi ? KPI_COLORS[kpis.indexOf(selectedKpi) % KPI_COLORS.length] : "#7C3AED";

  const fmtVal = (v: number, unit: string) =>
    unit === "currency" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
    : unit === "percentage" ? `${v}%` : String(v);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8 selection:bg-[#7C3AED]/30">
        <div className="max-w-[1600px] mx-auto space-y-8">

          {/* -- BANNER DE VENCIMENTO DE CONTRATO -- */}
          {!isSupport && tenantStatus.isNearExpiry && tenantStatus.contractEnd && (
            <ContractExpiryBanner contractEnd={tenantStatus.contractEnd} />
          )}

          {/* -- BANNER DE SUPORTE (seção exclusiva, acima do header) -- */}
          {isSupport && (
            <SupportBannerBar />
          )}

          {/* -- HEADER -- */}
          <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-8">
            {/* Logo + título */}
            <div className="flex items-center gap-3 min-w-0">
              {clientData?.metadata?.avatar_url ? (
                <img src={clientData.metadata.avatar_url} alt="Logo" className="h-10 w-10 rounded-xl shadow-lg object-cover shrink-0" />
              ) : (
                <img src={clientData?.favicon_url ?? "/favicon.png"} alt="Logo" className="h-10 w-10 rounded-xl shadow-lg object-contain shrink-0" />
              )}
              <div className="min-w-0">
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">{dashboardTitle}</h1>
                {(clientData?.metadata?.display_name || clientData?.company || clientData?.name) && (
                  <p className="text-slate-300 font-bold text-sm truncate">
                    {clientData?.metadata?.display_name || clientData?.company || clientData?.name}
                  </p>
                )}
              </div>
            </div>

            {/* Filtros + perfil — agrupados no canto direito */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Filtro de período */}
              <PeriodDropdown dateRange={dateRange} onChange={setDateRange} />

              {/* Menu perfil */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-slate-200 gap-2 h-10">
                    {clientData?.metadata?.avatar_url ? (
                      <img src={clientData.metadata.avatar_url} alt="Avatar" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-[#7C3AED] flex items-center justify-center text-[10px] font-black text-white">
                        {(() => {
                          const name = clientData?.metadata?.display_name || clientData?.name || "";
                          const parts = name.trim().split(/\s+/);
                          return parts.length >= 2
                            ? (parts[0][0] + parts[1][0]).toUpperCase()
                            : name.slice(0, 2).toUpperCase() || "?";
                        })()}
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1E293B] border-slate-800 text-slate-200 w-56 shadow-2xl" align="end">
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => navigate("/dashboard/profile")}>
                    <Settings className="h-4 w-4 text-[#7C3AED]" />
                    <span className="text-sm font-bold">Meu Perfil / Integrações</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => setShowKpiDialog(true)}>
                    <BarChart3 className="h-4 w-4 text-[#7C3AED]" />
                    <span className="text-sm font-bold">Registrar Resultado KPI</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => navigate("/dashboard/catalog")}>
                    <Package className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-bold">Produtos/Serviços</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => navigate("/dashboard/payments")}>
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-bold">Faturas e Pagamentos</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => navigate("/dashboard/whatsapp-sync")}>
                    <MessageCircleIcon className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-bold">WhatsApp → CRM</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => setShowPasswordDialog(true)}>
                    <Lock className="h-4 w-4 text-orange-400" />
                    <span className="text-sm font-bold">Alterar Senha</span>
                  </DropdownMenuItem>
                  {canManage && (<>
                    <DropdownMenuSeparator className="bg-slate-800" />
                    <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => navigate("/dashboard/logs")}>
                      <ListFilter className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-bold">Logs de Auditoria</span>
                    </DropdownMenuItem>
                  </>)}
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-red-900/40 focus:text-red-400 text-red-400 hover:bg-red-900/40 cursor-pointer py-3" onClick={handleLogoff}>
                    <LogOut className="h-4 w-4" />
                    <span className="text-sm font-bold">Encerrar Sessão</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Dialog senha */}
          <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
            <DialogContent className="bg-[#1E293B] border-slate-800 text-slate-100">
              <DialogHeader>
                <DialogTitle>Alterar Senha de Acesso</DialogTitle>
                <DialogDescription className="text-slate-400">Defina uma nova senha para acessar este dashboard.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-2">
                <Label htmlFor="np">Nova Senha</Label>
                <Input id="np" type="password" placeholder="????????" className="bg-slate-900 border-slate-700 text-white h-12"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowPasswordDialog(false)}>Cancelar</Button>
                <Button onClick={handleChangePassword} className="bg-[#7C3AED] hover:bg-[#7C3AED]/90">Salvar Nova Senha</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* KPI Result Dialog */}
          <KpiResultDialog
            open={showKpiDialog}
            onClose={() => setShowKpiDialog(false)}
            clientId={clientId ?? ""}
          />

          {/* -- TABS (s? aparece quando ambos ativos) -- */}
          {activeCount >= 2 && (
            <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700 w-fit">
              {dashCrm && (
                <button
                  onClick={() => setActiveTab("crm")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    resolvedTab === "crm"
                      ? "bg-[#7C3AED] text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <KanbanSquare className="h-4 w-4" /> CRM
                </button>
              )}
              {dashAtendimento && (
                <button
                  onClick={() => setActiveTab("atendimento")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    resolvedTab === "atendimento"
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" /> Atendimento
                </button>
              )}
              {dashPerformance && (
                <button
                  onClick={() => setActiveTab("performance")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    resolvedTab === "performance"
                      ? "bg-[#7C3AED] text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <BarChart3 className="h-4 w-4" /> Performance
                </button>
              )}
            </div>
          )}

          {/* -- CONTEÚDO: PERFORMANCE -- */}
          {resolvedTab === "performance" && (
          <div className="space-y-8">

          {/* -- 1. MÉTRICAS DE ANÚNCIOS -- */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="Investimento" value={`R$ ${consolidated.spend.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5 text-[#7C3AED]" />} info="Total ad spend from Google Ads + Meta Ads in the selected period. Falls back to manually entered data if APIs are not connected." />
            <MetricCard label="Leads" value={consolidated.leads} icon={<Users className="h-5 w-5 text-blue-400" />} info="Leads that entered the CRM pipeline (stage: New) in the period, tracked via stage history." />
            <MetricCard label="Vendas" value={consolidated.sales} icon={<Target className="h-5 w-5 text-emerald-400" />} info="Deals closed in the CRM (stage: Closed) in the period, tracked via stage history." />
            <MetricCard label="Conversão" value={`${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} info="Percentage of leads that became closed deals (Closed ÷ New × 100)." />
            <MetricCard label="Faturamento Estimado" value={`R$ ${consolidated.revenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-white" />} info="Estimated revenue from closed deals in the period." highlight />
            <MetricCard label="ROAS" value={`${roas}x`} icon={<PieChart className="h-5 w-5 text-orange-400" />} info="Return on Ad Spend — revenue ÷ ad spend. A ROAS of 4x means every R$1 spent generated R$4 in revenue." />
          </div>

          {/* -- 2. EVOLUÇÃO DIÁRIA + FUNIL -- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            <div className="lg:col-span-2">
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between shrink-0">
                  <div>
                    <CardTitle className="text-xl font-bold text-white">Evolução Diária</CardTitle>
                    <p className="text-sm text-slate-400 mt-1">Investimento vs Faturamento vs Leads</p>
                  </div>
                  <InfoTooltip text="Acompanhe dia a dia a evolução do investimento em anúncios, do faturamento estimado e do volume de leads gerados. Permite identificar picos de performance, sazonalidades e o impacto de ajustes nas campanhas ao longo do período." />
                </CardHeader>
                <CardContent className="flex-1 min-h-[450px] pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={consolidated.dailyData}>
                      <defs>
                        <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }}
                        tickFormatter={s => format(new Date(String(s)), "dd/MM")} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
                      <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                      <Area type="monotone" dataKey="revenue" name="Faturamento Est. (R$)" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#gRev)" />
                      <Area type="monotone" dataKey="total_spend" name="Investimento (R$)" stroke="#7C3AED" strokeWidth={4} fillOpacity={1} fill="url(#gSpend)" />
                      <Line type="monotone" dataKey="total_leads" name="Leads" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-xl font-bold text-white">Funil de Conversão</CardTitle>
                <InfoTooltip text="Visualize como os usuários avançam em cada etapa da jornada de compra: de impressões até vendas fechadas. As taxas entre etapas revelam onde há maior perda e onde focar otimizações." />
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center pt-6">
                <ModernFunnel textVariant="white" steps={[
                  {
                    label: "Impressões",
                    value: consolidated.impressions.toLocaleString("pt-BR"),
                    color: "bg-slate-700", width: "w-full",
                    percentage: ((consolidated.clicks / (consolidated.impressions || 1)) * 100).toFixed(1) + "%",
                    rateLabel: "CTR"
                  },
                  {
                    label: "Cliques",
                    value: consolidated.clicks.toLocaleString("pt-BR"),
                    color: "bg-[#7C3AED]/40", width: "w-[88%]",
                    percentage: ((consolidated.leads / (consolidated.clicks || 1)) * 100).toFixed(1) + "%",
                    rateLabel: "TX. CONV."
                  },
                  {
                    label: "Leads (Novos)",
                    value: consolidated.leads.toLocaleString("pt-BR"),
                    color: "bg-blue-500/40", width: "w-[76%]",
                    percentage: ((consolidated.qualified / (consolidated.leads || 1)) * 100).toFixed(1) + "%",
                    rateLabel: "QUALIF."
                  },
                  {
                    label: "Qualificados",
                    value: consolidated.qualified.toLocaleString("pt-BR"),
                    color: "bg-indigo-500/40", width: "w-[64%]",
                    percentage: ((consolidated.sales / (consolidated.qualified || 1)) * 100).toFixed(1) + "%",
                    rateLabel: "TX. FECH."
                  },
                  {
                    label: "Fechados",
                    value: consolidated.sales.toLocaleString("pt-BR"),
                    color: "bg-emerald-500/40", width: "w-[52%]"
                  },
                ]} />
                <div className="mt-8 pt-6 border-t border-slate-700 text-center w-full">
                  <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Resultado Final</p>
                  <p className="text-3xl font-black text-emerald-400 mt-2">R$ {consolidated.revenue.toLocaleString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* -- 3. TOP CAMPANHAS -- */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white">Top Campanhas do Período</CardTitle>
              <InfoTooltip text="Ranking das campanhas com maior volume de resultado no período. Compare eficiência entre campanhas e plataformas – identifique quais geram melhor ROAS e menor custo por aquisição para direcionar o investimento." />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                      <th className="pb-4">Plataforma</th>
                      <th className="pb-4">Campanha</th>
                      <th className="pb-4">Invest.</th>
                      <th className="pb-4 text-center">Cliques API</th>
                      <th className="pb-4 text-center">Cliques Rastr.</th>
                      <th className="pb-4 text-center">Leads</th>
                      <th className="pb-4 text-center">Vendas</th>
                      <th className="pb-4 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {consolidated.finalCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 text-sm italic">
                          Sem dados de campanhas para este período.
                        </td>
                      </tr>
                    ) : consolidated.finalCampaigns.map((c: any, idx: number) => {
                      const roasCamp = c.spend > 0 ? (c.revenue / c.spend).toFixed(1) : "0.0";
                      return (
                        <tr key={c.id ?? c.name ?? idx} className="text-sm hover:bg-slate-800/30 transition-colors">
                          <td className="py-4 text-slate-400 font-bold">{c.platform}</td>
                          <td className="py-4 font-bold text-slate-200">{c.name}</td>
                          <td className="py-4 text-slate-400">R$ {(c.spend || 0).toLocaleString("pt-BR")}</td>
                          <td className="py-4 text-slate-400 font-bold text-center">{(c.clicks ?? "—")}</td>
                          <td className="py-4 text-center">
                            {(c.trackedClicks ?? 0) > 0
                              ? <span className="text-violet-400 font-black">{c.trackedClicks}</span>
                              : <span className="text-slate-600">—</span>
                            }
                          </td>
                          <td className="py-4 text-slate-400 font-bold text-center">{c.leads ?? "—"}</td>
                          <td className="py-4 text-slate-400 font-bold text-center">{c.sales ?? "—"}</td>
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

          {/* -- 4. INDICADORES DE NEGÓCIO (KPIs manuais) -- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#7C3AED]" />
                  Indicadores de Negócio
                </CardTitle>
                <InfoTooltip text="Indicadores-chave de negócio registrados manualmente pela equipe. Cada card exibe o valor do mês atual e o badge colorido mostra a variação percentual em relação ao mês anterior (MoM – Month over Month)." />
              </CardHeader>
              <CardContent>
                {kpisQuery.isError ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-400">
                    <BarChart3 className="h-10 w-10 opacity-40" />
                    <p className="text-sm text-center">Erro ao carregar indicadores.<br /><span className="text-xs text-slate-500">Verifique o console para detalhes.</span></p>
                  </div>
                ) : kpisQuery.isLoading ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Carregando...</div>
                ) : kpis.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                    <BarChart3 className="h-10 w-10 opacity-20" />
                    <p className="text-sm text-center">Nenhum indicador cadastrado ainda.<br />Os KPIs aparecerão aqui após serem configurados.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kpiCards.map(kpi => {
                      const pctMeta = kpi.target_value && kpi.current !== null
                        ? Math.min((kpi.current / kpi.target_value) * 100, 150)
                        : null;
                      const metaOk = pctMeta !== null && (isLowerBetter(kpi.name) ? pctMeta <= 100 : pctMeta >= 100);
                      const metaColor = pctMeta === null ? "#475569"
                        : metaOk ? "#10b981"
                        : pctMeta >= 80 ? "#f59e0b"
                        : "#ef4444";
                      return (
                        <Card key={kpi.id} className="bg-slate-900/30 border-slate-800 p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + "18" }}>
                              <BarChart3 className="h-4 w-4" style={{ color: kpi.color }} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              {kpi.growth !== null && (
                                <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  (isLowerBetter(kpi.name) ? kpi.growth <= 0 : kpi.growth >= 0)
                                    ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                                )}>
                                  {kpi.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                  {Math.abs(kpi.growth).toFixed(0)}%
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">{kpi.name}</p>
                          <p className="text-2xl font-black text-white mt-1">
                            {kpi.current !== null ? fmtVal(kpi.current, kpi.unit) : <span className="text-slate-600 text-base font-bold">Sem dados</span>}
                          </p>
                          {/* Meta progress */}
                          {kpi.target_value !== null && (
                            <div className="mt-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500">Meta: {fmtVal(kpi.target_value, kpi.unit)}/mês</span>
                                {pctMeta !== null && (
                                  <span className="text-[10px] font-black" style={{ color: metaColor }}>
                                    {pctMeta.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(pctMeta ?? 0, 100)}%`, backgroundColor: metaColor }} />
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Observações Estratégicas */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white">Observações Estratégicas</CardTitle>
                <InfoTooltip text="Análise automática dos principais números do período: eficiência de custo por aquisição (CPA), retorno sobre investimento em anúncios (ROAS) e volume de leads gerados. Use como ponto de partida para decisões estratégicas." />
              </CardHeader>
              <CardContent className="space-y-3">
                <InsightItem icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  text={<>Eficiência: CPA calculado em <span className="text-emerald-400 font-bold">R$ {cpa}</span> no período.</>} />
                <InsightItem icon={<TrendingUp className="h-4 w-4 text-[#7C3AED]" />}
                  text={<>ROAS de <span className="text-[#7C3AED] font-bold">{roas}x</span> – cada R$ 1 investido gerou R$ {roas} em faturamento estimado.</>} />
                <InsightItem icon={<Users className="h-4 w-4 text-blue-400" />}
                  text={<><span className="text-blue-400 font-bold">{consolidated.leads}</span> leads gerados com taxa de conversão de <span className="text-blue-400 font-bold">{conversionRate}%</span>.</>} />
                {kpiCards.filter(k => k.growth !== null && (isLowerBetter(k.name) ? k.growth <= -5 : k.growth >= 5)).slice(0, 2).map(k => (
                  <InsightItem key={k.id} icon={<Zap className="h-4 w-4 text-yellow-400" />}
                    text={<><span className="text-yellow-400 font-bold">{k.name}</span>: variação de {k.growth! >= 0 ? "+" : ""}{k.growth!.toFixed(1)}% vs mês anterior.</>} />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* -- 4. EVOLUÇÃO DE LONGO PRAZO -- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#7C3AED]" />
                  Evolução de Longo Prazo
                  <InfoTooltip text="Gráfico de barras com a evolução mensal de cada KPI nos últimos 12 meses. Selecione o indicador desejado pelos botões acima do gráfico." />
                </h2>
                <p className="text-sm text-slate-400 mt-1">Últimos 12 meses – selecione o indicador</p>
              </div>
            </div>
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
              <CardContent className="pt-6">
                {kpis.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                    <TrendingUp className="h-10 w-10 opacity-20" />
                    <p className="text-sm text-center">Nenhum indicador cadastrado ainda.<br />O gráfico de evolução aparecerá aqui após a configuração dos KPIs.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {kpis.map((kpi, idx) => {
                        const color = KPI_COLORS[idx % KPI_COLORS.length];
                        const isActive = (activeKpiId ?? kpis[0]?.id) === kpi.id;
                        return (
                          <button key={kpi.id} onClick={() => setActiveKpiId(kpi.id)}
                            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border",
                              isActive ? "text-white border-transparent" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300"
                            )}
                            style={isActive ? { backgroundColor: color + "22", borderColor: color, color } : {}}
                          >{kpi.name}</button>
                        );
                      })}
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={longTermData} barSize={24}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px", color: "#fff" }}
                          itemStyle={{ color: "#fff" }}
                          labelStyle={{ color: "#a855f7", fontWeight: "bold", marginBottom: "4px" }}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          formatter={(value: any) => selectedKpi ? [fmtVal(value, selectedKpi.unit), selectedKpi.name] : [value, ""]}
                        />
                        <Bar dataKey={selectedKpi?.name ?? ""} radius={[6, 6, 0, 0]}
                          fill={selectedColor} opacity={0.85}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* -- 6. PAINEL DE KPIs — resultado do mês vs meta + histórico 6 meses -- */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                <ListFilter className="h-5 w-5 text-[#7C3AED]" />
                Painel de KPIs
              </CardTitle>
              <InfoTooltip text="Resultado do mês atual de cada KPI comparado à meta mensal e ao histórico dos últimos 6 meses. A barra de progresso mostra o quanto da meta foi atingido no mês corrente." />
            </CardHeader>
            <CardContent className="p-0">
              {kpis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                  <ListFilter className="h-10 w-10 opacity-20" />
                  <p className="text-sm text-center">Nenhum indicador cadastrado.<br />Configure os KPIs em Perfil → Configurações.</p>
                </div>
              ) : (() => {
                // Meses com registros (mín 1, máx 12), ordenados do mais antigo ao mais recente
                const allHistoryMonths = [...new Set(kpiHistory.map(h => String(h.month_year).slice(0, 7)))].sort();
                const panelMonthKeys = allHistoryMonths.slice(-12);
                // Mês mais recente com registro = "atual"
                const currentKey = panelMonthKeys[panelMonthKeys.length - 1] ?? format(new Date(), "yyyy-MM");
                // Colunas históricas: todos exceto o mais recente (até 5)
                const histCols = panelMonthKeys.slice(0, -1).slice(-5);
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/40">
                          <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 min-w-[160px]">KPI</th>
                          <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Mês Atual</th>
                          <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Meta/Mês</th>
                          <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap min-w-[140px]">Progresso</th>
                          <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">MoM</th>
                          {histCols.map(mk => (
                            <th key={mk} className="px-3 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                              {format(parseISO(mk + "-01"), "MMM/yy", { locale: ptBR })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {kpiCards.map(kpi => {
                          const lower = isLowerBetter(kpi.name);
                          const pct = kpi.target_value && kpi.current !== null
                            ? (kpi.current / kpi.target_value) * 100 : null;
                          const metaOk = pct !== null && (lower ? pct <= 100 : pct >= 100);
                          const barColor = pct === null ? "#475569" : metaOk ? "#10b981" : pct >= 80 ? "#f59e0b" : "#ef4444";
                          const growthOk = kpi.growth !== null && (lower ? kpi.growth <= 0 : kpi.growth >= 0);
                          return (
                            <tr key={kpi.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: kpi.color }} />
                                  <p className="text-sm font-bold text-white">{kpi.name}</p>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm font-black text-white whitespace-nowrap">
                                {kpi.current !== null ? fmtVal(kpi.current, kpi.unit) : <span className="text-slate-600 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-4 text-sm text-slate-400 whitespace-nowrap">
                                {kpi.target_value !== null ? fmtVal(kpi.target_value, kpi.unit) : <span className="text-slate-600 text-xs italic">sem meta</span>}
                              </td>
                              <td className="px-4 py-4">
                                {pct !== null ? (
                                  <div className="space-y-1 min-w-[120px]">
                                    <div className="flex justify-between">
                                      <span className="text-[10px] font-black" style={{ color: barColor }}>{Math.min(pct, 150).toFixed(0)}%</span>
                                      {metaOk && <span className="text-[10px] text-emerald-400 font-bold">✓ Meta</span>}
                                    </div>
                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                                    </div>
                                  </div>
                                ) : <span className="text-slate-700 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                {kpi.growth !== null ? (
                                  <span className={cn("flex items-center gap-1 text-xs font-black", growthOk ? "text-emerald-400" : "text-red-400")}>
                                    {kpi.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                    {Math.abs(kpi.growth).toFixed(1)}%
                                  </span>
                                ) : <span className="text-slate-600 text-xs">—</span>}
                              </td>
                              {histCols.map(mk => {
                                const val = kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value;
                                return (
                                  <td key={mk} className="px-3 py-4 text-center text-xs font-bold whitespace-nowrap text-slate-400">
                                    {val !== undefined ? fmtVal(val, kpi.unit) : <span className="text-slate-700">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* -- 7. GOOGLE + META DASHBOARD -- */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white">Google & Meta Ads</CardTitle>
              <InfoTooltip text="Dados de campanhas, gastos, conversões e ROAS do Google Analytics, Google Ads e Meta Ads. Conecte suas contas em Perfil → Integrações para ver os dados aqui." />
            </CardHeader>
            <CardContent>
              <GoogleMetaDashboard
                ga4={ga4Query.data}
                gads={gadsQuery.data}
                meta={metaQuery.data}
                googleConnected={!!googleToken}
                metaConnected={!!metaToken}
                isLoadingGoogle={ga4Query.isLoading || gadsQuery.isLoading}
                isLoadingMeta={metaQuery.isLoading}
                onConnectGoogle={() => clientId && initiateGoogleOAuth(clientId)}
                onConnectMeta={() => clientId && initiateMetaOAuth(clientId)}
              />
            </CardContent>
          </Card>

          {/* -- 9. CLIQUES DE ANÚNCIOS -- */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                <MousePointerClick className="h-5 w-5 text-violet-400" />
                Cliques de Anúncios
              </CardTitle>
              <InfoTooltip text="Cliques capturados via link intermediário com rastreamento de UTMs. Mostra de onde vêm os cliques, quais campanhas geram mais tráfego e a taxa de conversão em leads." />
            </CardHeader>
            <CardContent>
              <AdClickSection
                stats={adClickQuery.data ?? { totalClicks: 0, uniqueCampaigns: 0, byCampaign: [], bySource: [], byDay: [], conversionRate: 0 }}
                isLoading={adClickQuery.isLoading}
              />
            </CardContent>
          </Card>

          </div>
          )}
          {/* -- CONTEÚDO: ATENDIMENTO -- */}
          {resolvedTab === "atendimento" && (
            <AtendimentoSection
            clientId={clientId}
              dateRange={dateRange}
              hasN8n={!!(clientData?.metadata?.n8n_api_key?.trim())}
            />
          )}

          {resolvedTab === "crm" && (
            <CrmSection clientId={clientId} clientMetadata={clientData?.metadata} />
          )}

          <footer className="text-center pt-8 border-t border-slate-800">
            <p className="text-slate-600 text-[10px] uppercase tracking-widest font-bold">
              &copy; {new Date().getFullYear()} Agência C8. Todos os Direitos Reservados.
            </p>
          </footer>

        </div>
      </div>
    </TooltipProvider>
  );
}

function PeriodDropdown({
  dateRange,
  onChange,
}: {
  dateRange: { from: string; to: string };
  onChange: (r: { from: string; to: string }) => void;
}) {
  const presets = [
    { label: "Hoje",           from: format(new Date(), "yyyy-MM-dd"),                            to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 7 dias", from: format(subDays(new Date(), 6), "yyyy-MM-dd"),                to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 15 dias",from: format(subDays(new Date(), 14), "yyyy-MM-dd"),               to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 30 dias",from: format(subDays(new Date(), 29), "yyyy-MM-dd"),               to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 60 dias",from: format(subDays(new Date(), 59), "yyyy-MM-dd"),               to: format(new Date(), "yyyy-MM-dd") },
    { label: "Últimos 90 dias",from: format(subDays(new Date(), 89), "yyyy-MM-dd"),               to: format(new Date(), "yyyy-MM-dd") },
    { label: "Mês atual",      from: format(startOfMonth(new Date()), "yyyy-MM-dd"),           to: format(endOfMonth(new Date()), "yyyy-MM-dd") },
    { label: "Mês anterior",   from: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), to: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") },
  ];

  const activePreset = presets.find(p => p.from === dateRange.from && p.to === dateRange.to);
  const label = activePreset ? activePreset.label : "Personalizado";

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm"
            className="h-9 gap-2 bg-slate-800/80 border border-slate-700 text-slate-200 hover:bg-slate-700 text-[11px] font-bold px-3 min-w-[160px] justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-white" />
              {label}
            </div>
        <span className="text-slate-500">▾</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-[#1E293B] border-slate-700 text-slate-200 w-52 shadow-2xl p-1" align="start">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-500 px-2 py-1.5">Períodos sugeridos</DropdownMenuLabel>
          {presets.map(p => (
            <DropdownMenuItem key={p.label}
              className={cn("text-sm font-medium cursor-pointer rounded-lg px-3 py-2 focus:bg-slate-700",
                activePreset?.label === p.label && "bg-[#7C3AED]/20 text-[#7C3AED] font-bold")}
              onClick={() => onChange({ from: p.from, to: p.to })}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inputs de data inline */}
      <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-lg px-3 h-9">
        <input type="date" value={dateRange.from}
          onChange={e => onChange({ ...dateRange, from: e.target.value })}
          className="date-input-white bg-transparent text-[11px] font-bold text-slate-300 focus:outline-none w-[112px]" />
        <span className="text-slate-600 text-xs">→</span>
        <input type="date" value={dateRange.to}
          onChange={e => onChange({ ...dateRange, to: e.target.value })}
          className="date-input-white bg-transparent text-[11px] font-bold text-slate-300 focus:outline-none w-[112px]" />
      </div>
    </div>
  );
}

function AtendimentoSection({ clientId, dateRange, hasN8n }: { clientId?: string; dateRange: { from: string; to: string }; hasN8n: boolean }) {
  const { totals, trend, byCampaign, bySource, byAgent, isLoading, hasData } = useClientConversationKpis(clientId, dateRange);

  // Dados comparativos: manual (QR Code + CSV) vs automação (n8n)
  // + tempo médio de vida dos leads (created_at → updated_at quando fechado)
  const [canalData, setCanalData] = useState<{
    manual:  { leads: number; fechados: number; valor: number; conversao: number };
    auto:    { leads: number; fechados: number; valor: number; conversao: number };
    tempoMedioVidaDias: number | null;
    totalContatos: number;
    conversas: number;
    porStatus: { novo: number; contato: number; proposta: number; negociacao: number; fechado: number; perdido: number };
  } | undefined>(undefined);

  useEffect(() => {
    if (!clientId) return;
    supabase.from("crm_leads")
      .select("status, proposal_value, origin, updated_at, created_at")
      .gte("created_at", dateRange.from)
      .lte("created_at", dateRange.to + "T23:59:59")
      .then(({ data }) => {
        if (!data) return;

        const isAuto = (origin: string | null) => origin != null && /n8n|automa/i.test(origin);
        const manual = data.filter(l => !isAuto(l.origin));
        const auto   = data.filter(l => isAuto(l.origin));

        const calcGrupo = (grupo: typeof data) => {
          const total = grupo.length;
          const fechados = grupo.filter(l => l.status === "fechado");
          const valor = fechados.reduce((acc, l) => acc + (l.proposal_value ?? 0), 0);
          return { leads: total, fechados: fechados.length, valor, conversao: total > 0 ? (fechados.length / total) * 100 : 0 };
        };

        const concluidos = data.filter(l => (l.status === "fechado" || l.status === "perdido") && l.updated_at && l.created_at);
        const tempoMedioVidaDias = concluidos.length > 0
          ? concluidos.reduce((acc, l) => {
              const dias = (new Date(l.updated_at!).getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
              return acc + dias;
            }, 0) / concluidos.length
          : null;

        const count = (s: string) => data.filter(l => l.status === s).length;

        setCanalData({
          manual: calcGrupo(manual),
          auto: calcGrupo(auto),
          tempoMedioVidaDias,
          totalContatos: data.length,
          // Conversas = leads que saíram de "novo" (status != 'novo'), 1 por lead
          conversas: data.filter(l => l.status !== "novo").length,
          porStatus: {
            novo: count("novo"),
            contato: count("contato"),
            proposta: count("proposta"),
            negociacao: count("negociacao"),
            fechado: count("fechado"),
            perdido: count("perdido"),
          },
        });
      });
  }, [clientId, dateRange.from, dateRange.to]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <MessageCircle className="h-5 w-5 text-emerald-400" />
        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Atendimento e Conversas</h2>
      </div>
      <ConversationKpiDashboard
        totals={totals} trend={trend} byCampaign={byCampaign} bySource={bySource} byAgent={byAgent}
        isLoading={isLoading} hasData={hasData} hasN8n={hasN8n} canalData={canalData} theme="dark"
        dateRange={dateRange}
      />
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




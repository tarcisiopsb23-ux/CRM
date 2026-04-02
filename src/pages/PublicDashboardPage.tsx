import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Activity, ArrowDown, ArrowUp, BarChart3, Briefcase, Calendar,
  CheckCircle2, DollarSign, Info, ListFilter, Lock, LogOut,
  PieChart, Target, TrendingUp, User, Users, Zap,
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
import { HorizontalScroll } from "@/components/ui/horizontal-scroll";
import { ModernFunnel } from "@/components/ui/modern-funnel";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  format, subDays, startOfMonth, endOfMonth, parseISO,
  isBefore, subMonths, subYears,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { useClientReports } from "@/hooks/useHubPerformance";
import { useClientConversationKpis } from "@/hooks/useClientConversationKpis";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import { MessageCircle } from "lucide-react";

const isLowerBetter = (name: string) => /cac|cpa|cpl|cpc|cpm|custo|inadimpl|churn|cancelamento|devolução|reclamação|tempo.*espera|prazo.*entrega/i.test(name);
const KPI_COLORS = ["#10b981","#2D8CC7","#f59e0b","#a855f7","#f43f5e","#06b6d4","#e879f9","#34d399"];

export function PublicDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<any>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [contractStartDate, setContractStartDate] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"performance" | "atendimento">("performance");

  // Dashboard flags from client metadata
  const dashPerformance: boolean = clientData?.metadata?.dashboard_performance ?? true;
  const dashAtendimento: boolean = clientData?.metadata?.dashboard_atendimento ?? false;

  // Dynamic title
  const dashboardTitle =
    dashPerformance && dashAtendimento ? "Dashboard Completo" :
    dashAtendimento ? "Dashboard de Atendimento" :
    "Dashboard de Performance";

  // Ensure activeTab is valid when flags change
  const resolvedTab: "performance" | "atendimento" =
    dashPerformance && !dashAtendimento ? "performance" :
    !dashPerformance && dashAtendimento ? "atendimento" :
    activeTab;

  useEffect(() => {
    const authSession = localStorage.getItem(`client_auth_${slug}`);
    if (!authSession) { navigate(`/public/dashboard/${slug}/login`); return; }
    const parsedData = JSON.parse(authSession);
    setClientData(parsedData);
    const fetchFreshData = async () => {
      // Re-fetch via RPC (bypasses RLS) to get latest metadata flags
      if (parsedData.dashboard_slug || slug) {
        const { data: clients } = await supabase
          .rpc('get_client_by_slug', { p_slug: parsedData.dashboard_slug ?? slug });
        if (clients && clients.length > 0) {
          const fresh = clients[0];
          const merged = {
            ...parsedData,
            favicon_url: fresh.favicon_url ?? parsedData.favicon_url,
            metadata: {
              ...(parsedData.metadata ?? {}),
              dashboard_performance: fresh.dashboard_performance ?? true,
              dashboard_atendimento: fresh.dashboard_atendimento ?? false,
            },
          };
          setClientData(merged);
          localStorage.setItem(`client_auth_${slug}`, JSON.stringify(merged));
        }
      }
      if (parsedData.id) {
        // Busca contratos mensais dos serviços elegíveis para alimentar o dashboard
        const ELIGIBLE_SERVICES = ["assessoria", "consultoria", "automação ia", "automacao ia", "parceria/collab", "parceria collab", "parceria"];
        const { data: contracts } = await supabase
          .from("contracts")
          .select("start_date, service_contracted, contract_date")
          .eq("client_id", parsedData.id)
          .order("start_date", { ascending: true });

        // Filtra apenas contratos elegíveis (serviços que alimentam o dashboard)
        const eligibleContracts = (contracts ?? []).filter((c: any) => {
          const svc = (c.service_contracted ?? "").toLowerCase().trim();
          return ELIGIBLE_SERVICES.some(e => svc.includes(e));
        });

        if (eligibleContracts.length > 0) {
          const firstContract = eligibleContracts[0];
          const contractDate = parseISO(firstContract.contract_date ?? firstContract.start_date);
          const dayOfMonth = contractDate.getDate();
          // Regra: dia > 10 → próximo mês como início; dia ≤ 10 → mês atual
          const effectiveStart = dayOfMonth > 10
            ? startOfMonth(new Date(contractDate.getFullYear(), contractDate.getMonth() + 1, 1))
            : startOfMonth(contractDate);
          setContractStartDate(effectiveStart);
        }
      }
      setLoading(false);
    };
    fetchFreshData();
  }, [slug, navigate]);

  const { data: kpisRaw } = useQuery({
    queryKey: ["public_client_kpis", clientData?.id],
    queryFn: async () => {
      if (!clientData?.id) return [];
      console.log('[Dashboard] Buscando KPIs para client_id:', clientData.id);
      // Tenta via RPC primeiro (SECURITY DEFINER, bypassa RLS)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_client_kpis_public', { p_client_id: clientData.id });
      console.log('[Dashboard] RPC KPIs result:', { rpcData, rpcError });
      if (!rpcError && rpcData && rpcData.length > 0) return rpcData;
      // Fallback: query direta
      const { data, error } = await supabase
        .from("client_kpis")
        .select("*")
        .eq("client_id", clientData.id)
        .order("name", { ascending: true });
      console.log('[Dashboard] Direct KPIs result:', { data, error });
      if (error) return [];
      return data || [];
    },
    enabled: !!clientData?.id,
  });
  const kpis = (kpisRaw ?? []) as any[];

  const { data: kpiHistoryRaw } = useQuery({
    queryKey: ["public_client_kpi_history", clientData?.id],
    queryFn: async () => {
      if (!clientData?.id) return [];
      console.log('[Dashboard] Buscando KPI history para client_id:', clientData.id);
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_client_kpi_history_public', { p_client_id: clientData.id });
      console.log('[Dashboard] RPC KPI history result:', { rpcData, rpcError });
      if (!rpcError && rpcData && rpcData.length > 0) return rpcData;
      const { data, error } = await supabase
        .from("client_kpi_history")
        .select("*")
        .eq("client_id", clientData.id)
        .order("month_year", { ascending: false });
      console.log('[Dashboard] Direct KPI history result:', { data, error });
      if (error) return [];
      return data || [];
    },
    enabled: !!clientData?.id,
  });
  const kpiHistory = (kpiHistoryRaw ?? []) as any[];
  const { campaignDataQuery, dailyMetricsQuery } = useClientReports(clientData?.organization_id, clientData?.id, dateRange);
  const realCampaigns = (campaignDataQuery.data ?? []) as any[];
  const realDailyMetrics = (dailyMetricsQuery.data ?? []) as any[];

  // Debug log quando dados chegam
  console.log('[Dashboard] State:', {
    clientId: clientData?.id,
    orgId: clientData?.organization_id,
    kpisCount: kpis.length,
    kpiHistoryCount: kpiHistory.length,
    campaignsCount: realCampaigns.length,
    dailyMetricsCount: realDailyMetrics.length,
  });

  const handleLogoff = () => {
    localStorage.removeItem(`client_auth_${slug}`);
    navigate(`/public/dashboard/${slug}/login`);
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return;
    try {
      const { data: client } = await supabase.from("clients").select("id, metadata").eq("dashboard_slug", slug).single();
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

  const totals = useMemo(() => realDailyMetrics.reduce((acc, curr) => ({
    spend: acc.spend + (curr.total_spend || 0),
    leads: acc.leads + (curr.total_leads || 0),
    sales: acc.sales + (curr.total_sales || 0),
    revenue: acc.revenue + (curr.total_revenue || curr.revenue || 0),
    impressions: acc.impressions + (curr.total_impressions || curr.impressions || 0),
    clicks: acc.clicks + (curr.total_clicks || curr.clicks || 0),
  }), { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 }), [realDailyMetrics]);

  // KPI cards — mês atual vs anterior com regras de comparação:
  // 1. Se houver dado no mês atual E no mês anterior → comparação normal
  // 2. Se for o primeiro mês pós-contrato (sem dado no mês anterior pós-contrato) → compara com último mês do histórico pré-contrato
  // 3. Se não houver nenhum resultado pós-contrato → growth = null (Sem dados)
  const kpiCards = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;

    return kpis.map((kpi, idx) => {
      const history = kpiHistory
        .filter(h => h.kpi_id === kpi.id)
        .sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));

      // Separa histórico pós-contrato e pré-contrato
      const postHistory = contractStart
        ? history.filter(h => !isBefore(startOfMonth(parseISO(String(h.month_year))), contractStart))
        : history;
      const preHistory = contractStart
        ? history.filter(h => isBefore(startOfMonth(parseISO(String(h.month_year))), contractStart))
        : [];

      // Se não há nenhum dado pós-contrato → sem dados
      if (postHistory.length === 0) {
        return { ...kpi, current: null, prev: null, growth: null, color: KPI_COLORS[idx % KPI_COLORS.length] };
      }

      // Valor atual = mais recente pós-contrato
      const currentEntry = postHistory[0];
      const current = currentEntry?.value ?? null;

      // Valor anterior: tenta o segundo mais recente pós-contrato
      // Se for o primeiro mês pós-contrato, usa o último mês do histórico pré-contrato
      let prevEntry = postHistory[1] ?? null;
      if (!prevEntry && preHistory.length > 0) {
        prevEntry = preHistory[0]; // último mês pré-contrato
      }

      const prev = prevEntry?.value ?? null;
      const growth = current !== null && prev !== null && prev !== 0
        ? ((current - prev) / prev) * 100
        : null;
      return { ...kpi, current, prev, growth, color: KPI_COLORS[idx % KPI_COLORS.length] };
    });
  }, [kpis, kpiHistory, contractStartDate]);

  // Sparkline (6 meses) por KPI
  const kpiSparkline = useMemo(() => {
    const monthKeys = Array.from({ length: 6 }).map((_, i) => format(subMonths(new Date(), i), "yyyy-MM")).reverse();
    const byKpi = new Map<string, { month: string; value: number }[]>();
    for (const kpi of kpis) {
      byKpi.set(kpi.id, monthKeys.map(mk => ({
        month: mk,
        value: kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value ?? 0,
      })));
    }
    return byKpi;
  }, [kpis, kpiHistory]);

  // Evolução longo prazo (12 meses anteriores ao atual)
  const longTermData = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    return Array.from({ length: 12 }).map((_, i) => {
      const month = startOfMonth(subMonths(new Date(), 12 - i));
      const monthStr = format(month, "yyyy-MM");
      const point: any = {
        name: format(month, "MMM/yy", { locale: ptBR }),
        isVigencia: contractStart ? !isBefore(month, contractStart) : false,
      };
      kpis.forEach(kpi => {
        const h = kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).substring(0, 7) === monthStr);
        point[kpi.name] = h ? h.value : null;
      });
      return point;
    });
  }, [kpis, kpiHistory, contractStartDate]);

  // Impacto da parceria
  // Pré: últimos 12 meses do histórico anterior ao contrato
  // Pós: todos os meses pós-contrato (se 1 mês, mostra o valor real sem média)
  const partnershipImpact = useMemo(() => {
    if (kpiHistory.length === 0 || !contractStartDate) return [];

    const splitDate = startOfMonth(contractStartDate);

    return kpis.map(kpi => {
      const allPre = kpiHistory
        .filter(h => {
          const d = startOfMonth(parseISO(String(h.month_year).substring(0, 10)));
          return h.kpi_id === kpi.id && isBefore(d, splitDate);
        })
        .sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
      const post = kpiHistory
        .filter(h => {
          const d = startOfMonth(parseISO(String(h.month_year).substring(0, 10)));
          return h.kpi_id === kpi.id && !isBefore(d, splitDate);
        });

      if (post.length === 0) return null;

      // Pré: últimos 12 meses do histórico anterior
      const pre = allPre.slice(0, 12);
      if (pre.length === 0) return null;

      const preAvg = pre.reduce((a, h) => a + Number(h.value), 0) / pre.length;
      // Pós: média se múltiplos meses, valor real se 1 mês
      const postAvg = post.reduce((a, h) => a + Number(h.value), 0) / post.length;

      return {
        name: kpi.name,
        unit: kpi.unit,
        pre: preAvg,
        post: postAvg,
        postMonths: post.length,
        growth: preAvg !== 0 ? ((postAvg - preAvg) / preAvg) * 100 : null,
      };
    }).filter(Boolean);
  }, [kpis, kpiHistory, contractStartDate]);

  // Tabela comparativa de performance — média calculada apenas sobre dados pós-contrato
  const perfRows = useMemo(() => {
    const contractStart = contractStartDate ? startOfMonth(contractStartDate) : null;
    const fmt = (v: number, unit: string) =>
      unit === "currency" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
      : unit === "percentage" ? `${v.toFixed(2)}%` : String(v);
    return kpis.map(kpi => {
      const allHistory = kpiHistory.filter(h => h.kpi_id === kpi.id);
      // Filtra apenas pós-contrato para calcular média e valor atual
      const postHistory = contractStart
        ? allHistory.filter(h => !isBefore(startOfMonth(parseISO(String(h.month_year))), contractStart))
        : allHistory;
      postHistory.sort((a, b) => String(b.month_year).localeCompare(String(a.month_year)));
      const current = postHistory[0]?.value ?? null;
      const avg = postHistory.length > 0 ? postHistory.reduce((a, h) => a + h.value, 0) / postHistory.length : null;
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
  }, [kpis, kpiHistory, contractStartDate]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#111827]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#2D8CC7] border-t-transparent" />
        <p className="text-slate-400 font-medium tracking-wide">Iniciando Dashboard de Performance...</p>
      </div>
    </div>
  );

  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "0.0";
  const cpa = totals.sales > 0 ? (totals.spend / totals.sales).toFixed(0) : "0";
  const conversionRate = totals.leads > 0 ? ((totals.sales / totals.leads) * 100).toFixed(1) : "0.0";

  // KPI padrão: faturamento bruto tem prioridade, senão o primeiro da lista
  const defaultKpi = kpis.find(k => /faturamento/i.test(k.name)) ?? kpis[0];
  // KPIs ordenados: faturamento primeiro, depois os demais
  const sortedKpis = [
    ...kpis.filter(k => /faturamento/i.test(k.name)),
    ...kpis.filter(k => !/faturamento/i.test(k.name)),
  ];
  const selectedKpi = sortedKpis.find(k => k.id === (activeKpiId ?? defaultKpi?.id)) ?? defaultKpi;
  const selectedColor = selectedKpi ? KPI_COLORS[kpis.indexOf(selectedKpi) % KPI_COLORS.length] : "#2D8CC7";

  const fmtVal = (v: number, unit: string) =>
    unit === "currency" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
    : unit === "percentage" ? `${v}%` : String(v);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8 selection:bg-[#2D8CC7]/30">
        <div className="max-w-[1600px] mx-auto space-y-8">

          {/* ── HEADER ── */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <img src={clientData?.favicon_url ?? "/favicon.png"} alt="Logo" className="h-10 w-10 rounded-xl shadow-lg object-contain" />
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">{dashboardTitle}</h1>
              </div>
              <p className="text-slate-400 font-medium pl-[52px]">
                Análise estratégica • <span className="text-[#2D8CC7]">{clientData?.company || clientData?.name}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Filtro de período */}
              <PeriodDropdown dateRange={dateRange} onChange={setDateRange} />

              {/* Menu perfil */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-slate-200 gap-2 h-10">
                    <div className="h-6 w-6 rounded-full bg-[#2D8CC7] flex items-center justify-center text-[10px] font-black text-white">
                      {clientData?.name?.charAt(0)}
                    </div>
                    <span className="text-sm font-bold truncate max-w-[100px]">{clientData?.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1E293B] border-slate-800 text-slate-200 w-56 shadow-2xl" align="end">
                  <DropdownMenuLabel className="text-xs uppercase font-black tracking-widest text-slate-500">Minha Conta</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3">
                    <User className="h-4 w-4 text-[#2D8CC7]" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">{clientData?.name}</span>
                      <span className="text-[10px] text-slate-500 truncate">{clientData?.company}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:bg-slate-800 cursor-pointer py-3" onClick={() => setShowPasswordDialog(true)}>
                    <Lock className="h-4 w-4 text-orange-400" />
                    <span className="text-sm font-bold">Alterar Senha</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem className="gap-2 focus:text-red-400 text-red-400 cursor-pointer py-3" onClick={handleLogoff}>
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
                <Input id="np" type="password" placeholder="••••••••" className="bg-slate-900 border-slate-700 text-white h-12"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowPasswordDialog(false)}>Cancelar</Button>
                <Button onClick={handleChangePassword} className="bg-[#2D8CC7] hover:bg-[#2D8CC7]/90">Salvar Nova Senha</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── TABS (só aparece quando ambos ativos) ── */}
          {dashPerformance && dashAtendimento && (
            <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700 w-fit">
              <button
                onClick={() => setActiveTab("performance")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                  resolvedTab === "performance"
                    ? "bg-[#2D8CC7] text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <BarChart3 className="h-4 w-4" /> Performance
              </button>
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
            </div>
          )}

          {/* ── CONTEÚDO: PERFORMANCE ── */}
          {resolvedTab === "performance" && (
          <div className="space-y-8">

          {/* ── 1. MÉTRICAS DE ANÚNCIOS ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="Investimento" value={`R$ ${totals.spend.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5 text-[#2D8CC7]" />} info="Valor total investido em mídia paga (Meta Ads, Google Ads, etc.) no período selecionado. Representa o custo direto das campanhas ativas." />
            <MetricCard label="Leads" value={totals.leads} icon={<Users className="h-5 w-5 text-blue-400" />} info="Número total de leads gerados pelas campanhas no período. Um lead é um potencial cliente que demonstrou interesse e deixou seus dados de contato." />
            <MetricCard label="Vendas" value={totals.sales} icon={<Target className="h-5 w-5 text-emerald-400" />} info="Total de vendas fechadas e atribuídas às campanhas de mídia paga no período. Indica o resultado comercial direto das ações de marketing." />
            <MetricCard label="Conversão" value={`${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} info="Percentual de leads que se tornaram clientes (vendas ÷ leads × 100). Mede a eficiência do processo comercial em transformar interesse em receita." />
            <MetricCard label="Faturamento Estimado" value={`R$ ${totals.revenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-white" />} info="Receita total estimada gerada pelas vendas atribuídas às campanhas no período. Calculado com base no ticket médio das vendas registradas." highlight />
            <MetricCard label="ROAS" value={`${roas}x`} icon={<PieChart className="h-5 w-5 text-orange-400" />} info="Return on Ad Spend — retorno sobre o investimento em anúncios. Um ROAS de 4x significa que cada R$ 1 investido gerou R$ 4 em faturamento estimado." />
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
                  <InfoTooltip text="Acompanhe dia a dia a evolução do investimento em anúncios, do faturamento estimado e do volume de leads gerados. Permite identificar picos de performance, sazonalidades e o impacto de ajustes nas campanhas ao longo do período." />
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
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }}
                        tickFormatter={s => format(new Date(String(s)), "dd/MM")} />
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
                <InfoTooltip text="Visualize como os usuários avançam em cada etapa da jornada de compra: de impressões até vendas fechadas. As taxas entre etapas revelam onde há maior perda e onde focar otimizações." />
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center pt-6">
                <ModernFunnel textVariant="white" steps={[
                  { label: "Impressões", value: totals.impressions.toLocaleString("pt-BR"), color: "bg-slate-700", width: "w-full", percentage: ((totals.clicks / (totals.impressions || 1)) * 100).toFixed(1) + "%", rateLabel: "CTR" },
                  { label: "Cliques", value: totals.clicks.toLocaleString("pt-BR"), color: "bg-[#2D8CC7]/40", width: "w-[85%]", percentage: ((totals.leads / (totals.clicks || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. CONV." },
                  { label: "Leads", value: totals.leads, color: "bg-blue-500/40", width: "w-[70%]", percentage: ((totals.sales / (totals.leads || 1)) * 100).toFixed(1) + "%", rateLabel: "TX. FECH." },
                  { label: "Vendas", value: totals.sales, color: "bg-emerald-500/40", width: "w-[55%]" },
                ]} />
                <div className="mt-8 pt-6 border-t border-slate-700 text-center w-full">
                  <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Resultado Final</p>
                  <p className="text-3xl font-black text-emerald-400 mt-2">R$ {totals.revenue.toLocaleString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── 3. TOP CAMPANHAS + OBSERVAÇÕES ESTRATÉGICAS ── */}
          <div className="grid grid-cols-1 gap-8">
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white">Top Campanhas do Período</CardTitle>
                <InfoTooltip text="Ranking das campanhas com maior volume de resultado no período. Compare eficiência entre campanhas e plataformas — identifique quais geram melhor ROAS e menor custo por aquisição para direcionar o investimento." />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                        <th className="pb-4">Plataforma</th>
                        <th className="pb-4">Campanha</th>
                        <th className="pb-4">Invest.</th>
                        <th className="pb-4 text-center">Leads</th>
                        <th className="pb-4 text-center">Vendas</th>
                        <th className="pb-4 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {realCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 text-sm italic">
                            Sem dados de campanhas para este período.
                          </td>
                        </tr>
                      ) : realCampaigns.map((c: any) => {
                        const campRevenue = c.revenue ?? c.total_revenue ?? 0;
                        const roasCamp = c.spend > 0 ? (campRevenue / c.spend).toFixed(1) : "0.0";
                        return (
                          <tr key={c.id ?? c.campaign_name ?? c.name} className="text-sm hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 text-slate-400 font-bold">{c.platform}</td>
                            <td className="py-4 font-bold text-slate-200">{c.campaign_name ?? c.name ?? "—"}</td>
                            <td className="py-4 text-slate-400">R$ {(c.spend || 0).toLocaleString("pt-BR")}</td>
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

            {/* Observações estratégicas */}
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white">Observações Estratégicas</CardTitle>
                <InfoTooltip text="Análise automática dos principais números do período: eficiência de custo por aquisição (CPA), retorno sobre investimento em anúncios (ROAS) e volume de leads gerados. Use como ponto de partida para decisões estratégicas." />
              </CardHeader>
              <CardContent className="space-y-3">
                {/* CPA: lower is better — só mostra se > 0 */}
                {Number(cpa) > 0 && (
                  <InsightItem icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    text={<>Eficiência: CPA calculado em <span className="text-emerald-400 font-bold">R$ {cpa}</span> no período.</>} />
                )}
                {/* ROAS: só mostra se > 0 */}
                {Number(roas) > 0 && (
                  <InsightItem icon={<TrendingUp className="h-4 w-4 text-[#2D8CC7]" />}
                    text={<>ROAS de <span className="text-[#2D8CC7] font-bold">{roas}x</span> — cada R$ 1 investido gerou R$ {roas} em faturamento estimado.</>} />
                )}
                {/* Leads: só mostra se > 0 */}
                {totals.leads > 0 && (
                  <InsightItem icon={<Users className="h-4 w-4 text-blue-400" />}
                    text={<><span className="text-blue-400 font-bold">{totals.leads}</span> leads gerados com taxa de conversão de <span className="text-blue-400 font-bold">{conversionRate}%</span>.</>} />
                )}
                {/* KPI insights: só mostra se growth relevante */}
                {kpiCards.filter(k => k.growth !== null && (isLowerBetter(k.name) ? k.growth <= -5 : k.growth >= 5)).slice(0, 2).map(k => (
                  <InsightItem key={k.id} icon={<Zap className="h-4 w-4 text-yellow-400" />}
                    text={<><span className="text-yellow-400 font-bold">{k.name}</span>: variação de {k.growth! >= 0 ? "+" : ""}{k.growth!.toFixed(1)}% vs mês anterior.</>} />
                ))}
                {/* Fallback se não há nenhuma observação */}
                {Number(cpa) === 0 && Number(roas) === 0 && totals.leads === 0 && kpiCards.filter(k => k.growth !== null && (isLowerBetter(k.name) ? k.growth <= -5 : k.growth >= 5)).length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhuma observação disponível para o período selecionado.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── 4. INDICADORES DE NEGÓCIO (KPIs manuais) — linha toda ── */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-[#2D8CC7]" />
                Indicadores de Negócio
              </CardTitle>
              <InfoTooltip text="Indicadores-chave de negócio registrados manualmente pela equipe. Cada card exibe o valor do mês atual e o badge colorido mostra a variação percentual em relação ao mês anterior (MoM — Month over Month)." />
            </CardHeader>
            <CardContent>
              {kpis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                  <BarChart3 className="h-10 w-10 opacity-20" />
                  <p className="text-sm text-center">Nenhum indicador cadastrado ainda.<br />Os KPIs aparecerão aqui após serem configurados.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {kpiCards.map(kpi => (
                    <Card key={kpi.id} className="bg-slate-900/30 border-slate-800 p-5">
                      <div className="flex items-start justify-between">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + "18" }}>
                          <BarChart3 className="h-4 w-4" style={{ color: kpi.color }} />
                        </div>
                        <div className="flex items-start gap-2">
                          {kpi.growth !== null && (
                            <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                              (isLowerBetter(kpi.name) ? kpi.growth <= 0 : kpi.growth >= 0)
                                ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            )}>
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
                        <p className="text-[10px] text-slate-500 mt-2">
                          Anterior: <span className="text-slate-400 font-bold">{fmtVal(kpi.prev, kpi.unit)}</span>
                        </p>
                      ) : (
                        <p className="text-[9px] text-slate-600 mt-2">Mês atual vs anterior</p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 4. EVOLUÇÃO DE LONGO PRAZO ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#2D8CC7]" />
                  Evolução de Longo Prazo
                  <InfoTooltip text="Gráfico de barras com a evolução mensal de cada KPI nos últimos 12 meses. As barras em cinza representam o período anterior ao contrato e as coloridas o período de parceria ativa. Selecione o indicador desejado pelos botões acima do gráfico." />
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
                    <p className="text-sm text-center">Nenhum indicador cadastrado ainda.<br />O gráfico de evolução aparecerá aqui após a configuração dos KPIs.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-6">
                      {sortedKpis.map((kpi, idx) => {
                        const color = KPI_COLORS[kpis.indexOf(kpi) % KPI_COLORS.length];
                        const isActive = (activeKpiId ?? defaultKpi?.id) === kpi.id;
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
                    {/* Legenda pré-contrato vs vigência */}
                    {contractStartDate && (
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-3 rounded-sm bg-[#334155]" />
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Histórico Anterior</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: selectedColor }} />
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Vigência do Contrato</span>
                        </div>
                      </div>
                    )}
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
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            const color = payload?.isVigencia ? selectedColor : "#334155";
                            const r = 6;
                            return <path d={`M${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height} L${x},${y+height} Z`} fill={color} opacity={0.9} />;
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── 5. IMPACTO DA PARCERIA ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Zap className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Impacto da Parceria</h2>
              <InfoTooltip text="Compara a média dos indicadores de negócio antes e depois do início do contrato com a agência. Permite mensurar objetivamente o impacto das estratégias aplicadas em cada KPI ao longo da parceria." />
            </div>
            {partnershipImpact.length === 0 ? (
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
                <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                  <Zap className="h-10 w-10 opacity-20" />
                  <p className="text-sm text-center">Os cards de impacto aparecerão quando houver dados<br />registrados antes e depois do início do contrato.</p>
                </CardContent>
              </Card>
            ) : (
              <HorizontalScroll>
                {(partnershipImpact as any[]).map((item: any) => (
                  <Card key={item.name} className="bg-[#1E293B] border-slate-800 shadow-2xl p-7 relative overflow-hidden flex-none w-auto min-w-[411px]">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex-1 space-y-4">
                        <p className="text-[11px] uppercase font-black tracking-widest text-slate-400">{item.name}</p>
                        <div className="flex items-end gap-6">
                          <div className="space-y-1">
                            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Média Antes</p>
                            <p className="text-base font-black text-slate-400 line-through decoration-slate-600/50">
                              {fmtVal(item.pre, item.unit)}
                            </p>
                          </div>
                          <ArrowUp className="h-4 w-4 text-slate-600 mb-1" />
                          <div className="space-y-1">
                            <p className="text-[9px] text-[#2D8CC7] uppercase font-bold tracking-wider">Média Atual</p>
                            <p className="text-2xl font-black text-white">{fmtVal(item.post, item.unit)}</p>
                          </div>
                        </div>
                      </div>
                      <div className={cn("flex flex-col items-center justify-center h-20 w-20 rounded-2xl border shadow-lg shrink-0",
                        (isLowerBetter(item.name) ? (item.growth ?? 0) <= 0 : (item.growth ?? 0) >= 0)
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                      )}>
                        <span className="text-sm font-black">{(item.growth ?? 0) >= 0 ? "+" : ""}{Number(item.growth ?? 0).toFixed(0)}%</span>
                        <span className="text-[9px] font-bold uppercase opacity-70 mt-0.5">Cresc.</span>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 h-full w-32 bg-gradient-to-l from-[#2D8CC7]/5 to-transparent pointer-events-none" />
                  </Card>
                ))}
              </HorizontalScroll>
            )}
          </div>

          {/* ── 6. TABELA COMPARATIVA DE PERFORMANCE ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <ListFilter className="h-5 w-5 text-[#2D8CC7]" />
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Comparativo de Performance</h2>
              <InfoTooltip text="Tabela que cruza a média histórica, a meta definida e o resultado atual de cada KPI. A coluna 'vs Média' mostra se o resultado está acima ou abaixo do histórico, enquanto '% Meta' indica o quanto da meta foi atingido. O status resume a situação de cada indicador." />
            </div>
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
              <CardContent className="p-0">
                {perfRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                    <ListFilter className="h-10 w-10 opacity-20" />
                    <p className="text-sm text-center">Nenhum indicador cadastrado.<br />A tabela comparativa aparecerá após o cadastro dos KPIs.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/40">
                          {["KPI", "Média Histórica", "Meta", "Resultado Atual", "vs Média", "% Meta", "Status"].map(h => (
                            <th key={h} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {perfRows.map(({ kpi, current, avg, target, vsAvg, pctMeta, status, fmt }) => {
                          const lower = isLowerBetter(kpi.name);
                          const vsPositive = vsAvg !== null && (lower ? vsAvg <= 0 : vsAvg >= 0);
                          const statusColor =
                            status === "Meta atingida" ? "text-emerald-400 bg-emerald-500/10" :
                            status === "Próximo da meta" ? "text-yellow-400 bg-yellow-500/10" :
                            status === "Acima da média" ? "text-blue-400 bg-blue-500/10" :
                            status === "Abaixo da média" ? "text-red-400 bg-red-500/10" :
                            status === "Sem dados" ? "text-slate-600 bg-slate-800/50" :
                            "text-slate-400 bg-slate-700/30";
                          return (
                            <tr key={kpi.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-5 py-4">
                                <p className="text-sm font-bold text-white">{kpi.name}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">{kpi.category}</p>
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-400 font-semibold whitespace-nowrap">
                                {avg !== null ? fmt(avg, kpi.unit) : <span className="text-slate-600">—</span>}
                              </td>
                              <td className="px-5 py-4 text-sm text-slate-400 font-semibold whitespace-nowrap">
                                {target !== null ? fmt(target, kpi.unit) : <span className="text-slate-600 text-xs italic">Não definida</span>}
                              </td>
                              <td className="px-5 py-4 text-sm font-black text-white whitespace-nowrap">
                                {current !== null ? fmt(current, kpi.unit) : <span className="text-slate-600">—</span>}
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                {vsAvg !== null ? (
                                  <span className={cn("flex items-center gap-1 text-xs font-black", vsPositive ? "text-emerald-400" : "text-red-400")}>
                                    {vsAvg >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                    {Math.abs(vsAvg).toFixed(2)}%
                                  </span>
                                ) : <span className="text-slate-600 text-xs">—</span>}
                              </td>
                              <td className="px-5 py-4 whitespace-nowrap">
                                {pctMeta !== null ? (
                                  <div className="space-y-1">
                                    <span className="text-xs font-black text-slate-300">{pctMeta.toFixed(2)}%</span>
                                    <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                      <div className={cn("h-full rounded-full", pctMeta >= 100 ? "bg-emerald-400" : pctMeta >= 80 ? "bg-yellow-400" : "bg-red-400")}
                                        style={{ width: `${Math.min(pctMeta, 100)}%` }} />
                                    </div>
                                  </div>
                                ) : <span className="text-slate-600 text-xs">—</span>}
                              </td>
                              <td className="px-5 py-4">
                                <span className={cn("text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider whitespace-nowrap", statusColor)}>
                                  {status}
                                </span>
                              </td>
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

          {/* ── 7. CONSOLIDADO MENSAL (KPIs) ── */}
          {(() => {
            // 12 meses anteriores ao atual (exclui o mês corrente)
            const months = Array.from({ length: 12 }).map((_, i) => subMonths(new Date(), 12 - i));
            return (
              <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xl font-bold text-white">Consolidado Mensal</CardTitle>
                  <InfoTooltip text="Histórico completo dos últimos 12 meses para cada indicador de negócio cadastrado. Permite visualizar tendências de longo prazo, sazonalidades e a evolução mês a mês de cada KPI." />
                </CardHeader>
                <CardContent className="p-0">
                  {kpis.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                      <ListFilter className="h-10 w-10 opacity-20" />
                      <p className="text-sm text-center">A tabela consolidada aparecerá aqui<br />após o cadastro e registro dos indicadores.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                            <th className="pb-4 pl-5 min-w-[160px]">Indicador</th>
                            {months.map(m => (
                              <th key={m.toISOString()} className="pb-4 text-center min-w-[90px]">
                                {format(m, "MMM/yy", { locale: ptBR })}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {kpis.map(kpi => (
                            <tr key={kpi.id} className="text-sm hover:bg-slate-800/20 transition-colors">
                              <td className="py-4 pl-5 font-bold text-slate-200">{kpi.name}</td>
                              {months.map(m => {
                                const mk = format(m, "yyyy-MM");
                                const val = kpiHistory.find(h => h.kpi_id === kpi.id && String(h.month_year).startsWith(mk))?.value;
                                return (
                                  <td key={mk} className="py-4 text-center text-slate-300 font-bold">
                                    {val !== undefined ? fmtVal(val, kpi.unit) : <span className="text-slate-700">—</span>}
                                  </td>
                                );
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

          </div>
          )}
          {/* ── CONTEÚDO: ATENDIMENTO ── */}
          {resolvedTab === "atendimento" && (
            <AtendimentoSection
              organizationId={clientData?.organization_id}
              clientId={clientData?.id}
              dateRange={dateRange}
            />
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
                activePreset?.label === p.label && "bg-[#2D8CC7]/20 text-[#2D8CC7] font-bold")}
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
        <span className="text-slate-600 text-xs">—</span>
        <input type="date" value={dateRange.to}
          onChange={e => onChange({ ...dateRange, to: e.target.value })}
          className="date-input-white bg-transparent text-[11px] font-bold text-slate-300 focus:outline-none w-[112px]" />
      </div>
    </div>
  );
}

function AtendimentoSection({ organizationId, clientId, dateRange }: { organizationId?: string; clientId?: string; dateRange: { from: string; to: string } }) {
  const { totals, trend, byCampaign, bySource, byAgent, isLoading, hasData } = useClientConversationKpis(organizationId, clientId, dateRange);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <MessageCircle className="h-5 w-5 text-emerald-400" />
        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Automação de Conversas</h2>
      </div>
      <ConversationKpiDashboard
        totals={totals} trend={trend} byCampaign={byCampaign} bySource={bySource} byAgent={byAgent}
        isLoading={isLoading} hasData={hasData} theme="dark"
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

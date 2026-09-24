import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SalesFunnel } from "@/components/ui/sales-funnel";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  DollarSign,
  Info,
  ListFilter,
  MessageCircle,
  PieChart,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HorizontalScroll } from "@/components/ui/horizontal-scroll";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import type { ConversationKpiTotals, ConversationTrendPoint } from "@/hooks/useClientConversationKpis";

type DemoDailyMetric = {
  date: string;
  total_spend: number;
  total_leads: number;
  total_sales: number;
  impressions: number;
  clicks: number;
  revenue: number;
};

type DemoKpiPoint = {
  month: string;
  faturamento_real: number;
  cac: number;
  roi: number;
  taxa_conversao: number;
  ticket_medio_fisico: number;
  ticket_medio_digital: number;
  isVigencia?: boolean;
};

type DemoImpactRow = {
  name: string;
  unit: "currency" | "percentage" | "number";
  pre: number;
  post: number;
  growth: number | null;
};

type DemoCampaign = {
  platform: "Meta Ads" | "Google Ads";
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
};

const buildDemoDailyMetrics = (): DemoDailyMetric[] => {
  const out: DemoDailyMetric[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const spend = 220 + Math.round((Math.sin(i / 3) + 1) * 80) + Math.round(Math.random() * 30);
    const clicks = Math.round(spend * 4.2);
    const impressions = Math.round(clicks * 24);
    const leads = Math.max(6, Math.round(clicks * 0.06));
    const sales = Math.max(1, Math.round(leads * 0.18));
    const revenue = sales * (1500 + Math.round(Math.random() * 900));
    out.push({
      date: format(d, "yyyy-MM-dd"),
      total_spend: spend,
      impressions,
      clicks,
      total_leads: leads,
      total_sales: sales,
      revenue,
    });
  }
  return out;
};

const buildDemoLongTerm = (): DemoKpiPoint[] => {
  const out: DemoKpiPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = subDays(startOfMonth(new Date()), i * 31);
    const base = 30000 + (11 - i) * 3500;
    const faturamento = base + Math.round(Math.random() * 4000);
    const cac = 280 - (11 - i) * 12 + Math.round(Math.random() * 15);
    const roi = 2 + (11 - i) * 0.35 + Math.random() * 0.25;
    const conv = 1.2 + (11 - i) * 0.15 + Math.random() * 0.15;
    const ticketFisico = 320 + (11 - i) * 18 + Math.round(Math.random() * 40);
    const ticketDigital = 180 + (11 - i) * 22 + Math.round(Math.random() * 30);
    out.push({
      month: format(monthDate, "MMM/yy", { locale: ptBR }),
      faturamento_real: faturamento,
      cac,
      roi: Math.round(roi * 100) / 100,
      taxa_conversao: Math.round(conv * 100) / 100,
      ticket_medio_fisico: ticketFisico,
      ticket_medio_digital: ticketDigital,
      isVigencia: i < 6, // primeiros 6 meses = histórico anterior, últimos 6 = parceria ativa
    });
  }
  return out;
};

const buildDemoCampaigns = (): DemoCampaign[] => {
  return [
    { platform: "Meta Ads",    name: "Conversão - Produto Principal", spend: 4200, impressions: 180000, clicks: 3600, leads: 210, sales: 36, revenue: 64800 },
    { platform: "Meta Ads",    name: "Remarketing - Carrinho",        spend: 1600, impressions:  72000, clicks: 1800, leads:  78, sales: 22, revenue: 38500 },
    { platform: "Google Ads",  name: "Search - Alta Intenção",        spend: 2900, impressions:  95000, clicks: 2900, leads: 120, sales: 28, revenue: 46200 },
    { platform: "Google Ads",  name: "Search - Institucional",        spend: 1100, impressions:  48000, clicks: 1200, leads:  62, sales: 10, revenue: 14500 },
    { platform: "Meta Ads",    name: "Topo - Conteúdo",               spend:  900, impressions: 210000, clicks: 1890, leads:  55, sales:  4, revenue:  5200 },
  ];
};

const buildDemoConversationKpis = () => {
  const totals: ConversationKpiTotals = {
    conversations: 1240,
    bot_finished: 820,
    human_transfer: 310,
    leads_identified: 620,
    conversions: 148,
    automation_rate: (820 / 1240) * 100,
    transfer_rate: (310 / 1240) * 100,
    lead_rate: (620 / 1240) * 100,
    conversion_rate: 7.2, // ← valor baixo para disparar alerta de teste
  };

  const trend: ConversationTrendPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(new Date(), 29 - i);
    const conversations = 30 + Math.round(Math.sin(i / 3) * 10 + Math.random() * 15);
    const leads = Math.round(conversations * 0.5);
    const conversions = Math.round(leads * 0.24);
    return { date: format(d, "yyyy-MM-dd"), conversations, leads_identified: leads, conversions };
  });

  const byCampaign = [
    { campaign: "Conversão - Produto Principal", conversations: 480, leads_identified: 240, conversions: 58, conversion_rate: 24.2 },
    { campaign: "Remarketing - Carrinho",        conversations: 310, leads_identified: 180, conversions: 44, conversion_rate: 24.4 },
    { campaign: "Search - Alta Intenção",        conversations: 290, leads_identified: 140, conversions: 32, conversion_rate: 22.9 },
    { campaign: "Topo - Conteúdo",               conversations: 160, leads_identified: 60,  conversions: 14, conversion_rate: 23.3 },
    { campaign: "Remarketing - Vídeo",           conversations: 145, leads_identified: 72,  conversions: 18, conversion_rate: 25.0 },
    { campaign: "Search - Marca",                conversations: 130, leads_identified: 65,  conversions: 20, conversion_rate: 30.8 },
    { campaign: "Display - Prospecção",          conversations: 112, leads_identified: 48,  conversions: 9,  conversion_rate: 18.8 },
    { campaign: "Meta - Lookalike 2%",           conversations: 98,  leads_identified: 42,  conversions: 11, conversion_rate: 26.2 },
    { campaign: "Google - Shopping",             conversations: 87,  leads_identified: 38,  conversions: 8,  conversion_rate: 21.1 },
    { campaign: "Meta - Interesse Amplo",        conversations: 74,  leads_identified: 30,  conversions: 6,  conversion_rate: 20.0 },
    { campaign: "YouTube - Awareness",           conversations: 62,  leads_identified: 22,  conversions: 4,  conversion_rate: 18.2 },
    { campaign: "Search - Concorrentes",         conversations: 55,  leads_identified: 28,  conversions: 7,  conversion_rate: 25.0 },
  ];

  const bySource = [
    { source: "whatsapp", value: 820, qualification_rate: 52.4, conversion_rate: 24.8 },
    { source: "instagram", value: 280, qualification_rate: 44.6, conversion_rate: 18.2 },
    { source: "facebook", value: 140, qualification_rate: 38.1, conversion_rate: 14.5 },
  ];

  const timings = {
    avg_first_response_min: 3.2,
    avg_resolution_min: 48,
    avg_transfer_min: 8.5,
  };

  const byAgent = [
    { agent_name: "Ana Lima",       conversations_started: 180, conversations_finished: 162, conversions: 42, conversion_rate: 23.3 },
    { agent_name: "Carlos Souza",   conversations_started: 145, conversations_finished: 130, conversions: 35, conversion_rate: 24.1 },
    { agent_name: "Fernanda Reis",  conversations_started: 120, conversations_finished: 108, conversions: 28, conversion_rate: 23.3 },
    { agent_name: "João Melo",      conversations_started: 98,  conversations_finished: 85,  conversions: 18, conversion_rate: 18.4 },
    { agent_name: "Patrícia Nunes", conversations_started: 92,  conversations_finished: 80,  conversions: 22, conversion_rate: 23.9 },
    { agent_name: "Ricardo Alves",  conversations_started: 85,  conversations_finished: 74,  conversions: 19, conversion_rate: 22.4 },
    { agent_name: "Camila Torres",  conversations_started: 78,  conversations_finished: 68,  conversions: 15, conversion_rate: 19.2 },
    { agent_name: "Bruno Carvalho", conversations_started: 70,  conversations_finished: 60,  conversions: 12, conversion_rate: 17.1 },
    { agent_name: "Larissa Pinto",  conversations_started: 65,  conversations_finished: 58,  conversions: 14, conversion_rate: 21.5 },
    { agent_name: "Marcos Vieira",  conversations_started: 58,  conversations_finished: 50,  conversions: 10, conversion_rate: 17.2 },
    { agent_name: "Juliana Costa",  conversations_started: 52,  conversations_finished: 45,  conversions: 11, conversion_rate: 21.2 },
    { agent_name: "Diego Martins",  conversations_started: 44,  conversations_finished: 38,  conversions: 8,  conversion_rate: 18.2 },
  ];

  return { totals, trend, byCampaign, bySource, byAgent, timings };
};

// Indicadores onde redução é positiva (lower is better)
const isLowerBetter = (name: string) =>
  /cac|cpa|cpl|cpc|cpm|custo/i.test(name);

export function PublicDemoDashboardPage() {
  const [dateRange, setDateRange] = useState({
    from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });
  const [demoActiveKpi, setDemoActiveKpi] = useState<keyof DemoKpiPoint>("faturamento_real");
  const [activeTab, setActiveTab] = useState<"performance" | "atendimento">("performance");

  const daily = useMemo(() => buildDemoDailyMetrics(), []);
  const longTerm = useMemo(() => buildDemoLongTerm(), []);
  const campaigns = useMemo(() => buildDemoCampaigns(), []);
  const demoConversation = useMemo(() => buildDemoConversationKpis(), []);
  const [demoCampaignFilter, setDemoCampaignFilter] = useState<"Todas" | "Meta Ads" | "Google Ads">("Todas");
  const filteredDemoCampaigns = useMemo(() =>
    demoCampaignFilter === "Todas" ? campaigns : campaigns.filter(c => c.platform === demoCampaignFilter),
    [campaigns, demoCampaignFilter]
  );
  const [selectedDemoCampaign, setSelectedDemoCampaign] = useState<any>(null);

  const totals = useMemo(() => {
    return daily.reduce(
      (acc, curr) => ({
        spend: acc.spend + curr.total_spend,
        leads: acc.leads + curr.total_leads,
        sales: acc.sales + curr.total_sales,
        revenue: acc.revenue + curr.revenue,
        impressions: acc.impressions + curr.impressions,
        clicks: acc.clicks + curr.clicks,
      }),
      { spend: 0, leads: 0, sales: 0, revenue: 0, impressions: 0, clicks: 0 }
    );
  }, [daily]);

  const roas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(1) : "0.0";
  const cpa = totals.sales > 0 ? (totals.spend / totals.sales).toFixed(0) : "0";
  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0.00";
  const cpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(2) : "0.00";
  const cpm = totals.impressions > 0 ? ((totals.spend / totals.impressions) * 1000).toFixed(2) : "0.00";
  const cpl = totals.leads > 0 ? (totals.spend / totals.leads).toFixed(2) : "0.00";
  const conversionRate = totals.leads > 0 ? ((totals.sales / totals.leads) * 100).toFixed(1) : "0.0";
  const ticketMedio = totals.sales > 0 ? (totals.revenue / totals.sales).toFixed(0) : "0";

  const monthNow = longTerm[longTerm.length - 1];
  const monthPrev = longTerm[longTerm.length - 2];

  // Definição centralizada dos KPIs mock — única fonte de verdade para cards e gráfico
  const demoKpiDefs = useMemo(() => [
    { key: "faturamento_real" as keyof DemoKpiPoint, label: "Faturamento Real", unit: "currency" as const, color: "#10b981" },
    { key: "cac" as keyof DemoKpiPoint, label: "CAC", unit: "currency" as const, color: "#f59e0b" },
    { key: "roi" as keyof DemoKpiPoint, label: "ROI", unit: "number" as const, color: "#2D8CC7" },
    { key: "taxa_conversao" as keyof DemoKpiPoint, label: "Taxa de Conversão", unit: "percentage" as const, color: "#a855f7" },
    { key: "ticket_medio_fisico" as keyof DemoKpiPoint, label: "Ticket Médio Físico", unit: "currency" as const, color: "#06b6d4" },
    { key: "ticket_medio_digital" as keyof DemoKpiPoint, label: "Ticket Médio Digital", unit: "currency" as const, color: "#f43f5e" },
  ], []);

  const demoKpiCards = useMemo(() => demoKpiDefs.map(def => {
    const current = monthNow ? Number(monthNow[def.key]) : null;
    const prev = monthPrev ? Number(monthPrev[def.key]) : null;
    const growth = current !== null && prev !== null && prev !== 0
      ? ((current - prev) / prev) * 100
      : null;
    return { ...def, current, prev, growth };
  }), [demoKpiDefs, monthNow, monthPrev]);

  const partnershipImpact = useMemo<DemoImpactRow[]>(() => {
    if (longTerm.length < 10) return [];
    const split = Math.floor(longTerm.length / 2);
    const pre = longTerm.slice(0, split);
    const post = longTerm.slice(split);

    const avg = (arr: DemoKpiPoint[], key: keyof DemoKpiPoint) => arr.reduce((acc, cur) => acc + Number(cur[key] ?? 0), 0) / (arr.length || 1);

    const preRev = avg(pre, "faturamento_real");
    const postRev = avg(post, "faturamento_real");
    const preCac = avg(pre, "cac");
    const postCac = avg(post, "cac");
    const preConv = avg(pre, "taxa_conversao");
    const postConv = avg(post, "taxa_conversao");
    const preTmFisico = avg(pre, "ticket_medio_fisico");
    const postTmFisico = avg(post, "ticket_medio_fisico");
    const preTmDigital = avg(pre, "ticket_medio_digital");
    const postTmDigital = avg(post, "ticket_medio_digital");

    const growth = (a: number, b: number) => (a !== 0 ? ((b - a) / a) * 100 : null);

    return [
      { name: "Faturamento Real", unit: "currency", pre: preRev, post: postRev, growth: growth(preRev, postRev) },
      { name: "CAC", unit: "currency", pre: preCac, post: postCac, growth: growth(preCac, postCac) },
      { name: "Taxa de Conversão", unit: "percentage", pre: preConv, post: postConv, growth: growth(preConv, postConv) },
      { name: "Ticket Médio Físico", unit: "currency", pre: preTmFisico, post: postTmFisico, growth: growth(preTmFisico, postTmFisico) },
      { name: "Ticket Médio Digital", unit: "currency", pre: preTmDigital, post: postTmDigital, growth: growth(preTmDigital, postTmDigital) },
    ];
  }, [longTerm]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans p-4 md:p-8 selection:bg-[#2D8CC7]/30">
        <div className="max-w-[1600px] mx-auto space-y-8">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-[#2D8CC7] rounded-xl flex items-center justify-center shadow-lg shadow-[#2D8CC7]/20">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white uppercase">Dashboard Completo</h1>
              </div>
              <p className="text-slate-400 font-medium pl-[52px]">Visualização pública • dados fictícios</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-slate-800/50 p-2 rounded-lg border border-slate-700">
              <PeriodDropdown dateRange={dateRange} onChange={setDateRange} />
            </div>
          </header>

          {/* ── TABS ── */}
          <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700 w-fit">
            <button
              onClick={() => setActiveTab("performance")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === "performance"
                  ? "bg-[#2D8CC7] text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="h-4 w-4" /> Performance
            </button>
            <button
              onClick={() => setActiveTab("atendimento")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === "atendimento"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageCircle className="h-4 w-4" /> Atendimento
            </button>
          </div>

          {/* ── CONTEÚDO: PERFORMANCE ── */}
          {activeTab === "performance" && (
          <div className="space-y-8">

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard label="Investimento" value={`R$ ${totals.spend.toLocaleString("pt-BR")}`} icon={<DollarSign className="h-5 w-5 text-[#2D8CC7]" />} info="Valor total investido em mídia paga (Meta Ads, Google Ads, etc.) no período selecionado. Representa o custo direto das campanhas ativas." />
            <MetricCard label="Leads" value={totals.leads} icon={<Users className="h-5 w-5 text-blue-400" />} info="Número total de leads gerados pelas campanhas no período. Um lead é um potencial cliente que demonstrou interesse e deixou seus dados de contato." />
            <MetricCard label="Vendas" value={totals.sales} icon={<Target className="h-5 w-5 text-emerald-400" />} info="Total de vendas fechadas e atribuídas às campanhas de mídia paga no período. Indica o resultado comercial direto das ações de marketing." />
            <MetricCard label="Conversão" value={`${conversionRate}%`} icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />} info="Percentual de leads que se tornaram clientes (vendas ÷ leads × 100). Mede a eficiência do processo comercial em transformar interesse em receita." />
            <MetricCard label="Faturamento Estimado" value={`R$ ${totals.revenue.toLocaleString("pt-BR")}`} icon={<TrendingUp className="h-5 w-5 text-white" />} info="Receita total estimada gerada pelas vendas atribuídas às campanhas no período. Calculado com base no ticket médio das vendas registradas." highlight />
            <MetricCard label="ROAS" value={`${roas}x`} icon={<PieChart className="h-5 w-5 text-orange-400" />} info="Return on Ad Spend — retorno sobre o investimento em anúncios. Um ROAS de 4x significa que cada R$ 1 investido gerou R$ 4 em faturamento estimado." />
          </div>

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
                    <AreaChart data={daily}>
                      <defs>
                        <linearGradient id="colorRevDemoPublic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorSpendDemoPublic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2D8CC7" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#2D8CC7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(s) => format(new Date(String(s)), "dd/MM")} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px" }} itemStyle={{ fontSize: "12px", fontWeight: "bold" }} />
                      <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                      <Area type="monotone" dataKey="revenue" name="Faturamento (R$)" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorRevDemoPublic)" />
                      <Area type="monotone" dataKey="total_spend" name="Investimento (R$)" stroke="#2D8CC7" strokeWidth={4} fillOpacity={1} fill="url(#colorSpendDemoPublic)" />
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
                <SalesFunnel
                  steps={[
                    { label: "Impressões", value: totals.impressions, rateLabel: "CTR" },
                    { label: "Cliques", value: totals.clicks, rateLabel: "TX. CONV." },
                    { label: "Leads", value: totals.leads, rateLabel: "TX. FECH." },
                    { label: "Vendas", value: totals.sales, rateLabel: "" },
                  ]}
                />
                <div className="mt-8 pt-6 border-t border-slate-700 text-center w-full">
                  <p className="text-slate-400 text-xs uppercase font-black tracking-widest">Resultado Final</p>
                  <p className="text-3xl font-black text-emerald-400 mt-2">R$ {totals.revenue.toLocaleString("pt-BR")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-xl font-bold text-white">Top Campanhas (Mock)</CardTitle>
              <div className="flex items-center gap-2">
                {(["Todas", "Meta Ads", "Google Ads"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setDemoCampaignFilter(f)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                      demoCampaignFilter === f
                        ? "bg-white text-slate-900"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    )}
                  >
                    {f === "Todas" ? "Todas" : f === "Meta Ads" ? "Meta" : "Google"}
                  </button>
                ))}
                <InfoTooltip text="Ranking das campanhas com maior volume de resultado no período. Compare eficiência entre campanhas e plataformas — identifique quais geram melhor ROAS e menor custo por aquisição para direcionar o investimento." />
              </div>
            </CardHeader>
            <CardContent>
              {selectedDemoCampaign && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedDemoCampaign(null)}>
                  <div className="bg-[#0F172A] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedDemoCampaign.platform}</p>
                        <h2 className="text-lg font-black text-white mt-0.5">{selectedDemoCampaign.name}</h2>
                      </div>
                      <button onClick={() => setSelectedDemoCampaign(null)} className="text-slate-400 hover:text-white text-2xl font-bold leading-none">×</button>
                    </div>
                    <div className="px-6 py-4 grid grid-cols-4 gap-3 border-b border-slate-800">
                      {[
                        { label: "Investimento", value: `R$ ${selectedDemoCampaign.spend.toLocaleString("pt-BR")}` },
                        { label: "Impressões",   value: selectedDemoCampaign.impressions.toLocaleString("pt-BR") },
                        { label: "Cliques",      value: selectedDemoCampaign.clicks.toLocaleString("pt-BR") },
                        { label: "CTR",          value: `${((selectedDemoCampaign.clicks / selectedDemoCampaign.impressions) * 100).toFixed(2)}%` },
                        { label: "CPC",          value: `R$ ${(selectedDemoCampaign.spend / selectedDemoCampaign.clicks).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                        { label: "CPM",          value: `R$ ${((selectedDemoCampaign.spend / selectedDemoCampaign.impressions) * 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                        { label: "Leads",        value: String(selectedDemoCampaign.leads) },
                        { label: "Vendas",       value: String(selectedDemoCampaign.sales) },
                        { label: "Faturamento",  value: `R$ ${selectedDemoCampaign.revenue.toLocaleString("pt-BR")}` },
                        { label: "ROAS",         value: `${(selectedDemoCampaign.revenue / selectedDemoCampaign.spend).toFixed(1)}x` },
                      ].map((m: any) => (
                        <div key={m.label} className="bg-slate-800/50 rounded-xl p-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{m.label}</p>
                          <p className="text-base font-black text-white mt-1">{m.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 overflow-auto px-6 py-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Dados do período (mock)</p>
                      <p className="text-slate-500 text-sm italic">Dados diários não disponíveis no modo demo.</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto scrollbar-dark">
                <div className="overflow-y-auto scrollbar-dark" style={{ maxHeight: "336px" }}>
                  <table className="text-left border-collapse whitespace-nowrap" style={{ minWidth: "1300px", width: "100%" }}>
                    <thead className="sticky top-0 bg-[#1E293B] z-10">
                      <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                        <th className="px-4 py-3 w-20">Plat.</th>
                        <th className="px-4 py-3 min-w-[350px]">Campanha</th>
                        <th className="px-4 py-3 text-right w-32">Investimento</th>
                        <th className="px-4 py-3 text-center w-20">Leads</th>
                        <th className="px-4 py-3 text-center w-20">Vendas</th>
                        <th className="px-4 py-3 text-right w-28">Faturamento</th>
                        <th className="px-4 py-3 text-right w-20">ROAS</th>
                        <th className="px-4 py-3 text-right w-28">Impressões</th>
                        <th className="px-4 py-3 text-right w-24">Cliques</th>
                        <th className="px-4 py-3 text-right w-20">CTR</th>
                        <th className="px-4 py-3 text-right w-24">CPC</th>
                        <th className="px-4 py-3 text-right w-24">CPM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredDemoCampaigns.map((c) => {
                        const roasCamp = c.spend > 0 ? (c.revenue / c.spend).toFixed(1) : "0.0";
                        const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "—";
                        const cpc = c.clicks > 0 ? (c.spend / c.clicks).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
                        const cpm = c.impressions > 0 ? ((c.spend / c.impressions) * 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
                        return (
                          <tr key={c.name} className="text-sm hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => setSelectedDemoCampaign(c)}>
                            <td className="px-4 py-3 text-slate-400 font-bold w-20">{c.platform}</td>
                            <td className="px-4 py-3 min-w-[350px] whitespace-normal">
                              <div className="font-bold text-slate-200 hover:text-blue-400 transition-colors">{c.name}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-right w-32">R$ {c.spend.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-slate-400 font-bold text-center w-20">{c.leads}</td>
                            <td className="px-4 py-3 text-slate-400 font-bold text-center w-20">{c.sales}</td>
                            <td className="px-4 py-3 text-slate-300 font-bold text-right w-28">{c.revenue > 0 ? `R$ ${c.revenue.toLocaleString("pt-BR")}` : "—"}</td>
                            <td className="px-4 py-3 text-right w-20">
                              <span className={cn("font-black px-2 py-1 rounded text-xs", Number(roasCamp) >= 4 ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400")}>
                                {roasCamp}x
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-right w-28">{c.impressions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-slate-500 text-right w-24">{c.clicks.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right w-20">
                              <span className={cn("font-bold", Number(ctr) >= 2 ? "text-emerald-400" : Number(ctr) >= 1 ? "text-slate-300" : "text-orange-400")}>
                                {ctr !== "—" ? `${ctr}%` : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-right w-24">{cpc !== "—" ? `R$ ${cpc}` : "—"}</td>
                            <td className="px-4 py-3 text-slate-500 text-right w-24">{cpm !== "—" ? `R$ ${cpm}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#2D8CC7]" />
                  Indicadores de Negócio (Mock)
                </CardTitle>
                <InfoTooltip text="Indicadores-chave de negócio registrados manualmente pela equipe. Cada card exibe o valor do mês atual e o badge colorido mostra a variação percentual em relação ao mês anterior (MoM — Month over Month)." />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {demoKpiCards.map(kpi => {
                    const formatVal = (v: number) =>
                      kpi.unit === "currency"
                        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
                        : kpi.unit === "percentage"
                          ? `${v}%`
                          : `${v}x`;
                    return (
                      <Card key={kpi.key} className="bg-slate-900/30 border-slate-800 p-5">
                        <div className="flex items-start justify-between">
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.color + "18" }}>
                            <BarChart3 className="h-4 w-4" style={{ color: kpi.color }} />
                          </div>
                          <div className="flex items-start gap-2">
                            {kpi.growth !== null && (
                              <div className={cn("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                                (isLowerBetter(kpi.label) ? kpi.growth <= 0 : kpi.growth >= 0)
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-red-500/10 text-red-400"
                              )}>
                                {kpi.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                {Math.abs(kpi.growth).toFixed(0)}%
                              </div>
                            )}
                            <InfoTooltip text={`${kpi.label}: valor do mês atual com variação percentual em relação ao mês anterior. O badge colorido indica se o resultado melhorou ou piorou no período.`} />
                          </div>
                        </div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mt-3">{kpi.label}</p>
                        <p className="text-2xl font-black text-white mt-1">
                          {kpi.current !== null ? formatVal(kpi.current) : "—"}
                        </p>
                        <p className="text-[9px] text-slate-500 mt-2">Mês atual vs anterior</p>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-bold text-white">Observações Estratégicas</CardTitle>
                <InfoTooltip text="Análise automática dos principais números do período: eficiência de custo por aquisição (CPA), retorno sobre investimento em anúncios (ROAS) e volume de leads gerados. Use como ponto de partida para decisões estratégicas." />
              </CardHeader>
              <CardContent className="space-y-3">
                <InsightItem icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} text={<>Eficiência: CPA projetado em <span className="text-emerald-400 font-bold">R$ {cpa}</span>.</>} />
                <InsightItem icon={<TrendingUp className="h-4 w-4 text-[#2D8CC7]" />} text={<>Tendência: crescimento de faturamento consistente mês a mês.</>} />
                <InsightItem icon={<Zap className="h-4 w-4 text-yellow-400" />} text={<>Oportunidade: ampliar investimento nos criativos com maior CTR.</>} />
              </CardContent>
            </Card>
          </div>



          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-[#2D8CC7]" />
                  Evolução de Longo Prazo (Mock)
                  <InfoTooltip text="Gráfico de barras com a evolução mensal de cada KPI nos últimos 12 meses. As barras em cinza representam o período anterior ao contrato e as coloridas o período de parceria ativa. Selecione o indicador desejado pelos botões acima do gráfico para alternar a visualização entre os diferentes indicadores de negócio." />
                </CardTitle>
                <p className="text-sm text-slate-400 mt-1">Últimos 12 meses — selecione o indicador</p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-slate-600" /> HISTÓRICO ANTERIOR</div>
                <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: demoKpiDefs.find(d => d.key === demoActiveKpi)?.color ?? "#2D8CC7" }} /> PARCERIA ATIVA</div>
              </div>
            </div>

            <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  {demoKpiDefs.map((def) => {
                    const isActive = demoActiveKpi === def.key;
                    return (
                      <button
                        key={def.key}
                        onClick={() => setDemoActiveKpi(def.key)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border",
                          isActive ? "text-white border-transparent" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300"
                        )}
                        style={isActive ? { backgroundColor: def.color + "22", borderColor: def.color, color: def.color } : {}}
                      >
                        {def.label}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const activeDef = demoKpiDefs.find(d => d.key === demoActiveKpi) ?? demoKpiDefs[0];
                  return (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={longTerm} barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px", color: "#fff" }}
                          itemStyle={{ color: "#fff" }}
                          labelStyle={{ color: "#a855f7", fontWeight: "bold", marginBottom: "4px" }}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          formatter={(value: any) =>
                            activeDef.unit === "currency"
                              ? [new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value), activeDef.label]
                              : activeDef.unit === "percentage"
                                ? [`${value}%`, activeDef.label]
                                : [`${value}x`, activeDef.label]
                          }
                        />
                        <Bar dataKey={activeDef.key} name={activeDef.label} radius={[6, 6, 0, 0]}
                          shape={(props: any) => {
                            const { x, y, width, height, payload } = props;
                            const color = payload?.isVigencia ? activeDef.color : "#475569";
                            const r = 6;
                            return <path d={`M${x},${y+r} Q${x},${y} ${x+r},${y} L${x+width-r},${y} Q${x+width},${y} ${x+width},${y+r} L${x+width},${y+height} L${x},${y+height} Z`} fill={color} opacity={0.9} />;
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Impacto da Parceria (Mock) */}
          {partnershipImpact.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <Zap className="h-5 w-5 text-yellow-400" />
                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Impacto da Parceria (Mock)</h2>
                <InfoTooltip text="Compara a média dos indicadores de negócio antes e depois do início do contrato com a agência. Permite mensurar objetivamente o impacto das estratégias aplicadas em cada KPI ao longo da parceria." />
              </div>
              <HorizontalScroll>
                {partnershipImpact.map((item) => (
                  <Card key={item.name} className="bg-[#1E293B] border-slate-800 shadow-2xl p-5 relative overflow-hidden flex-none w-auto min-w-[325px]">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">{item.name}</p>
                        <div className="flex items-end gap-3 mt-2">
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase font-bold">Média Antes</p>
                            <p className="text-sm font-black text-slate-400 line-through decoration-slate-600/50">
                              {item.unit === "currency"
                                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(item.pre)
                                : item.unit === "percentage"
                                  ? `${item.pre.toFixed(1)}%`
                                  : `${item.pre.toFixed(1)}x`}
                            </p>
                          </div>
                          <ArrowUp className="h-4 w-4 text-slate-600 mb-1.5" />
                          <div>
                            <p className="text-[9px] text-[#2D8CC7] uppercase font-bold">Média Atual</p>
                            <p className="text-xl font-black text-white">
                              {item.unit === "currency"
                                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(item.post)
                                : item.unit === "percentage"
                                  ? `${item.post.toFixed(1)}%`
                                  : `${item.post.toFixed(1)}x`}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className={cn("flex flex-col items-center justify-center h-16 w-16 rounded-2xl border shadow-lg",
                        (isLowerBetter(item.name) ? (item.growth ?? 0) <= 0 : (item.growth ?? 0) >= 0)
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                      )}>
                        <span className="text-xs font-black">
                          {(item.growth ?? 0) >= 0 ? "+" : ""}{Number(item.growth ?? 0).toFixed(0)}%
                        </span>
                        <span className="text-[8px] font-bold uppercase opacity-70">Cresc.</span>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 h-full w-32 bg-gradient-to-l from-[#2D8CC7]/5 to-transparent pointer-events-none" />
                  </Card>
                ))}
              </HorizontalScroll>
            </div>
          )}

          {/* Comparativo de Performance (Mock) */}
          {(() => {
            const fmtDemo = (v: number, unit: string) =>
              unit === "currency"
                ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
                : unit === "percentage" ? `${v.toFixed(2)}%` : `${v.toFixed(2)}x`;

            // Metas mock: 10% acima da média histórica
            const demoPerfRows = demoKpiDefs.map(def => {
              const values = longTerm.map(m => Number(m[def.key]));
              const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
              const current = Number(monthNow?.[def.key] ?? 0);
              const target = avg * 1.1;
              const vsAvg = avg !== 0 ? ((current - avg) / avg) * 100 : null;
              const pctMeta = target !== 0 ? (current / target) * 100 : null;
              const lower = isLowerBetter(def.label);
              let status = "Na média";
              if (vsAvg !== null) {
                if (pctMeta !== null && (lower ? pctMeta <= 100 : pctMeta >= 100)) status = "Meta atingida";
                else if (pctMeta !== null && (lower ? pctMeta <= 105 : pctMeta >= 90)) status = "Próximo da meta";
                else if (lower ? vsAvg <= -5 : vsAvg >= 5) status = "Acima da média";
                else if (lower ? vsAvg >= 5 : vsAvg <= -5) status = "Abaixo da média";
              }
              return { def, current, avg, target, vsAvg, pctMeta, status };
            });

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <ListFilter className="h-5 w-5 text-[#2D8CC7]" />
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight">Comparativo de Performance (Mock)</h2>
                  <InfoTooltip text="Tabela que cruza a média histórica, a meta definida e o resultado atual de cada KPI. A coluna 'vs Média' mostra se o resultado está acima ou abaixo do histórico, enquanto '% Meta' indica o quanto da meta foi atingido. O status resume a situação de cada indicador." />
                </div>
                <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
                  <CardContent className="p-0">
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
                          {demoPerfRows.map(({ def, current, avg, target, vsAvg, pctMeta, status }) => {
                            const lower = isLowerBetter(def.label);
                            const vsPositive = vsAvg !== null && (lower ? vsAvg <= 0 : vsAvg >= 0);
                            const statusColor =
                              status === "Meta atingida" ? "text-emerald-400 bg-emerald-500/10" :
                              status === "Próximo da meta" ? "text-yellow-400 bg-yellow-500/10" :
                              status === "Acima da média" ? "text-blue-400 bg-blue-500/10" :
                              status === "Abaixo da média" ? "text-red-400 bg-red-500/10" :
                              "text-slate-400 bg-slate-700/30";
                            return (
                              <tr key={def.key} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-5 py-4">
                                  <p className="text-sm font-bold text-white">{def.label}</p>
                                </td>
                                <td className="px-5 py-4 text-sm text-slate-400 font-semibold whitespace-nowrap">
                                  {fmtDemo(avg, def.unit)}
                                </td>
                                <td className="px-5 py-4 text-sm text-slate-400 font-semibold whitespace-nowrap">
                                  {fmtDemo(target, def.unit)}
                                </td>
                                <td className="px-5 py-4 text-sm font-black text-white whitespace-nowrap">
                                  {fmtDemo(current, def.unit)}
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
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Tabela Consolidada (Mock) */}
          <Card className="bg-[#1E293B] border-slate-800 shadow-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-white">Consolidado (Mock)</CardTitle>
              <InfoTooltip text="Histórico completo dos últimos 12 meses para cada indicador de negócio. Permite visualizar tendências de longo prazo, sazonalidades e a evolução mês a mês de cada KPI." />
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
                      <th className="pb-4 pl-4">Indicador</th>
                      {longTerm.map((m) => (
                        <th key={m.month} className="pb-4 text-center min-w-[90px]">{m.month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    <tr className="text-sm">
                      <td className="py-4 pl-4 font-bold text-slate-200">Faturamento Real</td>
                      {longTerm.map((m) => (
                        <td key={m.month} className="py-4 text-center text-slate-300 font-bold">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(m.faturamento_real)}
                        </td>
                      ))}
                    </tr>
                    <tr className="text-sm">
                      <td className="py-4 pl-4 font-bold text-slate-200">CAC</td>
                      {longTerm.map((m) => (
                        <td key={m.month} className="py-4 text-center text-slate-300 font-bold">
                          R$ {Math.round(m.cac).toLocaleString("pt-BR")}
                        </td>
                      ))}
                    </tr>
                    <tr className="text-sm">
                      <td className="py-4 pl-4 font-bold text-slate-200">ROI</td>
                      {longTerm.map((m) => (
                        <td key={m.month} className="py-4 text-center text-slate-300 font-bold">
                          {m.roi}x
                        </td>
                      ))}
                    </tr>
                    <tr className="text-sm">
                      <td className="py-4 pl-4 font-bold text-slate-200">Taxa de Conversão</td>
                      {longTerm.map((m) => (
                        <td key={m.month} className="py-4 text-center text-slate-300 font-bold">
                          {m.taxa_conversao}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          </div>
          )}

          {/* ── CONTEÚDO: ATENDIMENTO ── */}
          {activeTab === "atendimento" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <MessageCircle className="h-5 w-5 text-emerald-400" />
                <h2 className="text-xl font-bold text-white uppercase tracking-tight">Automação de Conversas</h2>
              </div>
              <ConversationKpiDashboard
                totals={demoConversation.totals}
                trend={demoConversation.trend}
                byCampaign={demoConversation.byCampaign}
                bySource={demoConversation.bySource}
                byAgent={demoConversation.byAgent}
                timings={demoConversation.timings}
                isLoading={false}
                hasData={true}
                theme="dark"
              />
            </div>
          )}

          <footer className="text-center pt-8 border-t border-slate-800 space-y-4">
            <p className="text-slate-500 text-sm font-medium italic">Esta página é apenas para demonstração visual e não reflete dados reais.</p>
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
    { label: "Mês atual",      from: format(startOfMonth(new Date()), "yyyy-MM-dd"),              to: format(endOfMonth(new Date()), "yyyy-MM-dd") },
    { label: "Mês anterior",   from: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),to: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") },
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


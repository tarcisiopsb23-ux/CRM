import { useState, useMemo } from "react";
import { useCampaignData, type PeriodRange } from "@/hooks/useCampaignData";
import { useOrganization } from "@/hooks/useOrganization";
import { useSupplierExpenses } from "@/hooks/useFinancial";
import { useFunnelStages } from "@/hooks/useFunnelStages";
import { useClientConversationKpis } from "@/hooks/useClientConversationKpis";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SalesFunnel } from "@/components/ui/sales-funnel";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  BarChart3, DollarSign, MessageCircle, MousePointerClick, Users, TrendingUp, Target,
  Eye, ArrowRightLeft, Filter, Radio, Trophy, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
const pct  = (v: number) => `${v.toFixed(2)}%`;
const iso  = (d: Date)   => format(d, "yyyy-MM-dd");

const COLORS = [
  "hsl(265 62% 46%)", "hsl(210 80% 52%)", "hsl(152 60% 42%)",
  "hsl(38 92% 50%)",  "hsl(0 84% 60%)",   "hsl(280 70% 55%)",
];

const OBJECTIVE_LABELS: Record<string, string> = {
  LEADS: "Leads", SALES: "Vendas", AWARENESS: "Awareness",
  ENGAGEMENT: "Engajamento", TRAFFIC: "Tráfego", APP_INSTALLS: "App",
};

const STATUS_COLORS: Record<string, string> = {
  Ativa: "bg-emerald-600", Pausada: "bg-amber-500 text-white",
  Arquivada: "bg-slate-400 text-white", Encerrada: "bg-slate-300",
};

// ─── Period presets ───────────────────────────────────────────────────────────

type Preset = "7d" | "30d" | "month" | "quarter" | "year" | "custom";

function buildRange(preset: Preset, customFrom?: string, customTo?: string): PeriodRange {
  const now = new Date();
  switch (preset) {
    case "7d":      return { from: iso(subDays(now, 6)),          to: iso(now) };
    case "30d":     return { from: iso(subDays(now, 29)),         to: iso(now) };
    case "month":   return { from: iso(startOfMonth(now)),        to: iso(endOfMonth(now)) };
    case "quarter": return { from: iso(subMonths(startOfMonth(now), 2)), to: iso(endOfMonth(now)) };
    case "year":    return { from: iso(startOfYear(now)),         to: iso(endOfYear(now)) };
    case "custom":  return { from: customFrom ?? iso(subDays(now, 29)), to: customTo ?? iso(now) };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPI({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignReports() {
  const organizationId = useOrganization();

  // Period filter
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(iso(startOfMonth(new Date())));
  const [customTo,   setCustomTo]   = useState(iso(endOfMonth(new Date())));
  const range = useMemo(() => buildRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  // Tabs
  const [activeTab, setActiveTab] = useState<"campanhas" | "atendimento">("campanhas");

  // Data
  const { campaigns, totals, trend, byPlatform, topByRoas, topByRevenue, topByConversions, isLoading } = useCampaignData(range);
  const { stages: funnelStages, isLoading: funnelLoading } = useFunnelStages(organizationId, {
    from: range.from, to: range.to,
  });
  const { data: expenses = [] } = useSupplierExpenses(organizationId);
  const conversationKpis = useClientConversationKpis(organizationId, undefined, range);

  // Campaign filters
  const [platform, setPlatform] = useState("all");
  const [status,   setStatus]   = useState("all");

  const platforms = useMemo(() => Array.from(new Set(campaigns.map(c => c.platform).filter(Boolean))).sort(), [campaigns]);
  const statuses  = useMemo(() => Array.from(new Set(campaigns.map(c => c.status).filter(Boolean))).sort(),   [campaigns]);

  const filtered = useMemo(() => campaigns.filter(c => {
    if (platform !== "all" && c.platform !== platform) return false;
    if (status   !== "all" && c.status   !== status)   return false;
    return true;
  }), [campaigns, platform, status]);

  // Derived KPIs
  const cpc  = totals.clicks      > 0 ? totals.spend / totals.clicks : 0;
  const cpm  = totals.impressions  > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const ctr  = totals.impressions  > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpl  = totals.leads        > 0 ? totals.spend / totals.leads : 0;
  const roas = totals.spend        > 0 ? totals.revenue / totals.spend : 0;
  const roi  = totals.spend        > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : 0;

  // Financial comparison — marketing expenses in the period
  const marketingExpenses = useMemo(() => {
    return expenses
      .filter(e => {
        const d = e.due_date ?? e.created_at ?? "";
        if (range.from && d < range.from) return false;
        if (range.to   && d > range.to)   return false;
        const cat = (e.suppliers as any)?.service_category ?? "";
        const desc = (e.description ?? "").toLowerCase();
        return cat === "marketing" || desc.includes("ads") || desc.includes("campanha") || desc.includes("tráfego");
      })
      .reduce((s, e) => s + Number(e.value ?? 0), 0);
  }, [expenses, range]);

  const discrepancy = totals.spend - marketingExpenses;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Carregando dados de campanhas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Relatório de Campanhas</h1>
        <p className="text-sm text-muted-foreground mt-1">Google Ads, Meta Ads — visão executiva de performance.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl border border-border w-fit">
        <button
          onClick={() => setActiveTab("campanhas")}
          className={cn(
            "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === "campanhas"
              ? "bg-background text-primary shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <BarChart3 className="h-4 w-4" /> Campanhas
        </button>
        <button
          onClick={() => setActiveTab("atendimento")}
          className={cn(
            "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === "atendimento"
              ? "bg-background text-emerald-700 shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageCircle className="h-4 w-4" /> Atendimento
        </button>
      </div>

      {/* Filters bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Period preset */}
            <Select value={preset} onValueChange={v => setPreset(v as Preset)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="quarter">Últimos 3 meses</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom date range — only visible when preset = custom */}
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={iso(new Date())}
                  onChange={e => setCustomTo(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

            {/* Platform filter */}
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas plataformas</SelectItem>
                {platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {activeTab === "campanhas" && (<div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPI icon={DollarSign}      label="Investimento"  value={fmt(totals.spend)} />
        <KPI icon={DollarSign}      label="Receita"       value={fmt(totals.revenue)} />
        <KPI icon={TrendingUp}      label="ROAS"          value={`${roas.toFixed(2)}x`} />
        <KPI icon={TrendingUp}      label="ROI"           value={pct(roi)} />
        <KPI icon={Eye}             label="Impressões"    value={fmtK(totals.impressions)} />
        <KPI icon={Radio}           label="Alcance"       value={fmtK(totals.reach)} />
        <KPI icon={MousePointerClick} label="Cliques"     value={fmtK(totals.clicks)} />
        <KPI icon={ArrowRightLeft}  label="CTR"           value={pct(ctr)} />
        <KPI icon={DollarSign}      label="CPC"           value={fmt(cpc)} />
        <KPI icon={DollarSign}      label="CPM"           value={fmt(cpm)} />
        <KPI icon={Users}           label="Leads"         value={fmtK(totals.leads)} />
        <KPI icon={Target}          label="CPL"           value={fmt(cpl)} />
      </div>

      {/* Funil de Conversão + Visão Geral + Por Plataforma */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Funil de Conversão</CardTitle>
            <CardDescription>Da impressão ao fechamento — campanhas + CRM</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {funnelLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : (
              <SalesFunnel
                steps={[
                  { label: "Impressões", value: totals.impressions, rateLabel: "CTR" },
                  { label: "Cliques",    value: totals.clicks,      rateLabel: "TX. LEAD" },
                  ...funnelStages.map(s => ({ label: s.label, value: s.value, rateLabel: "Conv." })),
                ]}
              />
            )}
          </CardContent>
        </Card>

        {/* Coluna direita: Visão Geral + Por Plataforma */}
        <div className="flex flex-col gap-6">

          {/* 🔷 1. VISÃO GERAL */}
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Visão Geral
              </CardTitle>
              <CardDescription>Resultado consolidado do período</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 pt-4">
              {(() => {
                const lucro = totals.revenue - totals.spend;
                const roasVal = totals.spend > 0 ? totals.revenue / totals.spend : 0;
                const isPositive = (v: number) => v >= 0;
                return (
                  <>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 col-span-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Receita Gerada</p>
                      <p className="text-3xl font-black text-emerald-700">{fmt(totals.revenue)}</p>
                      <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                        <span>{totals.revenue > totals.spend ? "↑" : "↓"}</span>
                        {totals.revenue > totals.spend ? "Retorno positivo sobre o investimento" : "Retorno abaixo do investimento"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Investimento</p>
                      <p className="text-xl font-black text-slate-900">{fmt(totals.spend)}</p>
                    </div>
                    <div className={`rounded-xl border p-3 ${roasVal >= 2 ? "bg-emerald-50 border-emerald-200" : roasVal >= 1 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">ROAS</p>
                      <p className={`text-xl font-black ${roasVal >= 2 ? "text-emerald-700" : roasVal >= 1 ? "text-amber-700" : "text-rose-700"}`}>
                        {roasVal.toFixed(2)}x {roasVal >= 3 ? "↑" : roasVal >= 1 ? "" : "↓"}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-3 col-span-2 ${isPositive(lucro) ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Lucro</p>
                      <p className={`text-xl font-black ${isPositive(lucro) ? "text-emerald-700" : "text-rose-700"}`}>
                        {lucro >= 0 ? "+" : ""}{fmt(lucro)} {isPositive(lucro) ? "↑" : "↓"}
                      </p>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Por Plataforma */}
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle>Investimento por Plataforma</CardTitle>
              <CardDescription>Distribuição do investimento</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center overflow-visible">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
                  <Pie data={byPlatform} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={true}>
                    {byPlatform.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* 🔷 2. CONTROLE FINANCEIRO + 3. PERFORMANCE FINANCEIRA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Controle Financeiro</CardTitle>
            <CardDescription>Comparativo entre investimento em mídia e valor pago</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {(() => {
              const ajuste = marketingExpenses - totals.spend;
              return (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-3 text-muted-foreground">Investimento em Mídia</td>
                      <td className="py-3 text-right font-bold text-foreground">{fmt(totals.spend)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">Valor Pago (Financeiro)</td>
                      <td className="py-3 text-right font-bold text-foreground">{fmt(marketingExpenses)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">Ajuste Financeiro (Timing)</td>
                      <td className={`py-3 text-right font-bold ${Math.abs(ajuste) < 1 ? "text-emerald-600" : ajuste > 0 ? "text-amber-600" : "text-rose-600"}`}>
                        {ajuste >= 0 ? "+" : ""}{fmt(ajuste)}
                        <span className="ml-1 text-[10px]">{Math.abs(ajuste) < 1 ? "✓ Alinhado" : ajuste > 0 ? "↑ Pago a mais" : "↓ Pago a menos"}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Performance Financeira</CardTitle>
            <CardDescription>Retorno gerado sobre o capital investido</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {(() => {
              const lucro = totals.revenue - totals.spend;
              const roasVal = totals.spend > 0 ? totals.revenue / totals.spend : 0;
              const roasLabel = roasVal >= 4 ? "Alto ↑" : roasVal >= 2 ? "Médio" : roasVal >= 1 ? "Baixo" : "Negativo ↓";
              return (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-3 text-muted-foreground">Receita Gerada</td>
                      <td className="py-3 text-right font-bold text-emerald-600">{fmt(totals.revenue)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">Lucro</td>
                      <td className={`py-3 text-right font-bold ${lucro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {lucro >= 0 ? "+" : ""}{fmt(lucro)} {lucro >= 0 ? "↑" : "↓"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">ROAS</td>
                      <td className={`py-3 text-right font-bold ${roasVal >= 2 ? "text-emerald-600" : roasVal >= 1 ? "text-amber-600" : "text-rose-600"}`}>
                        {roasVal.toFixed(2)}x — {roasLabel}
                      </td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* 🔷 4. QUALIDADE DE VENDAS + 5. EFICIÊNCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Qualidade de Vendas</CardTitle>
            <CardDescription>Ticket médio geral e por campanha</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {(() => {
              const withTicket = campaigns.filter(c => c.conversions > 0).map(c => ({ ...c, avgTicket: c.revenue / c.conversions }));
              const ticketGeral = totals.conversions > 0 ? totals.revenue / totals.conversions : null;
              const best  = withTicket.length > 0 ? [...withTicket].sort((a, b) => b.avgTicket - a.avgTicket)[0] : null;
              const worst = withTicket.length > 0 ? [...withTicket].sort((a, b) => a.avgTicket - b.avgTicket)[0] : null;
              return (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-3 text-muted-foreground">Ticket Médio Geral</td>
                      <td className="py-3 text-right font-bold text-foreground">
                        {ticketGeral !== null ? fmt(ticketGeral) : <span className="text-muted-foreground text-xs">Sem dados</span>}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">
                        <span className="text-emerald-600">↑</span> Maior Ticket por Campanha
                        {best && <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{best.name}</p>}
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-600">
                        {best ? fmt(best.avgTicket) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">
                        <span className="text-rose-500">↓</span> Menor Ticket por Campanha
                        {worst && <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{worst.name}</p>}
                      </td>
                      <td className="py-3 text-right font-bold text-rose-600">
                        {worst ? fmt(worst.avgTicket) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Eficiência</CardTitle>
            <CardDescription>Custo por resultado obtido</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {(() => {
              const cac = totals.conversions > 0 ? totals.spend / totals.conversions : null;
              const cpv = totals.conversions > 0 ? totals.spend / totals.conversions : null;
              if (!cac) return <p className="text-sm text-muted-foreground py-4 text-center">Sem dados de conversão no período</p>;
              return (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-3 text-muted-foreground">CAC (Custo de Aquisição)</td>
                      <td className="py-3 text-right font-bold text-foreground">{fmt(cac)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">Custo por Venda</td>
                      <td className="py-3 text-right font-bold text-foreground">{cpv ? fmt(cpv) : "—"}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-muted-foreground">Total de Conversões</td>
                      <td className="py-3 text-right font-bold text-foreground">{totals.conversions}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* 🧠 INSIGHTS + RESUMO EXECUTIVO */}
      {(() => {
        const lucro = totals.revenue - totals.spend;
        const roasVal = totals.spend > 0 ? totals.revenue / totals.spend : 0;
        const ticketGeral = totals.conversions > 0 ? totals.revenue / totals.conversions : null;
        const ajuste = marketingExpenses - totals.spend;

        const roasInterpretacao = roasVal >= 4
          ? { label: "Alto", cor: "text-emerald-700", desc: "Excelente retorno. O investimento está escalável e altamente eficiente." }
          : roasVal >= 2
          ? { label: "Médio", cor: "text-amber-700", desc: "Retorno satisfatório. Há espaço para otimização e escala." }
          : roasVal >= 1
          ? { label: "Baixo", cor: "text-orange-600", desc: "O investimento está retornando, mas com margem estreita. Revisar criativos e segmentação." }
          : { label: "Negativo", cor: "text-rose-700", desc: "O investimento não está se pagando. Ação imediata necessária." };

        const resumo = `Com investimento de ${fmt(totals.spend)}, as campanhas geraram ${fmt(totals.revenue)} em receita, alcançando um ROAS de ${roasVal.toFixed(2)}x e um ${lucro >= 0 ? "lucro" : "prejuízo"} de ${fmt(Math.abs(lucro))}, indicando desempenho ${roasVal >= 2 ? "positivo" : roasVal >= 1 ? "moderado" : "abaixo do esperado"}.`;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Insights Estratégicos</CardTitle>
                <CardDescription>Análise automática do período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">ROAS — {roasInterpretacao.label}</p>
                  <p className={`text-sm font-semibold ${roasInterpretacao.cor}`}>{roasVal.toFixed(2)}x</p>
                  <p className="text-xs text-muted-foreground mt-1">{roasInterpretacao.desc}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Eficiência do Investimento</p>
                  <p className={`text-sm font-semibold ${lucro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {lucro >= 0 ? "↑ Está valendo a pena" : "↓ Não está se pagando"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {roasVal >= 3 ? "Campanha escalável. Considere aumentar o orçamento." : roasVal >= 1 ? "Retorno positivo, mas ainda não no ponto ideal de escala." : "Revisar estratégia antes de aumentar investimento."}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Qualidade das Vendas</p>
                  <p className="text-sm font-semibold text-foreground">
                    {ticketGeral ? `Ticket médio: ${fmt(ticketGeral)}` : "Sem dados de ticket médio"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ticketGeral && ticketGeral > totals.spend / (totals.conversions || 1) * 3
                      ? "Ticket alto. Oportunidade de aumentar volume de vendas."
                      : "Avaliar estratégias de upsell para elevar o valor médio por cliente."}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">Controle Financeiro</p>
                  <p className={`text-sm font-semibold ${Math.abs(ajuste) < 1 ? "text-emerald-600" : "text-amber-600"}`}>
                    {Math.abs(ajuste) < 1 ? "✓ Valores alinhados" : `Diferença de ${fmt(Math.abs(ajuste))}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.abs(ajuste) < 1 ? "Sem divergência entre mídia e financeiro." : "Verificar lançamentos pendentes no financeiro."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-primary">Resumo Executivo</CardTitle>
                <CardDescription>Síntese estratégica do período</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm leading-relaxed text-foreground font-medium">{resumo}</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Investimento</p>
                    <p className="text-lg font-black text-foreground">{fmt(totals.spend)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Receita</p>
                    <p className="text-lg font-black text-emerald-600">{fmt(totals.revenue)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">ROAS</p>
                    <p className={`text-lg font-black ${roasVal >= 2 ? "text-emerald-600" : roasVal >= 1 ? "text-amber-600" : "text-rose-600"}`}>{roasVal.toFixed(2)}x</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Lucro</p>
                    <p className={`text-lg font-black ${lucro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{lucro >= 0 ? "+" : ""}{fmt(lucro)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Evolução diária */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Evolução Diária</CardTitle>
          <CardDescription>Investimento e leads no período</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
              <XAxis dataKey="date" fontSize={11} tickFormatter={d => format(new Date(d + "T00:00:00"), "dd/MM")} />
              <YAxis yAxisId="left"  fontSize={11} tickFormatter={v => `R${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" fontSize={11} />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === "Investimento" || name === "Receita" ? [fmt(v), name] : [v, name]
                }
                labelFormatter={l => format(new Date(l + "T00:00:00"), "dd/MM/yyyy")}
              />
              <Legend />
              <Line yAxisId="left"  type="monotone" dataKey="spend"   name="Investimento" stroke="hsl(265 62% 46%)" strokeWidth={2} dot={false} />
              <Line yAxisId="left"  type="monotone" dataKey="revenue" name="Receita"       stroke="hsl(152 60% 42%)" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="leads"   name="Leads"         stroke="hsl(210 80% 52%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Receita vs Investimento (barras mensais) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Receita vs Investimento</CardTitle>
          <CardDescription>Comparativo diário no período</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
              <XAxis dataKey="date" fontSize={11} tickFormatter={d => format(new Date(d + "T00:00:00"), "dd/MM")} />
              <YAxis fontSize={11} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={l => format(new Date(l + "T00:00:00"), "dd/MM/yyyy")} />
              <Legend />
              <Bar dataKey="spend"   name="Investimento" fill="hsl(265 62% 46%)" radius={[3,3,0,0]} />
              <Bar dataKey="revenue" name="Receita"       fill="hsl(152 60% 42%)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Ranking por ROAS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Ranking por ROAS</CardTitle>
            <CardDescription>Top 5 mais rentáveis no período</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topByRoas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
            ) : topByRoas.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400 w-4">{i + 1}°</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <span className="text-sm font-black text-primary ml-2 shrink-0">{c.roas.toFixed(2)}x</span>
                  </div>
                  <Progress value={Math.min((c.roas / (topByRoas[0]?.roas || 1)) * 100, 100)} className="h-1.5" />
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground">{fmt(c.spend)} investido</span>
                    <span className="text-[10px] text-muted-foreground">{fmt(c.revenue)} receita</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Ranking por Faturamento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Ranking por Faturamento</CardTitle>
            <CardDescription>Top 5 por receita gerada no período</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topByRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
            ) : topByRevenue.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400 w-4">{i + 1}°</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <span className="text-sm font-black text-emerald-600 ml-2 shrink-0">{fmt(c.revenue)}</span>
                  </div>
                  <Progress value={Math.min((c.revenue / (topByRevenue[0]?.revenue || 1)) * 100, 100)} className="h-1.5 [&>div]:bg-emerald-500" />
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground">{fmt(c.spend)} investido</span>
                    <span className="text-[10px] text-muted-foreground">ROAS {c.roas.toFixed(2)}x</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Ranking por Conversão */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /> Ranking por Conversão</CardTitle>
            <CardDescription>Top 5 por leads gerados no período</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topByConversions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período</p>
            ) : topByConversions.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400 w-4">{i + 1}°</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <span className="text-sm font-black text-blue-600 ml-2 shrink-0">{c.leads} leads</span>
                  </div>
                  <Progress value={Math.min((c.leads / (topByConversions[0]?.leads || 1)) * 100, 100)} className="h-1.5 [&>div]:bg-blue-500" />
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground">{fmt(c.cpl)} CPL</span>
                    <span className="text-[10px] text-muted-foreground">{fmt(c.spend)} investido</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

      </div>

      {/* Tabela de campanhas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Campanhas</CardTitle>
          <CardDescription>{filtered.length} campanha{filtered.length !== 1 ? "s" : ""} no período</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Plataforma</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead className="text-right">Investimento</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead className="text-right">% Consumido</TableHead>
                  <TableHead className="text-right">Alcance</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm max-w-[180px] truncate">{c.name}</TableCell>
                    <TableCell><Badge variant="secondary">{c.platform}</Badge></TableCell>
                    <TableCell>
                      {c.objective ? (
                        <Badge variant="outline" className="text-[10px]">
                          {OBJECTIVE_LABELS[c.objective] ?? c.objective}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmt(c.spend)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {c.budget_amount ? fmt(c.budget_amount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.budget_amount ? (
                        <div className="flex items-center justify-end gap-2">
                          <Progress
                            value={Math.min(c.budgetPct, 100)}
                            className={`h-1.5 w-16 ${c.budgetPct > 90 ? "[&>div]:bg-red-500" : c.budgetPct > 70 ? "[&>div]:bg-amber-500" : ""}`}
                          />
                          <span className={`text-xs font-bold ${c.budgetPct > 90 ? "text-red-600" : c.budgetPct > 70 ? "text-amber-600" : "text-slate-600"}`}>
                            {c.budgetPct.toFixed(0)}%
                          </span>
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtK(c.reach)}</TableCell>
                    <TableCell className="text-right text-sm">{c.leads}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(c.cpl)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(c.revenue)}</TableCell>
                    <TableCell className="text-right text-sm font-bold">
                      <span className={c.roas >= 2 ? "text-emerald-600" : c.roas >= 1 ? "text-amber-600" : "text-red-500"}>
                        {c.spend > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "Ativa" ? "default" : "outline"}
                        className={STATUS_COLORS[c.status] ?? ""}>
                        {c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      Nenhuma campanha encontrada para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      </div>)} {/* fim activeTab === "campanhas" */}

      {/* Aba Atendimento */}
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
  );
}
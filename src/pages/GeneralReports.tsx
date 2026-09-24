import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, TrendingUp, Users, Target, FileText, Download, Filter, Megaphone, Eye, MousePointerClick, ArrowRightLeft } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { useTasksReport } from "@/hooks/useProjects";
import { useAllClientsCampaigns } from "@/hooks/useAllClientsCampaigns";
import { endOfMonth, startOfMonth, subMonths, subDays, format as fmtDate } from "date-fns";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["hsl(265 62% 46%)", "hsl(210 80% 52%)", "hsl(152 60% 42%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)"];

export default function GeneralReports() {
  const [reportType, setReportType] = useState("financial");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Relatórios Gerais</h1>
          <p className="text-sm text-muted-foreground mt-1">Relatórios dinâmicos baseados nos dados do CRM.</p>
        </div>
        <Button variant="outline" onClick={() => alert("Exportação CSV em desenvolvimento")}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <Tabs value={reportType} onValueChange={setReportType} className="w-full">
        <TabsList>
          <TabsTrigger value="financial" className="gap-1.5"><DollarSign className="h-4 w-4" /> Financeiro</TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5"><TrendingUp className="h-4 w-4" /> Vendas</TabsTrigger>
          <TabsTrigger value="operational" className="gap-1.5"><FileText className="h-4 w-4" /> Operacional</TabsTrigger>
          <TabsTrigger value="goals" className="gap-1.5"><Target className="h-4 w-4" /> Metas</TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5"><Megaphone className="h-4 w-4" /> Campanhas dos Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="financial">
          <FinancialReport />
        </TabsContent>
        <TabsContent value="sales">
          <SalesReport />
        </TabsContent>
        <TabsContent value="operational">
          <OperationalReport />
        </TabsContent>
        <TabsContent value="goals">
          <GoalsReport />
        </TabsContent>
        <TabsContent value="campaigns">
          <ClientsCampaignsReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FinancialReport() {
  const organizationId = useOrganization();
  const payments = usePayments(organizationId);
  const expenses = useSupplierExpenses(organizationId);
  const series = useMemo(() => {
    if (!organizationId) return [];
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(new Date(), 5 - i));
    const pRows = payments.data ?? [];
    const eRows = expenses.data ?? [];
    return months.map((d) => {
      const from = fmtDate(startOfMonth(d), "yyyy-MM-dd");
      const to = fmtDate(endOfMonth(d), "yyyy-MM-dd");
      const receitas = pRows
        .filter((r) => r.due_date >= from && r.due_date <= to)
        .reduce((s, r) => s + Number(r.value ?? 0), 0);
      const despesas = eRows
        .filter((r) => r.due_date >= from && r.due_date <= to)
        .reduce((s, r) => s + Number(r.value ?? 0), 0);
      return { month: fmtDate(d, "LLL"), receitas, despesas, lucro: receitas - despesas };
    });
  }, [organizationId, payments.data, expenses.data]);
  const isLoading = payments.isLoading || expenses.isLoading;
  const totalReceitas = series.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas = series.reduce((s, d) => s + d.despesas, 0);
  const totalLucro = series.reduce((s, d) => s + d.lucro, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI icon={TrendingUp} label="Receitas (período)" value={fmt(totalReceitas)} accent="text-emerald-600" />
        <KPI icon={DollarSign} label="Despesas (período)" value={fmt(totalDespesas)} accent="text-destructive" />
        <KPI icon={Target} label="Lucro líquido" value={fmt(totalLucro)} accent="text-primary" />
      </div>
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Receitas vs Despesas vs Lucro</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="receitas" name="Receitas" fill="hsl(152 60% 42%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" name="Despesas" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lucro" name="Lucro" fill="hsl(265 62% 46%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {isLoading ? <p className="text-xs text-muted-foreground mt-2">Carregando...</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SalesReport() {
  const organizationId = useOrganization();
  type SalesRow = { id: string; client: string; service: string; value: number; origin: string; responsible: string; status: string };
  type OriginSlice = { name: string; value: number };
  // sales report needs full lead data for correct counts;
  // includeConverted=true will keep records that were removed from the
  // kanban/list views after becoming clients.
  const { leads, loading } = useLeadsKanban(organizationId, { includeConverted: true });
  const sales = useMemo(() => {
    if (!organizationId) return { table: [] as SalesRow[], byOrigin: [] as OriginSlice[] };
    const recent = [...(leads ?? [])]
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .slice(0, 20);
    const table: SalesRow[] = recent.map((r) => {
      const statusRaw = r.etapa_kanban as string | undefined;
      return {
        id: String(r.id),
        client: (r.company as string) || (r.name as string) || "-",
        service: "—",
        value: Number((r.value as number | undefined) ?? 0),
        origin: (r.source as string | undefined) || "Outros",
        responsible: "",
        status: statusRaw === "efetivados" ? "Fechado" : (statusRaw ?? ""),
      };
    });
    const originAgg: Record<string, number> = {};
    for (const t of table) originAgg[t.origin] = (originAgg[t.origin] ?? 0) + 1;
    const byOrigin: OriginSlice[] = Object.entries(originAgg).map(([name, value]) => ({ name, value }));
    return { table, byOrigin };
  }, [organizationId, leads]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h3 className="font-display font-semibold text-foreground mb-4">Vendas Recentes</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.table.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">{s.client}</TableCell>
                    <TableCell className="text-sm">{s.service}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(s.value)}</TableCell>
                    <TableCell><Badge variant="secondary">{s.origin}</Badge></TableCell>
                    <TableCell className="text-sm">{s.responsible}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "Fechado" ? "default" : "outline"}
                        className={s.status === "Fechado" ? "bg-emerald-600" : s.status === "Cancelado" ? "bg-destructive text-destructive-foreground" : ""}>
                        {s.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="font-display font-semibold text-foreground mb-4">Vendas por Origem</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={sales.byOrigin} cx="50%" cy="50%" innerRadius={45} outerRadius={85} dataKey="value"
                  label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {sales.byOrigin.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OperationalReport() {
  const organizationId = useOrganization();
  const now = new Date();
  const rangeFrom = startOfMonth(subMonths(now, 5)).toISOString();
  const rangeTo = endOfMonth(now).toISOString();
  const tasks = useTasksReport(organizationId, rangeFrom, rangeTo);
  const series = useMemo(() => {
    if (!organizationId) return [];
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(new Date(), 5 - i));
    const rows = tasks.data ?? [];
    return months.map((d) => {
      const from = startOfMonth(d).toISOString();
      const to = endOfMonth(d).toISOString();
      const inMonth = rows.filter((t) => {
        const ts = t.created_at ?? "";
        return ts >= from && ts <= to;
      });
      const total = inMonth.length;
      const completed = inMonth.filter((t) => t.status === "concluida").length;
      return { month: fmtDate(d, "LLL"), tasks: total, completed };
    });
  }, [organizationId, tasks.data]);
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Tarefas: Criadas vs Concluídas</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="tasks" name="Criadas" stroke="hsl(265 62% 46%)" strokeWidth={2} />
              <Line type="monotone" dataKey="completed" name="Concluídas" stroke="hsl(152 60% 42%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI icon={FileText} label="Total tarefas (período)" value={series.reduce((s, d) => s + d.tasks, 0).toString()} accent="text-primary" />
        <KPI icon={Target} label="Concluídas" value={series.reduce((s, d) => s + d.completed, 0).toString()} accent="text-emerald-600" />
        <KPI icon={Users} label="Colaboradores ativos" value="—" accent="text-info" />
      </div>
    </div>
  );
}

function GoalsReport() {
  const organizationId = useOrganization();
  const goalsQuery = useGoals(organizationId);
  const goals = useMemo(() => {
    const rows = goalsQuery.data ?? [];
    return [...rows]
      .sort((a, b) => String(b.period_start ?? "").localeCompare(String(a.period_start ?? "")))
      .slice(0, 8)
      .map((g) => ({
        name: g.title,
        achieved: Number(g.current_value ?? 0),
        target: Number(g.target_value ?? 0),
      }));
  }, [goalsQuery.data]);
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Progresso das Metas</h3>
          <div className="space-y-4">
            {goals.map((g) => {
              const pctAchieved = Math.min((g.achieved / g.target) * 100, 100);
              const isGood = g.achieved >= g.target * 0.8;
              return (
                <div key={g.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-foreground">{g.name}</span>
                    <span className="text-muted-foreground">{g.achieved} / {g.target} ({pctAchieved.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pctAchieved}%`,
                        background: isGood ? "hsl(152 60% 42%)" : "hsl(38 92% 50%)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Comparativo de Metas</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={goals} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="name" fontSize={12} width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="achieved" name="Alcançado" fill="hsl(265 62% 46%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="target" name="Meta" fill="hsl(220 20% 90%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function ClientsCampaignsReport() {
  const iso = (d: Date) => fmtDate(d, "yyyy-MM-dd");
  const [preset, setPreset] = useState("month");
  const [customFrom, setCustomFrom] = useState(iso(startOfMonth(new Date())));
  const [customTo, setCustomTo]     = useState(iso(endOfMonth(new Date())));
  const [clientFilter, setClientFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");

  const range = useMemo(() => {
    const now = new Date();
    if (preset === "7d")    return { from: iso(subDays(now, 6)),                    to: iso(now) };
    if (preset === "month") return { from: iso(startOfMonth(now)),                  to: iso(endOfMonth(now)) };
    if (preset === "90d")   return { from: iso(subDays(now, 89)),                   to: iso(now) };
    if (preset === "custom") return { from: customFrom, to: customTo };
    return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
  }, [preset, customFrom, customTo]);

  const { summaries, totals, byClient, byPlatform, isLoading } = useAllClientsCampaigns(range);

  const fmt  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtK = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  const pct  = (v: number) => `${v.toFixed(2)}%`;

  const clients = useMemo(() => Array.from(new Set(summaries.map(s => s.client_id))).map(id => ({
    id, name: summaries.find(s => s.client_id === id)?.client_name ?? id,
  })), [summaries]);

  const platforms = useMemo(() => Array.from(new Set(summaries.map(s => s.platform))).sort(), [summaries]);

  const filtered = useMemo(() => summaries.filter(s => {
    if (clientFilter !== "all" && s.client_id !== clientFilter) return false;
    if (platformFilter !== "all" && s.platform !== platformFilter) return false;
    return true;
  }), [summaries, clientFilter, platformFilter]);

  const ctr  = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc  = totals.clicks      > 0 ? totals.spend / totals.clicks : 0;
  const cpl  = totals.leads       > 0 ? totals.spend / totals.leads : 0;
  const roas = totals.spend       > 0 ? totals.revenue / totals.spend : 0;

  const COLORS = ["hsl(265 62% 46%)", "hsl(210 80% 52%)", "hsl(152 60% 42%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)"];

  return (
    <div className="space-y-6 mt-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} max={customTo}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
                <span className="text-muted-foreground text-sm">até</span>
                <input type="date" value={customTo} min={customFrom}
                  onChange={e => setCustomTo(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            )}
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Carregando dados de campanhas...
        </div>
      ) : summaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-muted-foreground border-2 border-dashed rounded-xl">
          <Megaphone className="h-8 w-8 opacity-30" />
          <p className="font-medium">Nenhum dado de campanha encontrado</p>
          <p className="text-sm">Configure as integrações de Meta/Google Ads nos cadastros dos clientes e aguarde a sincronização.</p>
        </div>
      ) : (
        <>
          {/* KPIs consolidados */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KPI icon={DollarSign}        label="Investimento total"  value={fmt(totals.spend)} />
            <KPI icon={TrendingUp}        label="Receita total"       value={fmt(totals.revenue)} />
            <KPI icon={TrendingUp}        label="ROAS médio"          value={`${roas.toFixed(2)}x`} />
            <KPI icon={Eye}               label="Impressões"          value={fmtK(totals.impressions)} />
            <KPI icon={MousePointerClick} label="Cliques"             value={fmtK(totals.clicks)} />
            <KPI icon={ArrowRightLeft}    label="CTR médio"           value={pct(ctr)} />
            <KPI icon={DollarSign}        label="CPC médio"           value={fmt(cpc)} />
            <KPI icon={Users}             label="Leads"               value={fmtK(totals.leads)} />
            <KPI icon={Target}            label="CPL médio"           value={fmt(cpl)} />
            <KPI icon={Users}             label="Clientes com dados"  value={String(byClient.length)} />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Investimento por cliente */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Investimento por Cliente</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byClient.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
                    <XAxis type="number" fontSize={11} tickFormatter={v => fmt(v)} />
                    <YAxis type="category" dataKey="client_name" fontSize={11} width={120} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="spend" name="Investimento" fill="hsl(265 62% 46%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Distribuição por plataforma */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Investimento por Plataforma</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={byPlatform} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byPlatform.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Ranking de clientes */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4">Ranking de Clientes por Investimento</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Investimento</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byClient.map((c, i) => (
                    <TableRow key={c.client_name}>
                      <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.client_name}</TableCell>
                      <TableCell className="text-right">{fmt(c.spend)}</TableCell>
                      <TableCell className="text-right">{fmt(c.revenue)}</TableCell>
                      <TableCell className="text-right">
                        <span className={c.roas >= 2 ? "text-emerald-600 font-bold" : c.roas >= 1 ? "text-amber-600" : "text-red-500"}>
                          {c.roas.toFixed(2)}x
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{fmtK(c.leads)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Tabela detalhada de campanhas */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-4">
                Campanhas Detalhadas
                <span className="ml-2 text-xs text-muted-foreground font-normal">({filtered.length} campanhas)</span>
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead className="text-right">Investimento</TableHead>
                      <TableHead className="text-right">Impressões</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">CPL</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 50).map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{s.client_name}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{s.campaign_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.platform}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmt(s.spend)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtK(s.impressions)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtK(s.clicks)}</TableCell>
                        <TableCell className="text-right text-sm">{pct(s.ctr)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(s.cpc)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtK(s.leads)}</TableCell>
                        <TableCell className="text-right text-sm">{s.leads > 0 ? fmt(s.cpl) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(s.revenue)}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={s.roas >= 2 ? "text-emerald-600 font-bold" : s.roas >= 1 ? "text-amber-600" : s.spend > 0 ? "text-red-500" : "text-muted-foreground"}>
                            {s.spend > 0 ? `${s.roas.toFixed(2)}x` : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filtered.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Exibindo 50 de {filtered.length} campanhas. Use os filtros para refinar.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <div className="stat-card flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className={`h-5 w-5 ${accent || "text-primary"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

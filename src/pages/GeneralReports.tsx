import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, TrendingUp, Users, Target, FileText, Download, Filter } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { usePayments, useSupplierExpenses } from "@/hooks/useFinancial";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import { useGoals } from "@/hooks/useGoalsCRUD";
import { useTasksReport } from "@/hooks/useProjects";
import { endOfMonth, startOfMonth, subMonths, format as fmtDate } from "date-fns";

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

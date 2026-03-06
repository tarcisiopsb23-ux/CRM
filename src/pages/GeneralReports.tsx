import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, TrendingUp, Users, Target, FileText, Download, Filter } from "lucide-react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = ["hsl(265 62% 46%)", "hsl(210 80% 52%)", "hsl(152 60% 42%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)"];

/* ── Mock data ─────────────────────────────────────────────── */
const FINANCIAL_DATA = [
  { month: "Set", receitas: 85000, despesas: 42000, lucro: 43000 },
  { month: "Out", receitas: 98000, despesas: 48000, lucro: 50000 },
  { month: "Nov", receitas: 210000, despesas: 65000, lucro: 145000 },
  { month: "Dez", receitas: 125000, despesas: 55000, lucro: 70000 },
  { month: "Jan", receitas: 142000, despesas: 60000, lucro: 82000 },
  { month: "Fev", receitas: 157000, despesas: 62000, lucro: 95000 },
];

const SALES_BY_ORIGIN = [
  { name: "Google Ads", value: 42 },
  { name: "Facebook Ads", value: 28 },
  { name: "Indicação", value: 18 },
  { name: "Orgânico", value: 8 },
  { name: "Outros", value: 4 },
];

const SALES_TABLE = [
  { id: 1, client: "Empresa Alpha", service: "Gestão de Tráfego", value: 4500, status: "Fechado", origin: "Google Ads", responsible: "Ana Silva", date: "2026-02-01" },
  { id: 2, client: "Beta Corp", service: "Social Media", value: 3200, status: "Fechado", origin: "Facebook Ads", responsible: "Bruno Oliveira", date: "2026-02-03" },
  { id: 3, client: "Gamma Tech", service: "Desenvolvimento", value: 12000, status: "Em andamento", origin: "Indicação", responsible: "Carla Mendes", date: "2026-02-05" },
  { id: 4, client: "Delta Solutions", service: "SEO", value: 2800, status: "Fechado", origin: "Orgânico", responsible: "Diego Costa", date: "2026-02-07" },
  { id: 5, client: "Epsilon Ltda", service: "Gestão de Tráfego", value: 5500, status: "Cancelado", origin: "Google Ads", responsible: "Ana Silva", date: "2026-02-08" },
  { id: 6, client: "Zeta Inc", service: "Consultoria", value: 8000, status: "Fechado", origin: "Facebook Ads", responsible: "Bruno Oliveira", date: "2026-02-10" },
];

const GOALS_DATA = [
  { name: "Contratos fechados", achieved: 40, target: 50 },
  { name: "Receita (R$ mil)", achieved: 157, target: 200 },
  { name: "Leads gerados", achieved: 520, target: 600 },
  { name: "Inadimplência (%)", achieved: 3.2, target: 5 },
];

const OPS_DATA = [
  { month: "Set", tasks: 120, completed: 95 },
  { month: "Out", tasks: 140, completed: 118 },
  { month: "Nov", tasks: 180, completed: 160 },
  { month: "Dez", tasks: 150, completed: 130 },
  { month: "Jan", tasks: 165, completed: 148 },
  { month: "Fev", tasks: 175, completed: 155 },
];

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
  const totalReceitas = FINANCIAL_DATA.reduce((s, d) => s + d.receitas, 0);
  const totalDespesas = FINANCIAL_DATA.reduce((s, d) => s + d.despesas, 0);
  const totalLucro = FINANCIAL_DATA.reduce((s, d) => s + d.lucro, 0);

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
            <BarChart data={FINANCIAL_DATA}>
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
        </CardContent>
      </Card>
    </div>
  );
}

function SalesReport() {
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
                {SALES_TABLE.map((s) => (
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
                <Pie data={SALES_BY_ORIGIN} cx="50%" cy="50%" innerRadius={45} outerRadius={85} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {SALES_BY_ORIGIN.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
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
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Tarefas: Criadas vs Concluídas</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={OPS_DATA}>
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
        <KPI icon={FileText} label="Total tarefas (período)" value="930" accent="text-primary" />
        <KPI icon={Target} label="Concluídas" value="806 (86.7%)" accent="text-emerald-600" />
        <KPI icon={Users} label="Colaboradores ativos" value="6" accent="text-info" />
      </div>
    </div>
  );
}

function GoalsReport() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Progresso das Metas</h3>
          <div className="space-y-4">
            {GOALS_DATA.map((g) => {
              const pctAchieved = Math.min((g.achieved / g.target) * 100, 100);
              const isGood = g.name.includes("Inadimplência") ? g.achieved <= g.target : g.achieved >= g.target * 0.8;
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
            <BarChart data={GOALS_DATA} layout="vertical">
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

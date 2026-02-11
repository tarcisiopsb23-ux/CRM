import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, MousePointerClick, Users, TrendingUp, Target, Eye, ArrowRightLeft, Megaphone, Filter } from "lucide-react";

/* ── Mock data ─────────────────────────────────────────────── */
const PLATFORMS = ["Google Ads", "Facebook Ads"];
const ACCOUNTS = ["Conta Principal", "Conta Secundária"];
const STATUSES = ["Ativa", "Pausada", "Encerrada"];

interface Campaign {
  id: string;
  name: string;
  platform: string;
  account: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  meetings: number;
  contracts: number;
  revenue: number;
}

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "c1", name: "Campanha Verão 2026", platform: "Google Ads", account: "Conta Principal", status: "Ativa", spend: 12500, impressions: 450000, clicks: 8200, leads: 320, qualified: 180, meetings: 45, contracts: 18, revenue: 95000 },
  { id: "c2", name: "Remarketing Clientes", platform: "Facebook Ads", account: "Conta Principal", status: "Ativa", spend: 6800, impressions: 280000, clicks: 5100, leads: 210, qualified: 120, meetings: 28, contracts: 12, revenue: 62000 },
  { id: "c3", name: "Captação B2B", platform: "Google Ads", account: "Conta Secundária", status: "Ativa", spend: 18200, impressions: 620000, clicks: 11400, leads: 480, qualified: 260, meetings: 62, contracts: 25, revenue: 142000 },
  { id: "c4", name: "Awareness Brand", platform: "Facebook Ads", account: "Conta Secundária", status: "Pausada", spend: 4500, impressions: 890000, clicks: 3200, leads: 95, qualified: 40, meetings: 8, contracts: 3, revenue: 15000 },
  { id: "c5", name: "Promo Black Friday", platform: "Google Ads", account: "Conta Principal", status: "Encerrada", spend: 22000, impressions: 780000, clicks: 15600, leads: 620, qualified: 350, meetings: 88, contracts: 40, revenue: 210000 },
  { id: "c6", name: "Lead Gen Educação", platform: "Facebook Ads", account: "Conta Principal", status: "Ativa", spend: 9300, impressions: 340000, clicks: 6800, leads: 290, qualified: 160, meetings: 38, contracts: 15, revenue: 78000 },
];

const TREND_DATA = [
  { month: "Set", spend: 8000, leads: 180, revenue: 42000 },
  { month: "Out", spend: 12000, leads: 310, revenue: 68000 },
  { month: "Nov", spend: 22000, leads: 620, revenue: 210000 },
  { month: "Dez", spend: 15000, leads: 420, revenue: 125000 },
  { month: "Jan", spend: 18000, leads: 480, revenue: 142000 },
  { month: "Fev", spend: 19500, leads: 520, revenue: 157000 },
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
const pct = (v: number) => `${v.toFixed(2)}%`;

const COLORS = ["hsl(265 62% 46%)", "hsl(210 80% 52%)", "hsl(152 60% 42%)", "hsl(38 92% 50%)", "hsl(0 84% 60%)", "hsl(280 70% 55%)"];

export default function CampaignReports() {
  const [platform, setPlatform] = useState("all");
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return MOCK_CAMPAIGNS.filter((c) => {
      if (platform !== "all" && c.platform !== platform) return false;
      if (account !== "all" && c.account !== account) return false;
      if (status !== "all" && c.status !== status) return false;
      return true;
    });
  }, [platform, account, status]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        leads: acc.leads + c.leads,
        qualified: acc.qualified + c.qualified,
        meetings: acc.meetings + c.meetings,
        contracts: acc.contracts + c.contracts,
        revenue: acc.revenue + c.revenue,
      }),
      { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, meetings: 0, contracts: 0, revenue: 0 }
    );
  }, [filtered]);

  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const roi = totals.spend > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : 0;

  const funnelData = [
    { name: "Impressões", value: totals.impressions },
    { name: "Cliques", value: totals.clicks },
    { name: "Leads", value: totals.leads },
    { name: "Qualificados", value: totals.qualified },
    { name: "Reuniões", value: totals.meetings },
    { name: "Contratos", value: totals.contracts },
  ];

  const platformPie = PLATFORMS.map((p) => ({
    name: p,
    value: filtered.filter((c) => c.platform === p).reduce((s, c) => s + c.spend, 0),
  })).filter((p) => p.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Relatório de Campanhas</h1>
        <p className="text-sm text-muted-foreground mt-1">Google Ads & Facebook Ads — visão executiva de performance.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas plataformas</SelectItem>
                {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas contas</SelectItem>
                {ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPI icon={DollarSign} label="Investimento" value={fmt(totals.spend)} />
        <KPI icon={MousePointerClick} label="CPC" value={fmt(cpc)} />
        <KPI icon={Eye} label="CPM" value={fmt(cpm)} />
        <KPI icon={ArrowRightLeft} label="CTR" value={pct(ctr)} />
        <KPI icon={Users} label="Leads" value={fmtK(totals.leads)} />
        <KPI icon={Target} label="CPL" value={fmt(cpl)} />
        <KPI icon={Users} label="Qualificados" value={String(totals.qualified)} />
        <KPI icon={Megaphone} label="Reuniões" value={String(totals.meetings)} />
        <KPI icon={Target} label="Contratos" value={String(totals.contracts)} />
        <KPI icon={DollarSign} label="Receita" value={fmt(totals.revenue)} />
        <KPI icon={TrendingUp} label="ROAS" value={`${roas.toFixed(2)}x`} />
        <KPI icon={TrendingUp} label="ROI" value={pct(roi)} />
      </div>

      {/* Funnel */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Funil de Conversão</h3>
          {/* Header */}
          <div className="flex items-center gap-3 mb-2 px-1">
            <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0 text-right">Etapa</span>
            <span className="flex-1 text-[10px] font-semibold text-muted-foreground text-center">Volume</span>
            <span className="text-[10px] font-semibold text-muted-foreground w-20 shrink-0 text-center">% Etapa anterior</span>
            <span className="text-[10px] font-semibold text-muted-foreground w-20 shrink-0 text-center">% s/ Cliques</span>
            <span className="text-[10px] font-semibold text-muted-foreground w-20 shrink-0 text-center">% s/ Impressões</span>
          </div>
          <div className="space-y-2">
            {funnelData.map((item, i) => {
              const widthPct = funnelData[0].value > 0 ? Math.max(10, (item.value / funnelData[0].value) * 100) : 10;
              // % relative to previous stage
              const prevRate = i > 0 && funnelData[i - 1].value > 0
                ? ((item.value / funnelData[i - 1].value) * 100).toFixed(1) + "%"
                : "—";
              // % relative to clicks (index 1) — clicks itself shows % of impressions
              const clicksVal = funnelData[1]?.value || 0;
              const pctClicks = i === 0
                ? "—"
                : i === 1 && funnelData[0].value > 0
                  ? ((item.value / funnelData[0].value) * 100).toFixed(2) + "%"
                  : clicksVal > 0
                    ? ((item.value / clicksVal) * 100).toFixed(2) + "%"
                    : "—";
              // % relative to impressions (index 0)
              const pctImpressions = funnelData[0].value > 0
                ? ((item.value / funnelData[0].value) * 100).toFixed(2) + "%"
                : "—";
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">{item.name}</span>
                  <div className="flex-1 h-8 rounded-lg overflow-hidden bg-muted/30">
                    <div
                      className="h-full rounded-lg flex items-center justify-center text-xs font-medium text-primary-foreground"
                      style={{ width: `${widthPct}%`, background: COLORS[i % COLORS.length] }}
                    >
                      {item.value.toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-20 shrink-0 text-center">{prevRate}</span>
                  <span className="text-xs text-muted-foreground w-20 shrink-0 text-center">{pctClicks}</span>
                  <span className="text-xs text-muted-foreground w-20 shrink-0 text-center">{pctImpressions}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h3 className="font-display font-semibold text-foreground mb-4">Investimento vs Leads</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={TREND_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis yAxisId="left" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" fontSize={12} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="spend" name="Investimento (R$)" stroke="hsl(265 62% 46%)" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="hsl(210 80% 52%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="font-display font-semibold text-foreground mb-4">Distribuição por Plataforma</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={platformPie} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {platformPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue vs Spend */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Receita vs Investimento</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={TREND_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 90%)" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="spend" name="Investimento" fill="hsl(265 62% 46%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenue" name="Receita" fill="hsl(152 60% 42%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Campaign table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead className="text-right">Investimento</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">Contratos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-sm">{c.name}</TableCell>
                  <TableCell><Badge variant="secondary">{c.platform}</Badge></TableCell>
                  <TableCell className="text-right text-sm">{fmt(c.spend)}</TableCell>
                  <TableCell className="text-right text-sm">{c.clicks.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right text-sm">{c.leads}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(c.leads > 0 ? c.spend / c.leads : 0)}</TableCell>
                  <TableCell className="text-right text-sm">{c.contracts}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(c.revenue)}</TableCell>
                  <TableCell className="text-right text-sm font-bold">{c.spend > 0 ? (c.revenue / c.spend).toFixed(2) + "x" : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "Ativa" ? "default" : "outline"}
                      className={c.status === "Ativa" ? "bg-emerald-600" : c.status === "Pausada" ? "bg-amber-500 text-white" : ""}>
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="stat-card flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

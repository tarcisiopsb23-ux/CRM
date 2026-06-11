import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";
import { useContractMetrics } from "@/hooks/useContractMetrics";
import { useClients } from "@/hooks/useClients";
import { useTeams } from "@/hooks/useTeams";
import { useLeadsKanban } from "@/hooks/useLeadsKanban";
import {
  getPeriodDateRange,
  isDateInRange,
  PeriodOption,
  PERIOD_LABELS,
} from "@/lib/periodHelpers";
import PeriodSelector from "@/components/filters/PeriodSelector";
import {
  SalesMetricCard,
  PipelineFunnel,
  ConversionTable,
  RevenueChart,
  LeadsByStageChart,
  LeadsByMonthChart,
  StagePerformanceTable,
} from "@/components/analytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Users,
  DollarSign,
  TrendingUp,
  Target,
  RotateCw,
  PauseCircle,
  Calendar,
  Trophy,
  Award,
  Search,
  ExternalLink
} from "lucide-react";

export function SalesDashboardPage() {
  const navigate = useNavigate();
  const organizationId = useOrganization();
  const [period, setPeriod] = useState<PeriodOption | 'custom'>("mes_atual");
  const [filterPortfolioId, setFilterPortfolioId] = useState<string>("all");
  const [selectedRange, setSelectedRange] = useState(() => getPeriodDateRange("mes_atual"));

  const analytics = useSalesAnalytics(organizationId, { range: selectedRange });
  const contractMetrics = useContractMetrics(organizationId, { range: selectedRange });
  const clientsQuery = useClients(organizationId);
  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const { data: teams = [] } = useTeams(organizationId);
  const { leads = [] } = useLeadsKanban(organizationId, { includeConverted: true });

  const portfolios = useMemo(() => teams.filter(t => t.is_portfolio && t.type === 'comercial'), [teams]);

  // Filtered Data based on Portfolio
  const filteredClients = useMemo(() => {
    if (filterPortfolioId === "all") return clients;
    return clients.filter(c => (c as any).portfolio_team_id === filterPortfolioId);
  }, [clients, filterPortfolioId]);

  // Ranking de Vendedores
  const sellerRanking = useMemo(() => {
    const sellers: Record<string, { name: string, contracts: number, revenue: number }> = {};
    filteredClients.forEach((client: any) => {
      if (client.lead_id) {
        const lead = leads.find(l => l.id === client.lead_id);
        const sellerId = lead?.assigned_to;
        const sellerName = lead?.assigned_to_name || "Sem atribuição";
        if (sellerId) {
          if (!sellers[sellerId]) sellers[sellerId] = { name: sellerName, contracts: 0, revenue: 0 };
          sellers[sellerId].contracts += 1;
          sellers[sellerId].revenue += Number(client.revenue || 0);
        }
      }
    });
    return Object.values(sellers).sort((a, b) => b.revenue - a.revenue);
  }, [filteredClients, leads]);

  // Ranking de Carteiras
  const portfolioRanking = useMemo(() => {
    const rankings: Record<string, { name: string, revenue: number, contracts: number }> = {};
    clients.forEach((client: any) => {
      if (client.portfolio_team_id) {
        const team = teams.find(t => t.id === client.portfolio_team_id);
        if (team) {
          if (!rankings[team.id]) rankings[team.id] = { name: team.name, revenue: 0, contracts: 0 };
          rankings[team.id].revenue += Number(client.revenue || 0);
          rankings[team.id].contracts += 1;
        }
      }
    });
    return Object.values(rankings).sort((a, b) => b.revenue - a.revenue);
  }, [clients, teams]);

  const [contractsModal, setContractsModal] = useState<null | "suspended_month" | "reactivated_month" | "overdue" | "recovered_month">(null);
  const [contractsSearch, setContractsSearch] = useState("");

  const clientNameById = useMemo(() => {
    const m = new Map<string, { name: string; email?: string | null }>();
    for (const c of clients) {
      m.set(String(c.id), {
        name: String(c.company || c.name || "Cliente"),
        email: (c as { email?: string | null }).email ?? null,
      });
    }
    return m;
  }, [clients]);

  const formatMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const openClient = (clientId: string) => {
    setContractsModal(null);
    navigate(`/clients?view=${encodeURIComponent(clientId)}`);
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const suspendedMonthClients = useMemo(() => {
    const ids = new Set(contractMetrics.suspendedClientIdsMonth);
    const list = clients.filter((c) => ids.has(String(c.id)));
    list.sort((a, b) => String(a.company || a.name).localeCompare(String(b.company || b.name)));
    return list;
  }, [clients, contractMetrics.suspendedClientIdsMonth]);

  const reactivatedMonthClients = useMemo(() => {
    const ids = new Set<string>();
    for (const c of contractMetrics.contractsQuery.data ?? []) {
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      const v = meta.reactivated_at;
      if (typeof v !== "string") continue;
      if (!isDateInRange(v, selectedRange)) continue;
      ids.add(String(c.client_id));
    }
    const list = clients.filter((c) => ids.has(String(c.id)));
    list.sort((a, b) => String(a.company || a.name).localeCompare(String(b.company || b.name)));
    return list;
  }, [clients, contractMetrics.contractsQuery.data, selectedRange]);

  const overdueSummary = useMemo(() => {
    const byClient = new Map<string, { clientId: string; count: number; total: number }>();
    for (const p of contractMetrics.paymentsQuery.data ?? []) {
      const st = String(p.status ?? "");
      const isUnpaid = !p.paid_at && st !== "pago" && st !== "cancelado";
      if (!isUnpaid) continue;
      const due = new Date(p.due_date);
      if (Number.isNaN(due.getTime())) continue;
      if (due >= today) continue;
      const clientId = String(p.client_id ?? "");
      const cur = byClient.get(clientId) ?? { clientId, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(p.value ?? 0);
      byClient.set(clientId, cur);
    }
    const list = Array.from(byClient.values()).sort((a, b) => b.total - a.total);
    return list;
  }, [contractMetrics.paymentsQuery.data, today]);

  const overdueOver30Contracts = useMemo(() => {
    const contractById = new Map<string, { id: string; client_id: string }>();
    for (const c of contractMetrics.contractsQuery.data ?? []) {
      contractById.set(String(c.id), { id: String(c.id), client_id: String(c.client_id) });
    }
    const list = (contractMetrics.overdueOver30ContractIds ?? []).map((id) => {
      const row = contractById.get(String(id));
      const clientId = row?.client_id ?? "";
      return {
        id: String(id),
        clientId,
        clientName: clientNameById.get(clientId)?.name ?? "Cliente",
      };
    });
    list.sort((a, b) => a.clientName.localeCompare(b.clientName));
    return list;
  }, [clientNameById, contractMetrics.contractsQuery.data, contractMetrics.overdueOver30ContractIds]);

  const recoveredMonthSummary = useMemo(() => {
    const byClient = new Map<string, { clientId: string; count: number; total: number }>();
    for (const p of contractMetrics.paymentsQuery.data ?? []) {
      if (!p.paid_at) continue;
      if (!isDateInRange(p.paid_at, selectedRange)) continue;
      const due = new Date(p.due_date);
      if (Number.isNaN(due.getTime())) continue;
      if (due >= selectedRange.from) continue;
      const clientId = String(p.client_id ?? "");
      const cur = byClient.get(clientId) ?? { clientId, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(p.value ?? 0);
      byClient.set(clientId, cur);
    }
    const list = Array.from(byClient.values()).sort((a, b) => b.total - a.total);
    return list;
  }, [contractMetrics.paymentsQuery.data, selectedRange]);

  const contractsSearchKey = useMemo(() => contractsSearch.trim().toLowerCase(), [contractsSearch]);

  const suspendedMonthClientsFiltered = useMemo(() => {
    if (!contractsSearchKey) return suspendedMonthClients;
    return suspendedMonthClients.filter((c) => {
      const name = String(c.company || c.name || "").toLowerCase();
      const email = String((c as { email?: string | null }).email || "").toLowerCase();
      return name.includes(contractsSearchKey) || email.includes(contractsSearchKey);
    });
  }, [contractsSearchKey, suspendedMonthClients]);

  const reactivatedMonthClientsFiltered = useMemo(() => {
    if (!contractsSearchKey) return reactivatedMonthClients;
    return reactivatedMonthClients.filter((c) => {
      const name = String(c.company || c.name || "").toLowerCase();
      const email = String((c as { email?: string | null }).email || "").toLowerCase();
      return name.includes(contractsSearchKey) || email.includes(contractsSearchKey);
    });
  }, [contractsSearchKey, reactivatedMonthClients]);

  const overdueOver30ContractsFiltered = useMemo(() => {
    if (!contractsSearchKey) return overdueOver30Contracts;
    return overdueOver30Contracts.filter((r) => {
      return String(r.clientName).toLowerCase().includes(contractsSearchKey) || String(r.id).toLowerCase().includes(contractsSearchKey);
    });
  }, [contractsSearchKey, overdueOver30Contracts]);

  const overdueSummaryFiltered = useMemo(() => {
    if (!contractsSearchKey) return overdueSummary;
    return overdueSummary.filter((r) => {
      const name = clientNameById.get(r.clientId)?.name ?? "";
      const email = clientNameById.get(r.clientId)?.email ?? "";
      return String(name).toLowerCase().includes(contractsSearchKey) || String(email).toLowerCase().includes(contractsSearchKey);
    });
  }, [clientNameById, contractsSearchKey, overdueSummary]);

  const recoveredMonthSummaryFiltered = useMemo(() => {
    if (!contractsSearchKey) return recoveredMonthSummary;
    return recoveredMonthSummary.filter((r) => {
      const name = clientNameById.get(r.clientId)?.name ?? "";
      const email = clientNameById.get(r.clientId)?.email ?? "";
      return String(name).toLowerCase().includes(contractsSearchKey) || String(email).toLowerCase().includes(contractsSearchKey);
    });
  }, [clientNameById, contractsSearchKey, recoveredMonthSummary]);

  const LOST_REASON_LABELS: Record<string, string> = {
    capacidade_produtiva: "Capacidade produtiva",
    orcamento: "Orçamento",
    desqualificado: "Desqualificado",
    barrado_pelo_sa: "Barrado pelo(a) SA",
    sem_contato: "Sem contato",
    limite_da_franquia: "Limite da franquia",
    concorrencia: "Concorrência",
    perda_de_contato: "Perda de contato",
    cadencia_excedida: "Cadência excedida",
    outros: "Outros",
  };

  const conversionRate =
    analytics.totalLeads > 0
      ? ((analytics.wonLeads + analytics.lostLeads) > 0
          ? (analytics.wonLeads / (analytics.wonLeads + analytics.lostLeads)) *
            100
          : 0)
      : 0;

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">
          Nenhuma organização encontrada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Analytics de Vendas
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do pipeline, receita e conversões
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPortfolioId} onValueChange={setFilterPortfolioId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todas as carteiras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as carteiras</SelectItem>
              {portfolios.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <PeriodSelector
            initialPreset={period as PeriodOption}
            onChange={(range, preset) => {
              setSelectedRange(range);
              setPeriod(preset as PeriodOption | 'custom');
            }}
          />
        </div>
      </div>

      {/* Rankings Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Top Vendedores</CardTitle>
            </div>
            <CardDescription className="text-[10px]">Maiores faturamentos e volume de contratos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sellerRanking.slice(0, 5).map((seller, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">{seller.name}</p>
                      <p className="text-[10px] text-slate-500">{seller.contracts} contratos fechados</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-emerald-600">R$ {seller.revenue.toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
              {sellerRanking.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-4">Sem dados de vendas.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm ring-1 ring-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Ranking de Carteiras</CardTitle>
            </div>
            <CardDescription className="text-[10px]">Desempenho por equipe comercial</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {portfolioRanking.slice(0, 5).map((portfolio, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-slate-800">{portfolio.name}</p>
                      <p className="text-[10px] text-slate-500">{portfolio.contracts} contratos</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-indigo-600">R$ {portfolio.revenue.toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
              {portfolioRanking.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-4">Sem dados de carteiras.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SalesMetricCard
          title="Total de Leads"
          value={analytics.totalLeads}
          subtitle={`${analytics.monthlyLeads} criados este mês`}
          icon={Users}
          loading={analytics.loading}
        />
        <SalesMetricCard
          title="Valor do Pipeline"
          value={analytics.pipelineValue}
          subtitle="Receita potencial (leads abertos)"
          icon={DollarSign}
          variant="default"
          format="currency"
          loading={analytics.loading}
        />
        <SalesMetricCard
          title="Receita Fechada"
          value={analytics.closedRevenue}
          format="currency"
          subtitle={`${analytics.wonLeads} ganhos · ${analytics.lostLeads} perdidos`}
          icon={TrendingUp}
          variant="success"
          loading={analytics.loading}
        />
        <SalesMetricCard
          title="Taxa de Conversão"
          value={`${conversionRate.toFixed(1)}%`}
          subtitle="Ganhos / (Ganhos + Perdidos)"
          icon={Target}
          variant="success"
          loading={analytics.loading}
        />
        <SalesMetricCard
          title="Leads Desqualificados"
          value={analytics.disqualifiedLeads}
          subtitle="Etapa: Desqualificado"
          icon={AlertTriangle}
          variant="danger"
          loading={analytics.loading}
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4">Contratos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            className="text-left hover:opacity-90 transition-opacity disabled:opacity-60"
            onClick={() => setContractsModal("suspended_month")}
            disabled={contractMetrics.loading || suspendedMonthClients.length === 0}
          >
            <SalesMetricCard
              title="Contratos Suspensos"
              value={contractMetrics.suspendedTotal}
              subtitle={`${contractMetrics.suspendedMonth} suspensos no período`}
              icon={PauseCircle}
              variant="warning"
              loading={contractMetrics.loading}
            />
          </button>
          <button
            type="button"
            className="text-left hover:opacity-90 transition-opacity disabled:opacity-60"
            onClick={() => setContractsModal("reactivated_month")}
            disabled={contractMetrics.loading || reactivatedMonthClients.length === 0}
          >
            <SalesMetricCard
              title="Contratos Reativados"
              value={contractMetrics.reactivatedMonth}
              subtitle={
                contractMetrics.reactivatedVsSuspendedPercent === null
                  ? `${contractMetrics.suspendedTotal} suspensos no total`
                  : `${contractMetrics.reactivatedVsSuspendedPercent.toFixed(1)}% vs ${contractMetrics.suspendedTotal} suspensos`
              }
              icon={RotateCw}
              variant="success"
              loading={contractMetrics.loading}
            />
          </button>
          <button
            type="button"
            className="text-left hover:opacity-90 transition-opacity disabled:opacity-60"
            onClick={() => setContractsModal("overdue")}
            disabled={contractMetrics.loading || overdueSummary.length === 0}
          >
            <SalesMetricCard
              title="Inadimplência (Total)"
              value={contractMetrics.overdueTotalValue}
              subtitle={`>30 dias: ${(contractMetrics.overdueOver30ContractIds ?? []).length} contratos`}
              icon={AlertTriangle}
              variant="danger"
              format="currency"
              loading={contractMetrics.loading}
            />
          </button>
          <button
            type="button"
            className="text-left hover:opacity-90 transition-opacity disabled:opacity-60"
            onClick={() => setContractsModal("recovered_month")}
            disabled={contractMetrics.loading || recoveredMonthSummary.length === 0}
          >
            <SalesMetricCard
              title="Inadimplência recebida"
              value={contractMetrics.delinquencyReceivedMonthValue}
              subtitle={
                contractMetrics.delinquencyReceivedMonthPercentOfOverdue === null
                  ? "—"
                  : `${contractMetrics.delinquencyReceivedMonthPercentOfOverdue.toFixed(1)}% da inadimplência`
              }
              icon={TrendingUp}
              variant="success"
              format="currency"
              loading={contractMetrics.loading}
            />
          </button>
        </div>
      </section>

      {/* Pipeline & Conversion lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-lg font-semibold mb-4">Visão do Pipeline</h2>
          <PipelineFunnel
            data={analytics.leadsPerStage}
            loading={analytics.loading}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Taxas de Conversão</h2>
          <ConversionTable
            data={analytics.stageConversions}
            loading={analytics.loading}
          />
        </section>
      </div>

      {/* Lost Reasons & Monthly Leads lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-lg font-semibold mb-4">Motivos da Perda</h2>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Ranking de motivos</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {analytics.loading ? (
                <div className="text-muted-foreground text-sm">Carregando...</div>
              ) : analytics.lostReasons.length === 0 ? (
                <div className="text-muted-foreground text-sm">Nenhum motivo registrado.</div>
              ) : (
                (() => {
                  const max = Math.max(...analytics.lostReasons.map((x) => x.count), 1);
                  return analytics.lostReasons.slice(0, 10).map((item) => {
                    const pct = Math.round((item.count / max) * 100);
                    return (
                      <div key={item.reason} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground">
                            {LOST_REASON_LABELS[item.reason] ?? item.reason}
                          </span>
                          <span className="text-muted-foreground tabular-nums">{item.count}</span>
                        </div>
                        <div className="h-2 w-full rounded bg-muted overflow-hidden">
                          <div className="h-full bg-destructive" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Leads criados por mês</h2>
          <LeadsByMonthChart
            data={analytics.leadsByMonth}
            loading={analytics.loading}
          />
        </section>
      </div>

      {/* Revenue Metrics */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Métricas de Receita</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <RevenueChart
            data={analytics.leadsPerStage}
            loading={analytics.loading}
          />
          <div className="flex flex-col">
            <SalesMetricCard
              title="Receita Prevista"
              value={analytics.forecastRevenue}
              subtitle="Pipeline × taxa de ganho"
              format="currency"
              loading={analytics.loading}
            />
          </div>
        </div>
      </section>

      {/* Stage Performance */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Desempenho por Estágio</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StagePerformanceTable
            data={analytics.avgTimePerStage}
            avgTimeToClose={analytics.avgTimeToClose}
            loading={analytics.loading}
          />
          <LeadsByStageChart
            data={analytics.leadsPerStage}
            loading={analytics.loading}
          />
        </div>
      </section>

      <Dialog open={contractsModal !== null} onOpenChange={(open) => { if (!open) { setContractsModal(null); setContractsSearch(""); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {contractsModal === "suspended_month"
                ? "Clientes com contrato suspenso (período)"
                : contractsModal === "reactivated_month"
                  ? "Clientes com contrato reativado (período)"
                  : contractsModal === "recovered_month"
                    ? "Inadimplência recebida (período)"
                    : "Inadimplência (total)"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={contractsSearch}
              onChange={(e) => setContractsSearch(e.target.value)}
              placeholder="Buscar cliente (nome ou e-mail)"
            />
            {contractsModal === "suspended_month" ? (
              <div className="text-xs text-muted-foreground">
                {suspendedMonthClientsFiltered.length} cliente(s)
              </div>
            ) : contractsModal === "reactivated_month" ? (
              <div className="text-xs text-muted-foreground">
                {reactivatedMonthClientsFiltered.length} cliente(s)
              </div>
            ) : contractsModal === "recovered_month" ? (
              <div className="text-xs text-muted-foreground">
                {recoveredMonthSummaryFiltered.length} cliente(s) • {formatMoney(recoveredMonthSummaryFiltered.reduce((acc, x) => acc + Number(x.total ?? 0), 0))}
              </div>
            ) : contractsModal === "overdue" ? (
              <div className="text-xs text-muted-foreground">
                {overdueSummaryFiltered.length} cliente(s) • {formatMoney(overdueSummaryFiltered.reduce((acc, x) => acc + Number(x.total ?? 0), 0))}
              </div>
            ) : null}
          </div>

          {contractsModal === "suspended_month" ? (
            <div className="space-y-2">
              {suspendedMonthClientsFiltered.map((c) => (
                <div key={String(c.id)} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{String(c.company || c.name || "Cliente")}</p>
                    <p className="text-xs text-muted-foreground">{(c as { email?: string | null }).email || "—"}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => openClient(String(c.id))}>
                    Ver
                  </Button>
                </div>
              ))}
              {suspendedMonthClientsFiltered.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3">Sem resultados.</div>
              ) : null}
            </div>
          ) : null}

          {contractsModal === "reactivated_month" ? (
            <div className="space-y-2">
              {reactivatedMonthClientsFiltered.map((c) => (
                <div key={String(c.id)} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{String(c.company || c.name || "Cliente")}</p>
                    <p className="text-xs text-muted-foreground">{(c as { email?: string | null }).email || "—"}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => openClient(String(c.id))}>
                    Ver
                  </Button>
                </div>
              ))}
              {reactivatedMonthClientsFiltered.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3">Sem resultados.</div>
              ) : null}
            </div>
          ) : null}

          {contractsModal === "overdue" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Contratos com atraso &gt;30 dias</div>
                {overdueOver30ContractsFiltered.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhum contrato com atraso &gt;30 dias.</div>
                ) : (
                  <div className="space-y-2">
                    {overdueOver30ContractsFiltered.slice(0, 15).map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{r.clientName}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.id}</p>
                        </div>
                        {r.clientId ? (
                          <Button size="sm" variant="secondary" onClick={() => openClient(r.clientId)}>
                            Ver
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    {overdueOver30ContractsFiltered.length > 15 ? (
                      <div className="text-xs text-muted-foreground">Mostrando 15 de {overdueOver30ContractsFiltered.length}.</div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Clientes inadimplentes</div>
                {overdueSummaryFiltered.map((r) => {
                  const name = clientNameById.get(r.clientId)?.name ?? "Cliente";
                  const email = clientNameById.get(r.clientId)?.email ?? null;
                  return (
                    <div key={r.clientId} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">{email || `${r.count} pendência(s)`}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right font-semibold text-red-600 tabular-nums">{formatMoney(r.total)}</div>
                        <Button size="sm" variant="secondary" onClick={() => openClient(r.clientId)}>
                          Ver
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {overdueSummaryFiltered.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-3">Sem resultados.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {contractsModal === "recovered_month" ? (
            <div className="space-y-2">
              {recoveredMonthSummaryFiltered.map((r) => {
                const name = clientNameById.get(r.clientId)?.name ?? "Cliente";
                const email = clientNameById.get(r.clientId)?.email ?? null;
                return (
                  <div key={r.clientId} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">{email || `${r.count} recebimento(s)`}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right font-semibold text-emerald-600 tabular-nums">{formatMoney(r.total)}</div>
                      <Button size="sm" variant="secondary" onClick={() => openClient(r.clientId)}>
                        Ver
                      </Button>
                    </div>
                  </div>
                );
              })}
              {recoveredMonthSummaryFiltered.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3">Sem resultados.</div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setContractsModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

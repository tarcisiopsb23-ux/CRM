import { useOrganization } from "@/hooks/useOrganization";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";
import {
  SalesMetricCard,
  PipelineFunnel,
  ConversionTable,
  RevenueChart,
  LeadsByStageChart,
  LeadsByMonthChart,
  StagePerformanceTable,
} from "@/components/analytics";
import { Users, DollarSign, TrendingUp, Target } from "lucide-react";

export function SalesDashboardPage() {
  const organizationId = useOrganization();
  const analytics = useSalesAnalytics(organizationId);

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
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Analytics de Vendas
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão geral do pipeline, receita e conversões
        </p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      {/* Pipeline Overview */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Visão do Pipeline</h2>
        <PipelineFunnel
          data={analytics.leadsPerStage}
          loading={analytics.loading}
        />
      </section>

      {/* Revenue Metrics */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Métricas de Receita</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RevenueChart
            data={analytics.leadsPerStage}
            loading={analytics.loading}
          />
          <div className="space-y-4">
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

      {/* Conversion Rates */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Taxas de Conversão</h2>
        <ConversionTable
          data={analytics.conversionRates}
          loading={analytics.loading}
        />
      </section>

      {/* Stage Performance */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Desempenho por Estágio</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

      {/* Leads by month */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Leads criados por mês</h2>
        <LeadsByMonthChart
          data={analytics.leadsByMonth}
          loading={analytics.loading}
        />
      </section>
    </div>
  );
}

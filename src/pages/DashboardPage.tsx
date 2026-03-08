import { useOrganization } from "@/hooks/useOrganization";
import {
  useKanbanFunnel,
  usePendingConversations,
  useAccountsPayable,
  useAccountsReceivable,
  useDelinquency,
  useGoalsAgency,
  useGoalsTeams,
  useGoalsIndividuals,
} from "@/hooks/useDashboard";
import {
  KanbanFunnelWidget,
  StatWidget,
  PendingConversationsWidget,
  GoalsDonutWidget,
  GoalsRankingWidget,
} from "@/components/dashboard";
import { TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

export function DashboardPage() {
  const organizationId = useOrganization();

  const kanban = useKanbanFunnel(organizationId);
  const conversations = usePendingConversations(organizationId);
  const payable = useAccountsPayable(organizationId);
  const receivable = useAccountsReceivable(organizationId);
  const delinquency = useDelinquency(organizationId);
  const goalsAgency = useGoalsAgency(organizationId);
  const goalsTeams = useGoalsTeams(organizationId);
  const goalsIndividuals = useGoalsIndividuals(organizationId);

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua organização</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatWidget
          title="Contas a Pagar (mês)"
          value={payable.data?.total ?? 0}
          subtitle={`${payable.data?.count ?? 0} lançamentos pendentes`}
          icon={TrendingDown}
          variant="warning"
          loading={payable.isLoading}
        />
        <StatWidget
          title="Contas a Receber (mês)"
          value={receivable.data?.total ?? 0}
          subtitle={`${receivable.data?.count ?? 0} lançamentos pendentes`}
          icon={TrendingUp}
          variant="success"
          loading={receivable.isLoading}
        />
        <StatWidget
          title="Inadimplência"
          value={delinquency.data?.total ?? 0}
          subtitle="Pagamentos/despesas vencidos"
          icon={AlertTriangle}
          variant={delinquency.data?.total ? "danger" : "default"}
          loading={delinquency.isLoading}
        />
        <div className="sm:col-span-2">
          <PendingConversationsWidget
            count={conversations.data?.count ?? 0}
            items={
              (conversations.data?.items ?? []).map((c) => ({
                ...c,
                status: c.status ?? "aberta",
                contact: {
                  ...c.contact,
                  name: c.contact?.name ?? undefined,
                },
              }))
            }
            loading={conversations.isLoading}
          />
        </div>
      </div>

      {/* Kanban funnel */}
      <div>
        <KanbanFunnelWidget
          data={kanban.data ?? []}
          loading={kanban.isLoading}
        />
      </div>

      {/* Goals row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GoalsDonutWidget
          data={goalsAgency.data ?? []}
          loading={goalsAgency.isLoading}
        />
        <GoalsRankingWidget
          title="Metas por Equipe"
          data={goalsTeams.data ?? []}
          loading={goalsTeams.isLoading}
        />
        <GoalsRankingWidget
          title="Metas Individuais"
          data={goalsIndividuals.data ?? []}
          loading={goalsIndividuals.isLoading}
        />
      </div>
    </div>
  );
}

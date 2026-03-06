import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useRequireRole } from "@/hooks/useRequireRole";
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
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  LogOut,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Settings,
} from "lucide-react";

export function DashboardPage() {
  const { profile, signOut } = useAuth();
  const organizationId = useOrganization();
  const navigate = useNavigate();

  const kanban = useKanbanFunnel(organizationId);
  const conversations = usePendingConversations(organizationId);
  const payable = useAccountsPayable(organizationId);
  const receivable = useAccountsReceivable(organizationId);
  const delinquency = useDelinquency(organizationId);
  const goalsAgency = useGoalsAgency(organizationId);
  const goalsTeams = useGoalsTeams(organizationId);
  const goalsIndividuals = useGoalsIndividuals(organizationId);

  const canManageSettings = useRequireRole("admin");

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Nenhuma organização encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-light">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-semibold text-gray-dark">Dashboard</h1>
            </div>
            <nav className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <a href="/kanban">Kanban</a>
              </Button>
              {canManageSettings && (
                <Button variant="ghost" size="sm" asChild>
                  <a href="/settings">
                    <Settings className="h-4 w-4 mr-1" />
                    Configurações
                  </a>
                </Button>
              )}
              {profile && (
                <span className="text-sm text-gray-600">
                  {profile.full_name} <span className="text-gray-400">({profile.role})</span>
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-1" />
                Sair
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
        <div className="mb-6">
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
      </main>
    </div>
  );
}

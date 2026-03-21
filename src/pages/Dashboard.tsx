import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { GoalDonut } from "@/components/dashboard/GoalDonut";
import { TeamRanking } from "@/components/dashboard/TeamRanking";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { PendingConversations } from "@/components/dashboard/PendingConversations";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { LeadSourcesWidget } from "@/components/dashboard/LeadSourcesWidget";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do seu CRM</p>
      </div>

      <StatsRow />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FunnelChart />
        </div>
        <div>
          <GoalDonut />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FinancialSummary />
        <TeamRanking />
        <PendingConversations />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <LeadSourcesWidget />
      </div>
    </div>
  );
}

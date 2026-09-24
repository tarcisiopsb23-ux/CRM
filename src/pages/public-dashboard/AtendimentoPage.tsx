import { useSearchParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { useClientConversationKpis } from "@/hooks/useClientConversationKpis";
import { ConversationKpiDashboard } from "@/components/whatsapp/ConversationKpiDashboard";
import { useClientAuth } from "@/hooks/useClientAuth";

export function AtendimentoPage() {
  const { auth } = useClientAuth();
  const [searchParams] = useSearchParams();
  const dateRange = {
    from: searchParams.get('from') ?? format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: searchParams.get('to') ?? format(new Date(), 'yyyy-MM-dd'),
  };

  const { totals, trend, byCampaign, bySource, byAgent, isLoading, hasData } = useClientConversationKpis(
    auth?.organization_id,
    auth?.id,
    dateRange
  );

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-2 px-1">
        <MessageCircle className="h-5 w-5 text-emerald-400" />
        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Automação de Conversas</h2>
      </div>
      <ConversationKpiDashboard
        totals={totals}
        trend={trend}
        byCampaign={byCampaign}
        bySource={bySource}
        byAgent={byAgent}
        isLoading={isLoading}
        hasData={hasData}
        theme="dark"
      />
    </div>
  );
}

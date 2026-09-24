import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proposal } from "@/types/proposals";

const sb = () => supabase as unknown as SupabaseClient;

export interface DateRange { from: string; to: string }

export interface CloserRanking {
  closer_id: string;
  name: string;
  approved: number;
  totalValue: number;
}

export interface FunnelStep {
  label: string;
  count: number;
  conversionRate: number | null;
}

export interface TopProposal {
  id: string;
  title: string;
  clientName: string;
  totalViews: number;
  avgSessionSecs: number;
}

export interface ComercialDashboardData {
  created: number;
  sent: number;
  viewed: number;
  approved: number;
  conversionRate: number | null;
  totalApprovedValue: number;
  avgDaysToApproval: number | null;
  avgViewsPerProposal: number;
  funnel: FunnelStep[];
  closerRanking: CloserRanking[];
  topProposals: TopProposal[];
}

export function useComercialDashboard(organizationId: string | undefined, period?: DateRange) {
  const defaultPeriod: DateRange = {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  };
  const range = period ?? defaultPeriod;

  return useQuery({
    queryKey: ["comercial-dashboard", organizationId, range],
    queryFn: async (): Promise<ComercialDashboardData> => {
      if (!organizationId) return {
        created: 0, sent: 0, viewed: 0, approved: 0,
        conversionRate: null, totalApprovedValue: 0,
        avgDaysToApproval: null, avgViewsPerProposal: 0,
        funnel: [], closerRanking: [], topProposals: [],
      };

      const { data, error } = await sb()
        .from("proposals")
        .select("id, status, plan_value, total_views, avg_session_secs, closer_id, created_at, title")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .gte("created_at", range.from)
        .lte("created_at", range.to + "T23:59:59");
      if (error) throw error;

      const proposals = (data ?? []) as unknown as Proposal[];
      const created = proposals.length;
      const sent = proposals.filter(p => p.status !== "rascunho").length;
      const viewed = proposals.filter(p => ["visualizada", "aprovada"].includes(p.status)).length;
      const approved = proposals.filter(p => p.status === "aprovada").length;
      const conversionRate = sent > 0 ? (approved / sent) * 100 : null;
      const totalApprovedValue = proposals
        .filter(p => p.status === "aprovada")
        .reduce((s, p) => s + p.plan_value, 0);
      const avgViewsPerProposal = proposals.length > 0
        ? proposals.reduce((s, p) => s + p.total_views, 0) / proposals.length
        : 0;

      // Acceptances for avg days
      const { data: acceptances } = await sb()
        .from("proposal_acceptances")
        .select("proposal_id, accepted_at")
        .in("proposal_id", proposals.map(p => p.id));

      let avgDaysToApproval: number | null = null;
      if (acceptances && acceptances.length > 0) {
        const acc = acceptances as Array<{ proposal_id: string; accepted_at: string }>;
        const diffs = acc
          .map(a => {
            const prop = proposals.find(p => p.id === a.proposal_id);
            if (!prop) return null;
            return (new Date(a.accepted_at).getTime() - new Date(prop.created_at).getTime()) / (1000 * 60 * 60 * 24);
          })
          .filter((d): d is number => d !== null);
        avgDaysToApproval = diffs.length > 0
          ? diffs.reduce((s, d) => s + d, 0) / diffs.length
          : null;
      }

      // Funnel
      const funnelSteps = [
        { label: "Criadas", count: created },
        { label: "Enviadas", count: sent },
        { label: "Visualizadas", count: viewed },
        { label: "Aprovadas", count: approved },
      ];
      const funnel: FunnelStep[] = funnelSteps.map((step, i) => ({
        ...step,
        conversionRate: i === 0
          ? null
          : (funnelSteps[i - 1].count > 0 ? (step.count / funnelSteps[i - 1].count) * 100 : null),
      }));

      // Closer ranking
      const closerMap = new Map<string, { approved: number; totalValue: number }>();
      for (const p of proposals.filter(pp => pp.status === "aprovada" && pp.closer_id)) {
        const entry = closerMap.get(p.closer_id!) ?? { approved: 0, totalValue: 0 };
        entry.approved += 1;
        entry.totalValue += p.plan_value;
        closerMap.set(p.closer_id!, entry);
      }
      const closerRanking: CloserRanking[] = [...closerMap.entries()]
        .map(([closer_id, v]) => ({ closer_id, name: closer_id, ...v }))
        .sort((a, b) => b.approved - a.approved || b.totalValue - a.totalValue);

      // Top 10 by engagement
      const topProposals: TopProposal[] = proposals
        .sort((a, b) => b.total_views - a.total_views || b.avg_session_secs - a.avg_session_secs)
        .slice(0, 10)
        .map(p => ({
          id: p.id,
          title: p.title,
          clientName: "",
          totalViews: p.total_views,
          avgSessionSecs: p.avg_session_secs,
        }));

      return {
        created, sent, viewed, approved, conversionRate, totalApprovedValue,
        avgDaysToApproval, avgViewsPerProposal, funnel, closerRanking, topProposals,
      };
    },
    enabled: !!organizationId,
  });
}

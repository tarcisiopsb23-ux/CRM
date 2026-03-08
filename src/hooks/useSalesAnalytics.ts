import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { startOfMonth, endOfMonth, differenceInHours } from "date-fns";
import type { Tables } from "@/types/supabase";

type LeadRow = Tables<"leads">;
type LeadStageHistoryRow = Tables<"lead_stage_history">;

const WON_STAGES = ["efetivados"];
const LOST_STAGES = ["desqualificado", "reuniao_sem_sucesso"];
const OPEN_STAGES = [
  "leads_recebidos",
  "qualificados",
  "reuniao_agendada",
  "emissao_contrato",
];

export const STAGE_LABELS: Record<string, string> = {
  leads_recebidos: "Leads Recebidos",
  qualificados: "Qualificados",
  reuniao_agendada: "Reunião Agendada",
  emissao_contrato: "Emissão Contrato",
  efetivados: "Efetivados",
  desqualificado: "Desqualificado",
  reuniao_sem_sucesso: "Reunião sem Sucesso",
};

export interface LeadsPerStage {
  stage: string;
  label: string;
  count: number;
  revenue: number;
}

export interface ConversionRate {
  fromStage: string;
  toStage: string;
  fromLabel: string;
  toLabel: string;
  count: number;
  totalFrom: number;
  rate: number;
}

export interface AvgTimePerStage {
  stage: string;
  label: string;
  avgHours: number;
  leadCount: number;
}

export interface SalesAnalyticsData {
  totalLeads: number;
  leadsPerStage: LeadsPerStage[];
  monthlyLeads: number;
  wonLeads: number;
  lostLeads: number;
  pipelineValue: number;
  closedRevenue: number;
  forecastRevenue: number;
  conversionRates: ConversionRate[];
  avgTimePerStage: AvgTimePerStage[];
  avgTimeToClose: number | null;
  leadsByMonth: { month: string; count: number }[];
}

async function fetchAnalytics(organizationId: string): Promise<SalesAnalyticsData> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // 1. Fetch leads (aggregate - only needed fields)
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, etapa_kanban, value, created_at")
    .eq("organization_id", organizationId);

  if (leadsError) throw leadsError;
  const leadsList = (leads ?? []) as Pick<LeadRow, "id" | "etapa_kanban" | "value" | "created_at">[];

  // 2. Fetch lead_stage_history (RLS filters by org via leads join)
  const { data: history, error: historyError } = await supabase
    .from("lead_stage_history")
    .select("lead_id, from_stage, to_stage, moved_at")
    .order("moved_at", { ascending: true });

  if (historyError) throw historyError;
  const historyList = (history ?? []) as Pick<
    LeadStageHistoryRow,
    "lead_id" | "from_stage" | "to_stage" | "moved_at"
  >[];

  // Build lead IDs set for this org (history RLS returns only org's leads)
  const orgLeadIds = new Set(leadsList.map((l) => l.id));
  const filteredHistory = historyList.filter((h) => orgLeadIds.has(h.lead_id));

  // 3. Pipeline metrics
  const totalLeads = leadsList.length;
  const stageCounts: Record<string, number> = {};
  const stageRevenue: Record<string, number> = {};
  for (const lead of leadsList) {
    const s = lead.etapa_kanban ?? "leads_recebidos";
    stageCounts[s] = (stageCounts[s] ?? 0) + 1;
    stageRevenue[s] = (stageRevenue[s] ?? 0) + Number(lead.value ?? 0);
  }

  const allStages = [
    "leads_recebidos",
    "qualificados",
    "reuniao_agendada",
    "emissao_contrato",
    "efetivados",
    "desqualificado",
    "reuniao_sem_sucesso",
  ];
  const leadsPerStage: LeadsPerStage[] = allStages.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage] ?? stage,
    count: stageCounts[stage] ?? 0,
    revenue: stageRevenue[stage] ?? 0,
  }));

  const monthlyLeads = leadsList.filter((l) => {
    const d = l.created_at ? new Date(l.created_at) : null;
    return d && d >= monthStart && d <= monthEnd;
  }).length;

  const wonLeads = leadsList.filter((l) =>
    WON_STAGES.includes(l.etapa_kanban ?? "")
  ).length;
  const lostLeads = leadsList.filter((l) =>
    LOST_STAGES.includes(l.etapa_kanban ?? "")
  ).length;

  // 4. Revenue metrics
  const pipelineValue = leadsList
    .filter((l) => OPEN_STAGES.includes(l.etapa_kanban ?? ""))
    .reduce((sum, l) => sum + Number(l.value ?? 0), 0);

  const closedRevenue = leadsList
    .filter((l) => WON_STAGES.includes(l.etapa_kanban ?? ""))
    .reduce((sum, l) => sum + Number(l.value ?? 0), 0);

  const wonCount = leadsList.filter((l) =>
    WON_STAGES.includes(l.etapa_kanban ?? "")
  ).length;
  const totalClosed = wonLeads + lostLeads;
  const winRate = totalClosed > 0 ? wonCount / totalClosed : 0;
  const forecastRevenue = pipelineValue * winRate;

  // 5. Conversion rates from history
  const transitionCounts: Record<string, number> = {};
  const fromTotals: Record<string, number> = {};
  for (const h of filteredHistory) {
    const key = `${h.from_stage}→${h.to_stage}`;
    transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
    fromTotals[h.from_stage] = (fromTotals[h.from_stage] ?? 0) + 1;
  }

  const conversionRates: ConversionRate[] = [];
  const seen = new Set<string>();
  for (const h of filteredHistory) {
    const key = `${h.from_stage}→${h.to_stage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = transitionCounts[key] ?? 0;
    const totalFrom = fromTotals[h.from_stage] ?? 0;
    conversionRates.push({
      fromStage: h.from_stage,
      toStage: h.to_stage,
      fromLabel: STAGE_LABELS[h.from_stage] ?? h.from_stage,
      toLabel: STAGE_LABELS[h.to_stage] ?? h.to_stage,
      count,
      totalFrom,
      rate: totalFrom > 0 ? (count / totalFrom) * 100 : 0,
    });
  }
  conversionRates.sort((a, b) => b.count - a.count);

  // 6. Avg time per stage (from history: from_stage exit at moved_at)
  const leadHistoryByLead = new Map<string, typeof filteredHistory>();
  for (const h of filteredHistory) {
    if (!leadHistoryByLead.has(h.lead_id)) {
      leadHistoryByLead.set(h.lead_id, []);
    }
    leadHistoryByLead.get(h.lead_id)!.push(h);
  }
  const leadCreatedMap = new Map(
    leadsList.filter((l) => l.created_at).map((l) => [l.id, new Date(l.created_at)])
  );

  const leadStageDurations: Record<string, number[]> = {};
  const closeTimes: number[] = [];

  for (const [leadId, recs] of leadHistoryByLead) {
    const sorted = [...recs].sort(
      (a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime()
    );
    const created = leadCreatedMap.get(leadId);

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const exitTime = new Date(r.moved_at).getTime();
      const entryTime =
        i === 0
          ? created
            ? created.getTime()
            : exitTime
          : new Date(sorted[i - 1].moved_at).getTime();
      const hours = Math.max(0, (exitTime - entryTime) / (1000 * 60 * 60));
      if (hours > 0 && r.from_stage) {
        if (!leadStageDurations[r.from_stage]) leadStageDurations[r.from_stage] = [];
        leadStageDurations[r.from_stage].push(hours);
      }
    }

    // Time to close: first move to last (won/lost)
    const firstAt = sorted[0]?.moved_at;
    const closedRec = sorted.find((r) =>
      [...WON_STAGES, ...LOST_STAGES].includes(r.to_stage)
    );
    if (firstAt && closedRec) {
      closeTimes.push(
        differenceInHours(new Date(closedRec.moved_at), new Date(firstAt))
      );
    }
  }

  const avgTimePerStage: AvgTimePerStage[] = allStages.map((stage) => {
    const durs = leadStageDurations[stage] ?? [];
    const avg =
      durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
    return {
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      avgHours: avg,
      leadCount: durs.length,
    };
  });

  // 7. Avg time to close (computed above)
  const avgTimeToClose =
    closeTimes.length > 0
      ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length
      : null;

  // 8. Leads created per month (last 12 months)
  const monthCounts: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthCounts[key] = 0;
  }
  for (const l of leadsList) {
    if (l.created_at) {
      const d = new Date(l.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthCounts) monthCounts[key]++;
    }
  }
  const leadsByMonth = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    totalLeads,
    leadsPerStage,
    monthlyLeads,
    wonLeads,
    lostLeads,
    pipelineValue,
    closedRevenue,
    forecastRevenue,
    conversionRates,
    avgTimePerStage,
    avgTimeToClose,
    leadsByMonth,
  };
}

export function useSalesAnalytics(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["sales-analytics", organizationId],
    queryFn: () => fetchAnalytics(organizationId!),
    enabled: !!organizationId,
  });

  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["sales-analytics", organizationId] });
  }, [qc, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel("sales-analytics-leads")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `organization_id=eq.${organizationId}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_stage_history",
        },
        refetch
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, refetch]);

  return {
    ...query.data,
    totalLeads: query.data?.totalLeads ?? 0,
    leadsPerStage: query.data?.leadsPerStage ?? [],
    monthlyLeads: query.data?.monthlyLeads ?? 0,
    wonLeads: query.data?.wonLeads ?? 0,
    lostLeads: query.data?.lostLeads ?? 0,
    pipelineValue: query.data?.pipelineValue ?? 0,
    closedRevenue: query.data?.closedRevenue ?? 0,
    forecastRevenue: query.data?.forecastRevenue ?? 0,
    conversionRates: query.data?.conversionRates ?? [],
    avgTimePerStage: query.data?.avgTimePerStage ?? [],
    avgTimeToClose: query.data?.avgTimeToClose ?? null,
    leadsByMonth: query.data?.leadsByMonth ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch,
  };
}

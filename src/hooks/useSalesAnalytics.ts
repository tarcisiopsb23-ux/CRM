import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { startOfMonth, endOfMonth, differenceInHours } from "date-fns";
import type { Tables } from "@/types/supabase";
import { DateRange, isDateInRange } from "@/lib/periodHelpers";

type LeadStageHistoryRow = Tables<"lead_stage_history">;

const WON_STAGES = ["efetivados"];
const LOST_STAGES = ["desqualificado", "reuniao_sem_sucesso"];
const OPEN_STAGES = [
  "leads_recebidos",
  "qualificados",
  "contato_realizado",
  "reuniao_agendada",
  "emissao_contrato",
];

export const STAGE_LABELS: Record<string, string> = {
  leads_recebidos: "Leads Recebidos",
  qualificados: "Qualificados",
  contato_realizado: "Contato Realizado",
  reuniao_agendada: "Reunião Agendada",
  emissao_contrato: "Negociações",
  efetivados: "Efetivados",
  desqualificado: "Desqualificado",
  reuniao_sem_sucesso: "Sem Sucesso",
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

export interface StageConversionMetric {
  stage: string;
  label: string;
  count: number;
  propLead: number; // vs Leads Recebidos
  propFA: number;   // vs Fases Anteriores
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
  disqualifiedLeads: number;
  lostReasons: { reason: string; count: number }[];
  pipelineValue: number;
  closedRevenue: number;
  forecastRevenue: number;
  conversionRates: ConversionRate[];
  stageConversions: StageConversionMetric[];
  avgTimePerStage: AvgTimePerStage[];
  avgTimeToClose: number | null;
  leadsByMonth: { month: string; count: number }[];
}

async function fetchAnalytics(organizationId: string, range?: DateRange): Promise<SalesAnalyticsData> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // 1. Fetch leads (aggregate - only needed fields)
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .eq("organization_id", organizationId);

  if (leadsError) throw leadsError;
  const leadsList = ((leads ?? []) as unknown as Array<Record<string, unknown>>).map((l) => {
    return {
      id: String(l.id),
      etapa_kanban: (l.etapa_kanban as string | null) ?? null,
      value: (typeof l.value === "number" ? l.value : null) as number | null,
      created_at: (l.created_at as string | null) ?? null,
      lost_reason: (l.lost_reason as string | null) ?? null,
    };
  });

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

  // If range is provided, filter data by range
  const filteredLeadsByRange = range 
    ? leadsList.filter(l => l.created_at && isDateInRange(l.created_at, range))
    : leadsList;
  
  const filteredHistoryByRange = range
    ? filteredHistory.filter(h => h.moved_at && isDateInRange(h.moved_at, range))
    : filteredHistory;

  // 3. Pipeline metrics
  const totalLeads = filteredLeadsByRange.length;
  const stageCounts: Record<string, number> = {};
  const stageRevenue: Record<string, number> = {};
  for (const lead of filteredLeadsByRange) {
    const s = lead.etapa_kanban ?? "leads_recebidos";
    stageCounts[s] = (stageCounts[s] ?? 0) + 1;
    stageRevenue[s] = (stageRevenue[s] ?? 0) + Number(lead.value ?? 0);
  }

  const allStages = [
    "leads_recebidos",
    "qualificados",
    "contato_realizado",
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

  const monthlyLeads = filteredLeadsByRange.filter((l) => {
    const d = l.created_at ? new Date(l.created_at) : null;
    return d && d >= monthStart && d <= monthEnd;
  }).length;

  // wonLeads and lostLeads should be based on history in the period
  // but we also include current status for leads created in the period 
  // that might not have a history record yet (though they should have one if moved)
  const wonLeadsIds = new Set(
    filteredHistoryByRange
      .filter((h) => WON_STAGES.includes(h.to_stage))
      .map((h) => h.lead_id)
  );
  
  const lostLeadsIds = new Set(
    filteredHistoryByRange
      .filter((h) => LOST_STAGES.includes(h.to_stage))
      .map((h) => h.lead_id)
  );

  const wonLeads = wonLeadsIds.size;
  const lostLeads = lostLeadsIds.size;
  const disqualifiedLeads = filteredLeadsByRange.filter((l) => (l.etapa_kanban ?? "") === "desqualificado").length;

  const lostReasonCounts: Record<string, number> = {};
  for (const lead of filteredLeadsByRange) {
    const stage = lead.etapa_kanban ?? "";
    if (!LOST_STAGES.includes(stage)) continue;
    const reason = (lead.lost_reason ?? "").trim();
    if (!reason) continue;
    lostReasonCounts[reason] = (lostReasonCounts[reason] ?? 0) + 1;
  }
  const lostReasons = Object.entries(lostReasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // 4. Revenue metrics
  const pipelineValue = filteredLeadsByRange
    .filter((l) => OPEN_STAGES.includes(l.etapa_kanban ?? ""))
    .reduce((sum, l) => sum + Number(l.value ?? 0), 0);

  const closedRevenue = leadsList
    .filter((l) => wonLeadsIds.has(l.id))
    .reduce((sum, l) => sum + Number(l.value ?? 0), 0);

  const totalClosed = wonLeads + lostLeads;
  const winRate = totalClosed > 0 ? wonLeads / totalClosed : 0;
  const forecastRevenue = pipelineValue * winRate;

  // 5. Conversion rates from history
  const transitionCounts: Record<string, number> = {};
  const fromTotals: Record<string, number> = {};
  for (const h of filteredHistoryByRange) {
    const key = `${h.from_stage}→${h.to_stage}`;
    transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
    fromTotals[h.from_stage] = (fromTotals[h.from_stage] ?? 0) + 1;
  }

  const conversionRates: ConversionRate[] = [];
  const seen = new Set<string>();
  for (const h of filteredHistoryByRange) {
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

  // New Conversion Metric logic (Phase D)
  const conversionStages = [
    "leads_recebidos",
    "qualificados",
    "contato_realizado",
    "reuniao_agendada",
    "emissao_contrato",
    "efetivados"
  ];

  // We need to count how many leads passed through each stage in the period
  // A lead passed through a stage if it's currently in it OR if history shows it was moved TO it.
  const stageVisitCounts: Record<string, number> = {};
  
  // Initialize with 0
  for (const s of conversionStages) stageVisitCounts[s] = 0;

  // For leads_recebidos, we count all leads created in the period
  stageVisitCounts["leads_recebidos"] = filteredLeadsByRange.length;

  // For other stages, count unique leads that entered that stage in the period
  const leadEntriesByStage: Record<string, Set<string>> = {};
  for (const s of conversionStages) {
    if (s === "leads_recebidos") continue;
    leadEntriesByStage[s] = new Set();
  }

  for (const h of filteredHistoryByRange) {
    if (leadEntriesByStage[h.to_stage]) {
      leadEntriesByStage[h.to_stage].add(h.lead_id);
    }
  }

  for (const s of conversionStages) {
    if (s === "leads_recebidos") continue;
    stageVisitCounts[s] = leadEntriesByStage[s].size;
  }

  const leadsRecebidosCount = stageVisitCounts["leads_recebidos"] || 1;
  const stageConversions: StageConversionMetric[] = conversionStages.map((stage, index) => {
    const count = stageVisitCounts[stage] || 0;
    const prevStage = index > 0 ? conversionStages[index - 1] : null;
    const prevCount = prevStage ? stageVisitCounts[prevStage] : count;
    
    return {
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      count,
      propLead: (count / leadsRecebidosCount) * 100,
      propFA: prevCount > 0 ? (count / prevCount) * 100 : 0,
    };
  });

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
      if (!r.moved_at) continue;
      const exitTime = new Date(r.moved_at).getTime();
      if (Number.isNaN(exitTime)) continue;

      let entryTime = exitTime;
      if (i === 0) {
        if (created && !Number.isNaN(created.getTime())) {
          entryTime = created.getTime();
        }
      } else {
        const prevMovedAt = sorted[i - 1].moved_at;
        if (prevMovedAt) {
          const prevTime = new Date(prevMovedAt).getTime();
          if (!Number.isNaN(prevTime)) {
            entryTime = prevTime;
          }
        }
      }

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
      const start = new Date(firstAt);
      const end = new Date(closedRec.moved_at);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        closeTimes.push(differenceInHours(end, start));
      }
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
    disqualifiedLeads,
    lostReasons,
    pipelineValue,
    closedRevenue,
    forecastRevenue,
    conversionRates,
    stageConversions,
    avgTimePerStage,
    avgTimeToClose,
    leadsByMonth,
  };
}

export function useSalesAnalytics(organizationId: string | undefined, options?: { range?: DateRange }) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["sales-analytics", organizationId, options?.range],
    queryFn: () => fetchAnalytics(organizationId!, options?.range),
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
    disqualifiedLeads: query.data?.disqualifiedLeads ?? 0,
    lostReasons: query.data?.lostReasons ?? [],
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

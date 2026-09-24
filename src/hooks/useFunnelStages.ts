import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const CRM_STAGES = [
  { key: "leads_recebidos",  label: "Leads Recebidos" },
  { key: "qualificados",     label: "Qualificados" },
  { key: "contato_realizado", label: "Contato Realizado" },
  { key: "reuniao_agendada", label: "Reunião Agendada" },
  { key: "emissao_contrato", label: "Negociações" },
  { key: "efetivados",       label: "Efetivados" },
] as const;

export type CrmStageKey = typeof CRM_STAGES[number]["key"];

interface FunnelStageCount {
  key: CrmStageKey;
  label: string;
  value: number;
}

interface UseFunnelStagesOptions {
  from?: string; // ISO date "YYYY-MM-DD"
  to?: string;   // ISO date "YYYY-MM-DD"
}

/**
 * Counts how many unique leads reached each CRM stage within the given period.
 * Cumulative: a lead moving A→B is counted in both A and B.
 *
 * - leads_recebidos: leads created in the period (by created_at)
 * - other stages:    distinct lead_ids with to_stage = <stage> in lead_stage_history within period
 *
 * History is filtered to org leads to respect RLS correctly.
 */
export function useFunnelStages(
  organizationId: string | undefined,
  options: UseFunnelStagesOptions = {}
): { stages: FunnelStageCount[]; isLoading: boolean } {
  const { from, to } = options;

  // Full-day boundaries: "YYYY-MM-DD" → "YYYY-MM-DDT00:00:00" / "YYYY-MM-DDT23:59:59"
  const fromTs = from ? `${from}T00:00:00` : undefined;
  const toTs   = to   ? `${to}T23:59:59`   : undefined;

  // 1. All org leads (no date filter) — needed to scope history to this org
  const allLeadsQuery = useQuery({
    queryKey: ["funnel_all_leads", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, created_at")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  // 2. Stage history — RLS filters by org via leads join, but we also cross-check below
  const historyQuery = useQuery({
    queryKey: ["funnel_history", organizationId, fromTs, toTs],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from("lead_stage_history")
        .select("lead_id, to_stage, moved_at");
      if (fromTs) q = q.gte("moved_at", fromTs);
      if (toTs)   q = q.lte("moved_at", toTs);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  const stages = useMemo<FunnelStageCount[]>(() => {
    const allLeads = allLeadsQuery.data ?? [];
    const history  = historyQuery.data ?? [];

    // Set of all lead IDs belonging to this org
    const orgLeadIds = new Set(allLeads.map(l => l.id));

    // leads_recebidos: leads created within the period
    const receivedCount = allLeads.filter(l => {
      if (!l.created_at) return false;
      if (fromTs && l.created_at < fromTs) return false;
      if (toTs   && l.created_at > toTs)   return false;
      return true;
    }).length;

    // Other stages: unique org lead_ids that moved TO that stage in the period
    const stageReached: Record<string, Set<string>> = {};
    for (const h of history) {
      if (!orgLeadIds.has(h.lead_id)) continue; // safety: only org leads
      if (!stageReached[h.to_stage]) stageReached[h.to_stage] = new Set();
      stageReached[h.to_stage].add(h.lead_id);
    }

    return CRM_STAGES.map(({ key, label }) => ({
      key,
      label,
      value: key === "leads_recebidos"
        ? receivedCount
        : (stageReached[key]?.size ?? 0),
    }));
  }, [allLeadsQuery.data, historyQuery.data, fromTs, toTs]);

  return {
    stages,
    isLoading: allLeadsQuery.isLoading || historyQuery.isLoading,
  };
}

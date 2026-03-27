import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ConversationKpiRow {
  period_date: string;
  source: string;
  campaign: string | null;
  conversations: number;
  bot_finished: number;
  human_transfer: number;
  leads_identified: number;
  conversions: number;
}

export interface AgentKpiRow {
  agent_name: string;
  conversations_started: number;
  conversations_finished: number;
  conversions: number;
}

export interface ConversationKpiTotals {
  conversations: number;
  bot_finished: number;
  human_transfer: number;
  leads_identified: number;
  conversions: number;
  automation_rate: number;
  transfer_rate: number;
  conversion_rate: number;
  lead_rate: number;
}

export interface ConversationTrendPoint {
  date: string;
  conversations: number;
  leads_identified: number;
  conversions: number;
}

// Single-tenant: sem organization_id
export function useClientConversationKpis(
  clientId: string | undefined,
  range?: { from: string; to: string }
) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["client_conversation_kpis", clientId, range?.from, range?.to],
    queryFn: async () => {
      if (!clientId) return [];
      let q = supabase
        .from("client_conversation_kpis")
        .select("period_date, source, campaign, conversations, bot_finished, human_transfer, leads_identified, conversions")
        .eq("client_id", clientId)
        .order("period_date", { ascending: true });
      if (range?.from) q = q.gte("period_date", range.from);
      if (range?.to)   q = q.lte("period_date", range.to);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return (data ?? []) as ConversationKpiRow[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: agentRows = [] } = useQuery({
    queryKey: ["client_agent_kpis", clientId, range?.from, range?.to],
    queryFn: async () => {
      if (!clientId) return [];
      let q = supabase
        .from("client_agent_kpis")
        .select("agent_name, conversations_started, conversations_finished, conversions")
        .eq("client_id", clientId);
      if (range?.from) q = q.gte("period_date", range.from);
      if (range?.to)   q = q.lte("period_date", range.to);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return (data ?? []) as AgentKpiRow[];
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  const totals = useMemo<ConversationKpiTotals>(() => {
    const t = rows.reduce((acc, r) => ({
      conversations:    acc.conversations    + r.conversations,
      bot_finished:     acc.bot_finished     + r.bot_finished,
      human_transfer:   acc.human_transfer   + r.human_transfer,
      leads_identified: acc.leads_identified + r.leads_identified,
      conversions:      acc.conversions      + r.conversions,
    }), { conversations: 0, bot_finished: 0, human_transfer: 0, leads_identified: 0, conversions: 0 });
    return {
      ...t,
      automation_rate:  t.conversations    > 0 ? (t.bot_finished     / t.conversations)    * 100 : 0,
      transfer_rate:    t.conversations    > 0 ? (t.human_transfer    / t.conversations)    * 100 : 0,
      conversion_rate:  t.leads_identified > 0 ? (t.conversions       / t.leads_identified) * 100 : 0,
      lead_rate:        t.conversations    > 0 ? (t.leads_identified  / t.conversations)    * 100 : 0,
    };
  }, [rows]);

  const trend = useMemo<ConversationTrendPoint[]>(() => {
    const byDate: Record<string, ConversationTrendPoint> = {};
    for (const r of rows) {
      if (!byDate[r.period_date]) byDate[r.period_date] = { date: r.period_date, conversations: 0, leads_identified: 0, conversions: 0 };
      byDate[r.period_date].conversations    += r.conversations;
      byDate[r.period_date].leads_identified += r.leads_identified;
      byDate[r.period_date].conversions      += r.conversions;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const byCampaign = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of rows) {
      const key = r.campaign ?? "Sem campanha";
      if (!map[key]) map[key] = { campaign: key, conversations: 0, bot_finished: 0, human_transfer: 0, leads_identified: 0, conversions: 0 };
      map[key].conversations    += r.conversations;
      map[key].bot_finished     += r.bot_finished;
      map[key].human_transfer   += r.human_transfer;
      map[key].leads_identified += r.leads_identified;
      map[key].conversions      += r.conversions;
    }
    return Object.values(map).map(c => ({
      ...c,
      automation_rate: c.conversations > 0 ? (c.bot_finished / c.conversations) * 100 : 0,
      conversion_rate: c.leads_identified > 0 ? (c.conversions / c.leads_identified) * 100 : 0,
    })).sort((a, b) => b.conversations - a.conversations);
  }, [rows]);

  const bySource = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.source] = (map[r.source] ?? 0) + r.conversations;
    return Object.entries(map).map(([source, value]) => ({ source, value }));
  }, [rows]);

  const byAgent = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of agentRows) {
      if (!map[r.agent_name]) map[r.agent_name] = { agent_name: r.agent_name, conversations_started: 0, conversations_finished: 0, conversions: 0 };
      map[r.agent_name].conversations_started  += r.conversations_started;
      map[r.agent_name].conversations_finished += r.conversations_finished;
      map[r.agent_name].conversions            += r.conversions;
    }
    return Object.values(map).map(a => ({
      ...a,
      conversion_rate: a.conversations_started > 0 ? (a.conversions / a.conversations_started) * 100 : 0,
    })).sort((a, b) => b.conversations_started - a.conversations_started);
  }, [agentRows]);

  return { totals, trend, byCampaign, bySource, byAgent, isLoading, hasData: rows.length > 0 };
}

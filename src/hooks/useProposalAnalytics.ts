import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProposalEvent } from "@/types/proposals";

const sb = () => supabase as unknown as SupabaseClient;

export interface SessionSummary {
  session_id: string;
  events: ProposalEvent[];
  first_at: string;
  last_at: string;
  duration_secs: number;
  device: string | null;
  city: string | null;
  ip: string | null;
}

export interface ProposalAnalyticsSummary {
  totalViews: number;
  totalAccesses: number;
  avgSessionSecs: number;
  lastAccessedAt: string | null;
  topDevice: string | null;
  recentAccesses: Array<{ date: string; ip: string | null; city: string | null; device: string | null }>;
  sessions: SessionSummary[];
}

export function useProposalAnalytics(proposalId: string | undefined) {
  return useQuery({
    queryKey: ["proposal-analytics", proposalId],
    queryFn: async (): Promise<ProposalAnalyticsSummary> => {
      if (!proposalId) return {
        totalViews: 0, totalAccesses: 0, avgSessionSecs: 0,
        lastAccessedAt: null, topDevice: null, recentAccesses: [], sessions: [],
      };

      const { data, error } = await sb()
        .from("proposal_events")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("occurred_at", { ascending: true });
      if (error) throw error;

      const events = (data ?? []) as unknown as ProposalEvent[];

      // Group by session_id
      const sessionMap = new Map<string, ProposalEvent[]>();
      for (const ev of events) {
        const list = sessionMap.get(ev.session_id) ?? [];
        list.push(ev);
        sessionMap.set(ev.session_id, list);
      }

      const sessions: SessionSummary[] = [];
      for (const [sid, evs] of sessionMap) {
        const sorted = evs.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
        const first = sorted[0].occurred_at;
        const last = sorted[sorted.length - 1].occurred_at;
        const duration_secs = Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000);
        sessions.push({
          session_id: sid,
          events: sorted,
          first_at: first,
          last_at: last,
          duration_secs,
          device: sorted[0].device ?? null,
          city: sorted[0].city ?? null,
          ip: sorted[0].ip ?? null,
        });
      }

      const sortedSessions = sessions.sort((a, b) => b.first_at.localeCompare(a.first_at));
      const totalAccesses = sessions.length;
      // Unique IPs = views
      const uniqueIPs = new Set(sessions.map(s => s.ip).filter(Boolean));
      const totalViews = uniqueIPs.size || totalAccesses;
      const avgSessionSecs = sessions.length > 0
        ? Math.round(sessions.reduce((s, ss) => s + ss.duration_secs, 0) / sessions.length)
        : 0;
      const lastAccessedAt = sortedSessions[0]?.first_at ?? null;

      // Top device
      const deviceCount = new Map<string, number>();
      for (const s of sessions) {
        if (s.device) deviceCount.set(s.device, (deviceCount.get(s.device) ?? 0) + 1);
      }
      const topDevice = [...deviceCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const recentAccesses = sortedSessions.slice(0, 50).map(s => ({
        date: s.first_at,
        ip: s.ip,
        city: s.city,
        device: s.device,
      }));

      return { totalViews, totalAccesses, avgSessionSecs, lastAccessedAt, topDevice, recentAccesses, sessions: sortedSessions };
    },
    enabled: !!proposalId,
  });
}

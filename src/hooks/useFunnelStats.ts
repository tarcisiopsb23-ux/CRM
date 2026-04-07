import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CrmFunnelStats {
  novo: number;
  contato: number;
  proposta: number;
  negociacao: number;
  fechado: number;
  perdido: number;
}

/**
 * Fetches CRM stage history counts for the given date range.
 * Each number = distinct leads that entered that stage in the period.
 * Uses the get_funnel_stats RPC (migration 20260406000002).
 */
export function useFunnelStats(
  clientId?: string,
  dateRange?: { from: string; to: string }
) {
  return useQuery<CrmFunnelStats>({
    queryKey: ["funnel_stats", clientId, dateRange],
    queryFn: async () => {
      if (!clientId || !dateRange) return empty();

      const { data, error } = await supabase.rpc("get_funnel_stats", {
        p_from: dateRange.from + "T00:00:00Z",
        p_to:   dateRange.to   + "T23:59:59Z",
      });

      if (error) {
        console.warn("[funnel] get_funnel_stats error:", error.message);
        return empty();
      }

      const map: Record<string, number> = {};
      for (const row of (data ?? [])) {
        map[row.stage] = Number(row.total);
      }

      return {
        novo:       map["novo"]       ?? 0,
        contato:    map["contato"]    ?? 0,
        proposta:   map["proposta"]   ?? 0,
        negociacao: map["negociacao"] ?? 0,
        fechado:    map["fechado"]    ?? 0,
        perdido:    map["perdido"]    ?? 0,
      };
    },
    enabled: !!clientId && !!dateRange,
  });
}

function empty(): CrmFunnelStats {
  return { novo: 0, contato: 0, proposta: 0, negociacao: 0, fechado: 0, perdido: 0 };
}

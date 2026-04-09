import { useQuery } from "@tanstack/react-query";
import { supabaseCrm } from "@/lib/supabase";

export interface CrmFunnelStats {
  novo: number;
  contato: number;
  proposta: number;
  negociacao: number;
  fechado: number;
  perdido: number;
}

/**
 * Fetches CRM stage history counts for the given date range and tenant.
 * Uses the get_funnel_stats RPC (migration 20260501000007).
 * The RPC uses SECURITY INVOKER — RLS filters by the caller's JWT tenant_id automatically.
 * p_tenant_id is passed explicitly for support sessions where the JWT tenant_id is null.
 */
export function useFunnelStats(
  tenantId?: string,
  dateRange?: { from: string; to: string }
) {
  return useQuery<CrmFunnelStats>({
    queryKey: ["funnel_stats", tenantId, dateRange],
    queryFn: async () => {
      if (!tenantId || !dateRange) return empty();

      const { data, error } = await supabaseCrm.rpc("get_funnel_stats", {
        p_from:      dateRange.from + "T00:00:00Z",
        p_to:        dateRange.to   + "T23:59:59Z",
        p_tenant_id: tenantId,
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
    enabled: !!tenantId && !!dateRange,
  });
}

function empty(): CrmFunnelStats {
  return { novo: 0, contato: 0, proposta: 0, negociacao: 0, fechado: 0, perdido: 0 };
}

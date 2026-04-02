import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Hook para calcular o faturamento dinâmico de um cliente com base no histórico de KPIs.
 *
 * Busca registros de `client_kpi_history` cujo KPI pai tenha unit === 'currency'
 * ou nome contendo "faturamento" (case-insensitive), filtra valores > 0 e retorna
 * a média arredondada a 2 casas decimais.
 *
 * Retorna null quando não há histórico válido.
 *
 * Validates: Requirements 4.1, 4.7, 4.8
 */
export function useDynamicRevenue(organizationId?: string, clientId?: string) {
  const query = useQuery<number | null>({
    queryKey: ["dynamic_revenue", organizationId, clientId],
    queryFn: async () => {
      if (!organizationId || !clientId) return null;

      // Busca histórico com join no KPI pai para filtrar por unit ou nome
      const { data, error } = await supabase
        .from("client_kpi_history")
        .select("value, client_kpis!inner(unit, name)")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      // Filtra apenas registros de KPIs de faturamento (unit currency ou nome contendo "faturamento")
      const revenueRecords = (data as Array<{
        value: number;
        client_kpis: { unit: string; name: string } | { unit: string; name: string }[];
      }>).filter((row) => {
        const kpiRaw = row.client_kpis;
        const kpi = Array.isArray(kpiRaw) ? kpiRaw[0] : kpiRaw;
        if (!kpi) return false;
        const isCurrency = kpi.unit === "currency";
        const isFaturamento = kpi.name.toLowerCase().includes("faturamento");
        return isCurrency || isFaturamento;
      });

      // Filtra apenas valores > 0
      const validValues = revenueRecords
        .map((r) => r.value)
        .filter((v) => typeof v === "number" && v > 0);

      if (validValues.length === 0) return null;

      const avg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
      return Math.round(avg * 100) / 100;
    },
    enabled: !!organizationId && !!clientId,
  });

  return {
    dynamicRevenue: query.data ?? null,
    isLoading: query.isLoading,
  };
}

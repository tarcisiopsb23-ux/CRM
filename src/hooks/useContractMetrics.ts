import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { computeContractMetrics, Contract, Payment, ContractMetrics } from "@/lib/contractMetricsCore";
import { DateRange } from "@/lib/periodHelpers";

export type { ContractMetricsContract, ContractMetricsPayment, ContractMetrics } from "@/lib/contractMetricsCore";

export function useContractMetrics(organizationId: string | undefined, options?: { enabled?: boolean; range?: DateRange }) {
  const enabled = options?.enabled ?? true;

  const contractsQuery = useQuery({
    queryKey: ["contracts", "metrics", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("id, client_id, status, metadata, created_at")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as unknown as Contract[];
    },
    enabled: !!organizationId && enabled,
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", "metrics", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("id, contract_id, client_id, due_date, paid_at, status, value")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },
    enabled: !!organizationId && enabled,
  });

  const metrics = useMemo(() => {
    return computeContractMetrics({
      contracts: contractsQuery.data ?? [],
      payments: paymentsQuery.data ?? [],
      range: options?.range,
    });
  }, [contractsQuery.data, paymentsQuery.data, options?.range]);

  return {
    ...metrics,
    loading: contractsQuery.isLoading || paymentsQuery.isLoading,
    error: contractsQuery.error ?? paymentsQuery.error,
    contractsQuery,
    paymentsQuery,
  };
}

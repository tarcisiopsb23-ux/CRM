import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Payment } from "@/types/crm";

export interface UseC8PaymentsOptions {
  organizationId: string | undefined;
  clientId?: string;
  statusFilter?: string[];
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
}

export interface UseC8PaymentsResult {
  payments: Payment[];
  legacyPayments: Payment[];
  isLoading: boolean;
  error: Error | null;
}

export function useC8Payments({
  organizationId,
  clientId,
  statusFilter,
  periodStart,
  periodEnd,
  limit = 24,
}: UseC8PaymentsOptions): UseC8PaymentsResult {
  const query = useQuery({
    queryKey: [
      "c8_payments",
      organizationId,
      clientId,
      statusFilter,
      periodStart,
      periodEnd,
      limit,
    ],
    queryFn: async () => {
      if (!organizationId) return { payments: [], legacyPayments: [] };

      // Step 1: fetch CRM contracts for the organization
      let contractsQuery = supabase
        .from("contracts")
        .select("id, client_id")
        .eq("organization_id", organizationId)
        .eq("service_contracted", "C8 Control CRM");

      if (clientId) {
        contractsQuery = contractsQuery.eq("client_id", clientId);
      }

      const { data: contracts, error: contractsError } = await contractsQuery;
      if (contractsError) throw contractsError;

      const contractIds = (contracts ?? []).map((c) => c.id);

      // Step 2: fetch payments linked to those contracts
      let payments: Payment[] = [];
      if (contractIds.length > 0) {
        let paymentsQuery = supabase
          .from("payments")
          .select("*, clients(name, company)")
          .in("contract_id", contractIds)
          .order("due_date", { ascending: false })
          .limit(limit);

        if (statusFilter && statusFilter.length > 0) {
          paymentsQuery = paymentsQuery.in("status", statusFilter);
        }
        if (periodStart) {
          paymentsQuery = paymentsQuery.gte("due_date", periodStart);
        }
        if (periodEnd) {
          paymentsQuery = paymentsQuery.lte("due_date", periodEnd);
        }

        const { data: paymentsData, error: paymentsError } = await paymentsQuery;
        if (paymentsError) throw paymentsError;
        payments = (paymentsData ?? []) as Payment[];
      }

      // Step 3: fetch legacy payments (no contract_id, description matches C8 Control)
      // Only fetch if there are no contract-linked payments for a client, to avoid duplicates.
      let legacyPayments: Payment[] = [];

      // Clients already covered by contract payments — skip them in legacy query
      const clientsCoveredByContracts = new Set(
        (contracts ?? []).map((c) => c.client_id)
      );

      let clientsQuery = supabase
        .from("clients")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("c8_control_enabled", true);

      if (clientId) {
        clientsQuery = clientsQuery.eq("id", clientId);
      }

      const { data: c8Clients, error: clientsError } = await clientsQuery;
      if (clientsError) throw clientsError;

      // Only query legacy payments for clients NOT already covered by a C8 contract
      const c8ClientIds = (c8Clients ?? [])
        .map((c) => c.id)
        .filter((id) => !clientsCoveredByContracts.has(id));

      if (c8ClientIds.length > 0) {
        let legacyQuery = supabase
          .from("payments")
          .select("*, clients(name, company)")
          .is("contract_id", null)
          .in("client_id", c8ClientIds)
          .ilike("description", "Mensalidade C8 Control%")
          .order("due_date", { ascending: false })
          .limit(limit);

        if (statusFilter && statusFilter.length > 0) {
          legacyQuery = legacyQuery.in("status", statusFilter);
        }
        if (periodStart) {
          legacyQuery = legacyQuery.gte("due_date", periodStart);
        }
        if (periodEnd) {
          legacyQuery = legacyQuery.lte("due_date", periodEnd);
        }

        const { data: legacyData, error: legacyError } = await legacyQuery;
        if (legacyError) throw legacyError;
        legacyPayments = (legacyData ?? []) as Payment[];
      }

      // Deduplicate by id just in case
      const seenIds = new Set(payments.map((p) => p.id));
      legacyPayments = legacyPayments.filter((p) => !seenIds.has(p.id));

      return { payments, legacyPayments };
    },
    enabled: !!organizationId,
  });

  return {
    payments: query.data?.payments ?? [],
    legacyPayments: query.data?.legacyPayments ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

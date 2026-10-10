/**
 * useCrmDeals — T-2.3
 *
 * CRUD de negociações (deals) no Banco B do cliente.
 * Hook dedicado separado do useCrmPipeline para uso independente
 * (ex: cards condicionais no DashboardGeral).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface CrmDeal {
  id: string;
  client_id: string;
  contact_id: string | null;
  product_id: string | null;
  stage_id: string | null;
  title: string | null;
  value: number;
  status: "open" | "won" | "lost";
  notes: string | null;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais
  contact?: { name: string } | null;
  product?: { name: string; price: number } | null;
}

export type CrmDealInput = {
  client_id: string;
  stage_id?: string | null;
  title?: string | null;
  contact_id?: string | null;
  product_id?: string | null;
  value?: number;
  notes?: string | null;
  expected_close_date?: string | null;
};

export function useCrmDeals(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["crm_deals", clientId];

  const query = useQuery<CrmDeal[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("crm_deals")
        .select("*, contact:crm_contacts(name), product:crm_products(name, price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmDeal[];
    },
    enabled: !!dc && !!clientId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: CrmDealInput) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_deals")
        .insert({ ...input, status: "open", value: input.value ?? 0 })
        .select()
        .single();
      if (error) throw error;
      return data as CrmDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmDeal> & { id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const move = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").update({ stage_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  /** Soma de value das negociações ganhas */
  const wonRevenue = (query.data ?? [])
    .filter(d => d.status === "won")
    .reduce((sum, d) => sum + (d.value || 0), 0);

  return { ...query, create, update, move, remove, wonRevenue };
}

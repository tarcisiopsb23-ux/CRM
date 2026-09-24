/**
 * useCrmDeals
 *
 * Hook isolado para deals do CRM.
 * Separado do useCrmPipeline para permitir uso independente
 * sem carregar stages junto.
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
  contact?: { name: string } | null;
  product?: { name: string; price: number } | null;
}

export function useCrmDeals(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const key = ["crm_deals", clientId];

  const query = useQuery<CrmDeal[]>({
    queryKey: key,
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

  const createDeal = useMutation({
    mutationFn: async (input: {
      client_id: string; stage_id: string;
      title?: string; contact_id?: string | null;
      product_id?: string | null; value?: number;
    }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_deals")
        .insert({ ...input, status: "open", value: input.value ?? 0 })
        .select("*, contact:crm_contacts(name), product:crm_products(name, price)")
        .single();
      if (error) throw error;
      return data as CrmDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmDeal> & { id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const removeDeal = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const moveDeal = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").update({ stage_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    data:        query.data ?? [],
    isLoading:   query.isLoading,
    createDeal,
    updateDeal,
    removeDeal,
    moveDeal,
  };
}

/**
 * useCrmDealItems
 *
 * Hook para gestão dos itens de uma negociação (multi-produto).
 * Cada item guarda snapshot do preço negociado.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface CrmDealItem {
  id:           string;
  deal_id:      string;
  product_id:   string | null;
  description:  string;
  quantity:     number;
  unit_price:   number;
  discount:     number;
  total:        number;   // coluna calculada
  order:        number;
  created_at:   string;
  updated_at:   string;
}

export type CrmDealItemInput = {
  product_id?:   string | null;
  description:   string;
  quantity:      number;
  unit_price:    number;
  discount?:     number;
};

export function useCrmDealItems(dealId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["crm_deal_items", dealId];

  const query = useQuery<CrmDealItem[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !dealId) return [];
      const { data, error } = await dc
        .from("crm_deal_items")
        .select("*")
        .eq("deal_id", dealId)
        .order("order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmDealItem[];
    },
    enabled: !!dc && !!dealId,
    staleTime: 30_000,
  });

  /** Salva todos os itens do deal de uma vez (substitui existentes via upsert_crm_deal) */
  const saveAll = useMutation({
    mutationFn: async ({
      clientId, items,
    }: {
      clientId: string;
      items: CrmDealItemInput[];
    }) => {
      if (!dc || !dealId) throw new Error("Deal não especificado");
      const { data, error } = await dc.rpc("upsert_crm_deal", {
        p_client_id: clientId,
        p_deal_id:   dealId,
        p_items:     items,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Erro ao salvar itens");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ["crm_deals"] });
    },
  });

  const totalValue = (query.data ?? []).reduce((s, i) => s + (i.total ?? 0), 0);

  return { ...query, saveAll, totalValue };
}

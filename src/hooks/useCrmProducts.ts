/**
 * useCrmProducts
 *
 * Hook para gestão de produtos/serviços do CRM.
 * Usa a view crm_products (aponta para client_crm_products no Banco A).
 * Interface expandida com migration 094: sku, product_type, category.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface CrmProduct {
  id:           string;
  client_id:    string;
  name:         string;
  description:  string | null;
  price:        number;
  unit:         string;
  active:       boolean;
  // Novos campos (migration 094)
  sku:          string | null;
  product_type: "product" | "service";
  category:     string | null;
  image_url:    string | null;
  created_at:   string;
  updated_at:   string;
}

export type CrmProductInput = Pick<CrmProduct, "name"> &
  Partial<Omit<CrmProduct, "id" | "client_id" | "created_at" | "updated_at">>;

export function useCrmProducts(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["crm_products", clientId];

  const query = useQuery<CrmProduct[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("crm_products")
        .select("*")
        .eq("client_id", clientId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmProduct[];
    },
    enabled: !!dc && !!clientId,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: async (input: CrmProductInput & { client_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_products")
        .insert({
          client_id:    input.client_id,
          name:         input.name,
          description:  input.description  ?? null,
          price:        input.price        ?? 0,
          unit:         input.unit         ?? "unidade",
          active:       input.active       ?? true,
          sku:          input.sku          ?? null,
          product_type: input.product_type ?? "service",
          category:     input.category     ?? null,
          image_url:    input.image_url    ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CrmProduct;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmProduct> & { id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_products").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_products").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { ...query, create, update, toggleActive, remove };
}

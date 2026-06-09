import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface CrmContact {
  id: string;
  client_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CrmContactInput = Pick<CrmContact, "name"> &
  Partial<Pick<CrmContact, "phone" | "email" | "source" | "tags" | "notes" | "metadata">>;

export function useCrmContacts(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const qk = ["crm_contacts", clientId];

  const query = useQuery<CrmContact[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("crm_contacts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmContact[];
    },
    enabled: !!dc && !!clientId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (input: CrmContactInput & { client_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_contacts")
        .insert({ ...input, tags: input.tags ?? [], metadata: input.metadata ?? {} })
        .select()
        .single();
      if (error) throw error;
      return data as CrmContact;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmContact> & { id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_contacts")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as CrmContact;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  /** Importação em lote via CSV parseado */
  const importBatch = useMutation({
    mutationFn: async (rows: Array<CrmContactInput & { client_id: string }>) => {
      if (!dc) throw new Error("Banco não conectado");
      const payload = rows.map(r => ({
        ...r,
        tags: r.tags ?? [],
        metadata: r.metadata ?? {},
        source: r.source ?? "import",
      }));
      const { error } = await dc.from("crm_contacts").insert(payload);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { ...query, create, update, remove, importBatch };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Supplier } from "@/types/crm";

export function useSuppliers(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["suppliers", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Supplier[];
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Supplier> & { name: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { metadata, ...rest } = input;
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ ...rest, organization_id: organizationId, ...(metadata !== undefined && { metadata: toJson(metadata) }) })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Supplier> & { id: string }) => {
      const { metadata, ...rest } = input;
      const payload = { ...rest, ...(metadata !== undefined && { metadata: toJson(metadata) }) };
      const { data, error } = await supabase.from("suppliers").update(payload).eq("id", id).select().single();
      if (error) throw error;
      return data as unknown as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", organizationId] }),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", organizationId] }),
  });

  const activate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers", organizationId] }),
  });

  // Mantido por compatibilidade
  const remove = deactivate;

  return { ...query, create, update, remove, deactivate, activate };
}

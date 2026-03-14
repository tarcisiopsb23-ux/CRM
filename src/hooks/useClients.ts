/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toJson } from "@/lib/supabase-utils";
import type { Client } from "@/types/crm";

export function useClients(organizationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["clients", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      // Tenta buscar da view com contratos se existir, senão da tabela normal
      try {
        const { data, error } = await supabase
          .from("clients_with_contracts" as any) // View criada na migração 002
          .select("*")
          .eq("organization_id", organizationId)
          .order("name");
          
        if (!error) return (data ?? []) as unknown as (Client & { contract_status?: string; contract_start?: string; contract_end?: string })[];
        
        // Fallback se a view não existir
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("clients")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name");
          
        if (fallbackError) throw fallbackError;
        return (fallbackData ?? []) as Client[];
      } catch (err) {
        console.error("Erro ao buscar clientes:", err);
        return [];
      }
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (input: Partial<Client> & { name: string }) => {
      if (!organizationId) throw new Error("Sem organização");
      const { metadata, ...rest } = input;
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...rest, organization_id: organizationId, ...(metadata !== undefined && { metadata: toJson(metadata) }) })
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", organizationId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Client> & { id: string }) => {
      const { metadata, ...rest } = input;
      const payload = { ...rest, ...(metadata !== undefined && { metadata: toJson(metadata) }) };
      const { data, error } = await supabase.from("clients").update(payload).eq("id", id).select().single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", organizationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", organizationId] }),
  });

  return { ...query, create, update, remove };
}

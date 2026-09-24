/**
 * usePixKeys
 * CRUD para chaves PIX da organização (tabela pix_keys).
 * Visível a todos; escrita restrita a owner/admin (via RLS no banco).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

export interface PixKey {
  id: string;
  organization_id: string;
  label: string;
  key_type: "cnpj" | "cpf" | "email" | "telefone" | "aleatoria";
  key_value: string;
  holder_name: string;  // nome do titular — aparece no contrato junto com a chave
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PixKeyInput = Omit<PixKey, "id" | "organization_id" | "created_at" | "updated_at">;

export const PIX_KEY_TYPE_LABELS: Record<PixKey["key_type"], string> = {
  cnpj:      "CNPJ",
  cpf:       "CPF",
  email:     "E-mail",
  telefone:  "Telefone",
  aleatoria: "Chave aleatória",
};

export function usePixKeys() {
  const organizationId = useOrganization();
  const qc = useQueryClient();
  const QK = ["pix_keys", organizationId];

  const query = useQuery<PixKey[]>({
    queryKey: QK,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("pix_keys")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PixKey[];
    },
    enabled: !!organizationId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const create = useMutation({
    mutationFn: async (input: PixKeyInput) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      // Se marcar como padrão, desmarcar outras primeiro
      if (input.is_default) {
        await supabase
          .from("pix_keys")
          .update({ is_default: false })
          .eq("organization_id", organizationId);
      }
      const { error } = await supabase
        .from("pix_keys")
        .insert({ ...input, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Chave PIX criada."); },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao criar chave PIX."),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: PixKeyInput & { id: string }) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      if (input.is_default) {
        await supabase
          .from("pix_keys")
          .update({ is_default: false })
          .eq("organization_id", organizationId)
          .neq("id", id);
      }
      const { error } = await supabase
        .from("pix_keys")
        .update(input)
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Chave PIX atualizada."); },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao atualizar chave PIX."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pix_keys")
        .update({ is_active: false })
        .eq("id", id)
        .eq("organization_id", organizationId ?? "");
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Chave PIX removida."); },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao remover chave PIX."),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      if (!organizationId) throw new Error("Organização não identificada.");
      await supabase
        .from("pix_keys")
        .update({ is_default: false })
        .eq("organization_id", organizationId);
      const { error } = await supabase
        .from("pix_keys")
        .update({ is_default: true })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Chave padrão definida."); },
    onError: (e: Error) => toast.error(e.message ?? "Erro."),
  });

  return {
    pixKeys:    query.data ?? [],
    isLoading:  query.isLoading,
    create,
    update,
    remove,
    setDefault,
  };
}

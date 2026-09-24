import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AvaliacaoTecnica, CreateAvaliacaoTecnicaPayload } from "@/types/avaliacao360";
import { useAuth } from "@/contexts/AuthContext";

export function useAvaliacoesTecnicas(colaboradorId: string | undefined) {
  return useQuery({
    queryKey: ["avaliacoes_tecnicas", colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return [];
      const { data, error } = await supabase
        .from("avaliacoes_tecnicas")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AvaliacaoTecnica[];
    },
    enabled: !!colaboradorId,
  });
}

export function useCreateAvaliacaoTecnica() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (payload: CreateAvaliacaoTecnicaPayload) => {
      const { data, error } = await supabase
        .from("avaliacoes_tecnicas")
        .insert({
          ...payload,
          avaliador_id: profile?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AvaliacaoTecnica;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["avaliacoes_tecnicas", data.colaborador_id] });
    },
  });
}

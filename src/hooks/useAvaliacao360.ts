import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  CicloAvaliacao,
  Avaliacao360,
  RespostaAvaliacao,
  ResultadoFinal360,
} from "@/types/avaliacao360";

// ─── Ciclos ───────────────────────────────────────────────────────────────────

export function useCiclos(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["ciclos_avaliacao", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("ciclos_avaliacao")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CicloAvaliacao[];
    },
    enabled: !!organizationId,
  });
}

export function useCreateCiclo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<CicloAvaliacao, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("ciclos_avaliacao")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CicloAvaliacao;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ciclos_avaliacao", data.organization_id] });
    },
  });
}

export function useCloseCiclo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cicloId, organizationId }: { cicloId: string; organizationId: string }) => {
      // 1. Encerrar ciclo via RPC
      const { data: rpcResult, error: rpcErr } = await supabase
        .rpc("close_ciclo", { p_ciclo_id: cicloId });
      if (rpcErr) throw rpcErr;
      if (rpcResult?.error) throw new Error(rpcResult.error);

      // 2. Invocar Edge Function consolidate-360
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/consolidate-360`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ ciclo_id: cicloId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erro ${res.status} ao consolidar resultados`);
      }

      return { cicloId, organizationId };
    },
    onSuccess: ({ organizationId }) => {
      qc.invalidateQueries({ queryKey: ["ciclos_avaliacao", organizationId] });
      qc.invalidateQueries({ queryKey: ["resultado_final_360"] });
    },
  });
}

// ─── Avaliações ───────────────────────────────────────────────────────────────

export function useAvaliacoesPendentes(profileId: string | undefined) {
  return useQuery({
    queryKey: ["avaliacoes_360_pendentes", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("avaliacoes_360")
        .select("*, ciclo:ciclos_avaliacao(nome, data_fim, status, tipo)")
        .eq("avaliador_id", profileId)
        .eq("status", "pendente");
      if (error) throw error;
      // Filtrar apenas ciclos ativos no cliente (se ciclo for null, inclui também para não esconder)
      const all = (data ?? []) as (Avaliacao360 & { ciclo: Pick<CicloAvaliacao, "nome" | "data_fim" | "status" | "tipo"> | null })[];
      return all.filter((a) => !a.ciclo || a.ciclo.status === "ativo");
    },
    enabled: !!profileId,
  });
}

export function useAvaliacoesDoCiclo(cicloId: string | undefined) {
  return useQuery({
    queryKey: ["avaliacoes_360_ciclo", cicloId],
    queryFn: async () => {
      if (!cicloId) return [];
      const { data, error } = await supabase
        .from("avaliacoes_360")
        .select("*")
        .eq("ciclo_id", cicloId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Avaliacao360[];
    },
    enabled: !!cicloId,
  });
}

export function useSubmitAvaliacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      avaliacaoId,
      respostas,
      decisaoProbatorio,
    }: {
      avaliacaoId: string;
      respostas: {
        criterio: string;
        nota: number;
        comentario?: string | null;
        ponto_forte?: string | null;
        ponto_melhoria?: string | null;
      }[];
      decisaoProbatorio?: string | null;
    }) => {
      // Inserir respostas
      const { error: respErr } = await supabase
        .from("respostas_avaliacao_360")
        .insert(respostas.map((r) => ({ avaliacao_id: avaliacaoId, ...r })));
      if (respErr) throw respErr;

      // Atualizar status + decisão probatória se houver
      const updatePayload: Record<string, unknown> = {
        status: "concluido",
        data_resposta: new Date().toISOString(),
      };
      if (decisaoProbatorio) updatePayload.decisao_probatorio = decisaoProbatorio;

      const { error: updErr } = await supabase
        .from("avaliacoes_360")
        .update(updatePayload)
        .eq("id", avaliacaoId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avaliacoes_360_pendentes"] });
      qc.invalidateQueries({ queryKey: ["avaliacoes_360_ciclo"] });
    },
  });
}

// ─── Resultados ───────────────────────────────────────────────────────────────

export function useResultados(cicloId: string | undefined) {
  return useQuery({
    queryKey: ["resultado_final_360", cicloId],
    queryFn: async () => {
      if (!cicloId) return [];
      const { data, error } = await supabase
        .from("resultado_final_360")
        .select("*")
        .eq("ciclo_id", cicloId)
        .order("score_final", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ResultadoFinal360[];
    },
    enabled: !!cicloId,
  });
}

export function useResultadoDoColaborador(avaliado_id: string | undefined) {
  return useQuery({
    queryKey: ["resultado_final_360_colaborador", avaliado_id],
    queryFn: async () => {
      if (!avaliado_id) return [];
      const { data, error } = await supabase
        .from("resultado_final_360")
        .select("*, ciclo:ciclos_avaliacao(nome, data_inicio, data_fim)")
        .eq("avaliado_id", avaliado_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (ResultadoFinal360 & { ciclo: Pick<CicloAvaliacao, "nome" | "data_inicio" | "data_fim"> })[];
    },
    enabled: !!avaliado_id,
  });
}

export function useSaveFeedbackFinal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      resultadoId,
      feedbackFinal,
      updatedBy,
    }: {
      resultadoId: string;
      feedbackFinal: string;
      updatedBy: string;
    }) => {
      const { error } = await supabase
        .from("resultado_final_360")
        .update({
          feedback_final: feedbackFinal,
          feedback_updated_at: new Date().toISOString(),
          feedback_updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", resultadoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resultado_final_360"] });
      qc.invalidateQueries({ queryKey: ["resultado_final_360_colaborador"] });
    },
  });
}

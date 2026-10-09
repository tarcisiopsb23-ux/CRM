import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDynamicClient } from "@/hooks/useDynamicClient";

export interface CrmPipelineStage {
  id: string;
  client_id: string;
  name: string;
  order: number;
  color: string;
  created_at: string;
}

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

export const DEFAULT_STAGES: Array<Omit<CrmPipelineStage, "id" | "created_at">> = [
  { client_id: "", name: "Leads",        order: 0, color: "#6366f1" },
  { client_id: "", name: "Qualificados", order: 1, color: "#3b82f6" },
  { client_id: "", name: "Proposta",     order: 2, color: "#f59e0b" },
  { client_id: "", name: "Negociação",   order: 3, color: "#ec4899" },
  { client_id: "", name: "Ganhos",       order: 4, color: "#10b981" },
];

export function useCrmPipeline(clientId: string | undefined) {
  const dc = useDynamicClient();
  const qc = useQueryClient();
  const stagesQk = ["crm_pipeline_stages", clientId];
  const dealsQk  = ["crm_deals", clientId];

  // ── Stages ────────────────────────────────────────────────────────────────

  const stagesQuery = useQuery<CrmPipelineStage[]>({
    queryKey: stagesQk,
    queryFn: async () => {
      if (!dc || !clientId) return [];
      const { data, error } = await dc
        .from("crm_pipeline_stages")
        .select("*")
        .order("order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmPipelineStage[];
    },
    enabled: !!dc && !!clientId,
    staleTime: 60_000,
  });

  const createStage = useMutation({
    mutationFn: async (input: { client_id: string; name: string; order: number; color?: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_pipeline_stages")
        .insert({ ...input, color: input.color ?? "#6366f1" })
        .select()
        .single();
      if (error) throw error;
      return data as CrmPipelineStage;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stagesQk }),
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmPipelineStage> & { id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_pipeline_stages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stagesQk }),
  });

  const removeStage = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      // Move deals órfãos para null antes de deletar
      await dc.from("crm_deals").update({ stage_id: null }).eq("stage_id", id);
      const { error } = await dc.from("crm_pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stagesQk });
      qc.invalidateQueries({ queryKey: dealsQk });
    },
  });

  /** Seed estágios padrão se a tabela estiver vazia para este cliente */
  const seedDefaultStages = useMutation({
    mutationFn: async (cid: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { count } = await dc
        .from("crm_pipeline_stages")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) > 0) return; // já tem estágios
      const payload = DEFAULT_STAGES.map((s, i) => ({ ...s, client_id: cid, order: i }));
      const { error } = await dc.from("crm_pipeline_stages").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stagesQk }),
  });

  // ── Deals ─────────────────────────────────────────────────────────────────

  const dealsQuery = useQuery<CrmDeal[]>({
    queryKey: dealsQk,
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
      client_id: string;
      stage_id: string;
      title?: string;
      contact_id?: string | null;
      product_id?: string | null;
      value?: number;
    }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data, error } = await dc
        .from("crm_deals")
        .insert({ ...input, status: "open", value: input.value ?? 0 })
        .select()
        .single();
      if (error) throw error;
      return data as CrmDeal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsQk }),
  });

  const moveDeal = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").update({ stage_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsQk }),
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmDeal> & { id: string }) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsQk }),
  });

  const removeDeal = useMutation({
    mutationFn: async (id: string) => {
      if (!dc) throw new Error("Banco não conectado");
      const { error } = await dc.from("crm_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealsQk }),
  });

  const stagesData = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  const dealsData  = useMemo(() => dealsQuery.data  ?? [], [dealsQuery.data]);

  return {
    stages: stagesData,
    stagesLoading: stagesQuery.isLoading,
    deals: dealsData,
    dealsLoading: dealsQuery.isLoading,
    createStage, updateStage, removeStage, seedDefaultStages,
    createDeal, moveDeal, updateDeal, removeDeal,
  };
}

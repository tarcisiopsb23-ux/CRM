import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EmployeeEvaluation } from "@/types/hr";

export function useEmployeeEvaluations(collaboratorId: string | undefined) {
  return useQuery({
    queryKey: ["employee_evaluations", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("employee_evaluations")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmployeeEvaluation[];
    },
    enabled: !!collaboratorId,
  });
}

interface CreateEmployeeEvaluationPayload {
  organization_id: string;
  collaborator_id: string;
  periodo: string;
  produtividade: number;
  qualidade: number;
  pontualidade: number;
  comportamento: number;
  feedback?: string | null;
}

export function useCreateEmployeeEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateEmployeeEvaluationPayload) => {
      const nota_final =
        (payload.produtividade + payload.qualidade + payload.pontualidade + payload.comportamento) / 4;
      const { data, error } = await supabase
        .from("employee_evaluations")
        .insert({ ...payload, nota_final })
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeEvaluation;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["employee_evaluations", variables.collaborator_id] });
    },
  });
}

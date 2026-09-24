import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EmployeeTraining, TrainingStatus } from "@/types/hr";

export function useEmployeeTrainings(collaboratorId: string | undefined) {
  return useQuery({
    queryKey: ["employee_trainings", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("employee_trainings")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("data", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as EmployeeTraining[];
    },
    enabled: !!collaboratorId,
  });
}

interface CreateEmployeeTrainingPayload {
  organization_id: string;
  collaborator_id: string;
  nome_treinamento: string;
  data?: string | null;
  data_fim?: string | null;
  observacao?: string | null;
  status?: TrainingStatus;
  resultado?: string | null;
}

export function useCreateEmployeeTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateEmployeeTrainingPayload) => {
      const { data, error } = await supabase
        .from("employee_trainings")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeTraining;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["employee_trainings", variables.collaborator_id] });
    },
  });
}

interface UpdateTrainingStatusPayload {
  id: string;
  status: TrainingStatus;
  resultado?: string | null;
}

export function useUpdateTrainingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resultado }: UpdateTrainingStatusPayload) => {
      const { data, error } = await supabase
        .from("employee_trainings")
        .update({ status, resultado })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeTraining;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_trainings"] });
    },
  });
}

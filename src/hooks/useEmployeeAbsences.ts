import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EmployeeAbsence, AbsenceTipo, AbsenceStatus } from "@/types/hr";

export function useEmployeeAbsences(collaboratorId: string | undefined) {
  return useQuery({
    queryKey: ["employee_absences", collaboratorId],
    queryFn: async () => {
      if (!collaboratorId) return [];
      const { data, error } = await supabase
        .from("employee_absences")
        .select("*")
        .eq("collaborator_id", collaboratorId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmployeeAbsence[];
    },
    enabled: !!collaboratorId,
  });
}

interface CreateEmployeeAbsencePayload {
  organization_id: string;
  collaborator_id: string;
  tipo: AbsenceTipo;
  data_inicio: string;
  data_fim: string;
  status?: AbsenceStatus;
  observacao?: string | null;
}

export function useCreateEmployeeAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateEmployeeAbsencePayload) => {
      const { data, error } = await supabase
        .from("employee_absences")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeAbsence;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["employee_absences", variables.collaborator_id] });
    },
  });
}

interface UpdateAbsenceStatusPayload {
  id: string;
  status: AbsenceStatus;
}

export function useUpdateAbsenceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: UpdateAbsenceStatusPayload) => {
      const { data, error } = await supabase
        .from("employee_absences")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeAbsence;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_absences"] });
    },
  });
}

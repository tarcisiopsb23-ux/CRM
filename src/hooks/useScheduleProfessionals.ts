/**
 * useScheduleProfessionals — Gerencia profissionais/atendentes da Agenda.
 *
 * Profissionais são opcionais — controlados por show_professionals
 * em AgendaDisplayConfig. Quando ativados, aparecem no formulário
 * público /booking/:slug para o cliente escolher com quem agendar.
 *
 * Exemplos: médico, nutricionista, advogado, personal trainer, etc.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ScheduleProfessional {
  id: string;
  client_id: string;
  organization_id: string;
  name: string;
  role: string | null;       // cargo/especialidade
  bio: string | null;        // descrição curta
  avatar_url: string | null; // foto
  color: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleProfessionalInput {
  name: string;
  role?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  color?: string;
  active?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScheduleProfessionals() {
  const { auth } = useClientAuth();
  const dc       = useDynamicClient();
  const clientId = auth?.id;
  const orgId    = auth?.organization_id;
  const qc       = useQueryClient();
  const qk       = ["schedule_professionals", clientId];

  const query = useQuery<ScheduleProfessional[]>({
    queryKey: qk,
    queryFn: async () => {
      if (!clientId || !dc) return [];
      const { data, error } = await dc
        .from("client_schedule_professionals")
        .select("*")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ScheduleProfessional[];
    },
    enabled:   !!clientId && !!dc,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: async (input: ScheduleProfessionalInput) => {
      if (!clientId || !dc || !orgId) throw new Error("Sem client_id");
      const { error } = await dc
        .from("client_schedule_professionals")
        .insert({
          client_id:       clientId,
          organization_id: orgId,
          color:           "#6366f1",
          active:          true,
          ...input,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: ScheduleProfessionalInput & { id: string }) => {
      if (!clientId || !dc) throw new Error("Sem client_id");
      const { error } = await dc
        .from("client_schedule_professionals")
        .update(patch)
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!clientId || !dc) throw new Error("Sem client_id");
      const { error } = await dc
        .from("client_schedule_professionals")
        .delete()
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!clientId || !dc) throw new Error("Sem client_id");
      const { error } = await dc
        .from("client_schedule_professionals")
        .update({ active })
        .eq("id", id)
        .eq("client_id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return {
    professionals:        query.data ?? [],
    professionalsLoading: query.isLoading,
    create,
    update,
    remove,
    toggle,
  };
}

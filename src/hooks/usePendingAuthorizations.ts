import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";

export interface PendingAuthorization {
  id: string;
  organization_id: string;
  requested_by: string;
  requested_at: string;
  action_title: string;
  action_description: string;
  module: string;
  status: "pendente" | "aprovado" | "rejeitado" | "cancelado" | "expirado";
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  expires_at: string;
  created_at: string;
  requester_name?: string | null;
  resolver_name?: string | null;
}

const QK = (orgId: string | undefined) => ["pending_authorizations", orgId];

/** Retorna true se o erro indica que a tabela ainda não existe (migration pendente) */
function isTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  return e["code"] === "42P01" || e["status"] === 404 || String(e["message"] ?? "").includes("does not exist");
}

export function usePendingAuthorizations() {
  const orgId = useOrganization();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QK(orgId),
    queryFn: async () => {
      if (!orgId) return [] as PendingAuthorization[];
      const { data, error } = await supabase
        .from("pending_authorizations")
        .select(`*, requester:profiles!requested_by(full_name), resolver:profiles!resolved_by(full_name)`)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);
      // Tabela ainda não existe (migration pendente) — retorna vazio silenciosamente
      if (error) {
        if (isTableMissing(error)) return [] as PendingAuthorization[];
        throw error;
      }
      return (data ?? []).map((r) => ({
        ...(r as unknown as PendingAuthorization),
        requester_name: ((r as Record<string, unknown>).requester as { full_name?: string } | null)?.full_name ?? null,
        resolver_name: ((r as Record<string, unknown>).resolver as { full_name?: string } | null)?.full_name ?? null,
      })) as PendingAuthorization[];
    },
    enabled: !!orgId,
    refetchInterval: 15_000,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async (input: { action_title: string; action_description: string; module?: string }) => {
      if (!orgId) throw new Error("Sem organização");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .from("pending_authorizations")
        .insert({
          organization_id: orgId,
          requested_by: user.id,
          action_title: input.action_title,
          action_description: input.action_description,
          module: input.module ?? "geral",
        })
        .select()
        .single();
      if (error) throw error;
      return data as PendingAuthorization;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(orgId) }),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pending_authorizations")
        .update({ status: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(orgId) }),
  });

  const approve = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      const { data: valid } = await supabase.rpc("verify_manager_pin", { p_pin: pin });
      if (!valid) throw new Error("PIN incorreto.");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pending_authorizations")
        .update({ status: "aprovado", resolved_by: user?.id, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pendente");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(orgId) }),
  });

  const reject = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pending_authorizations")
        .update({ status: "rejeitado", resolved_by: user?.id, resolved_at: new Date().toISOString(), resolution_note: note ?? null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pendente");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(orgId) }),
  });

  const pending = (query.data ?? []).filter(a => a.status === "pendente");

  return { ...query, pending, create, cancel, approve, reject };
}

export function useWaitForApproval(
  authorizationId: string | null,
  onApproved: () => void,
  onRejected: () => void
) {
  const orgId = useOrganization();

  useQuery({
    queryKey: ["pending_auth_wait", authorizationId],
    queryFn: async () => {
      if (!authorizationId) return null;
      const { data, error } = await supabase
        .from("pending_authorizations")
        .select("status")
        .eq("id", authorizationId)
        .single();
      if (error) {
        if (isTableMissing(error)) return null;
        return null;
      }
      if (data?.status === "aprovado") onApproved();
      if (data?.status === "rejeitado" || data?.status === "cancelado" || data?.status === "expirado") onRejected();
      return data;
    },
    enabled: !!authorizationId && !!orgId,
    refetchInterval: 3_000,
    retry: false,
  });
}

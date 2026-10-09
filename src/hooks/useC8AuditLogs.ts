import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface C8AuditLog {
  id: string;
  organization_id: string;
  client_id: string | null;
  client_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UseC8AuditLogsParams {
  organizationId: string | undefined;
  clientId?: string;
  action?: string;
  userSearch?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export function useC8AuditLogs({
  organizationId,
  clientId,
  action,
  userSearch,
  dateFrom,
  dateTo,
  limit = 300,
}: UseC8AuditLogsParams) {
  const query = useQuery<C8AuditLog[]>({
    queryKey: [
      "c8_audit_logs",
      organizationId,
      clientId,
      action,
      userSearch,
      dateFrom,
      dateTo,
      limit,
    ],
    queryFn: async () => {
      if (!organizationId) return [];

      let q = supabase
        .from("c8_audit_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (clientId)   q = q.eq("client_id", clientId);
      if (action)     q = q.eq("action", action);
      if (dateFrom)   q = q.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo)     q = q.lte("created_at", `${dateTo}T23:59:59`);
      if (userSearch) q = q.ilike("user_name", `%${userSearch}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as C8AuditLog[];
    },
    enabled: !!organizationId,
    staleTime: 15_000,
  });

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

// ── Helper: insere um log de auditoria ───────────────────────────────────────
// Usado pelas mutations de useC8TenantActions. Fire-and-forget — nunca lança erro.

export async function insertC8AuditLog(params: {
  organizationId: string;
  clientId?: string;
  clientName?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  action: string;
  entity?: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from("c8_audit_logs").insert({
      organization_id: params.organizationId,
      client_id:       params.clientId       ?? null,
      client_name:     params.clientName     ?? null,
      user_id:         params.userId         ?? null,
      user_name:       params.userName       ?? null,
      user_role:       params.userRole       ?? null,
      action:          params.action,
      entity:          params.entity         ?? "client",
      entity_id:       params.entityId       ?? params.clientId ?? null,
      description:     params.description,
      metadata:        params.metadata       ?? {},
    });
  } catch (err) {
    // Log de auditoria nunca deve bloquear a operação principal
    console.warn("[c8_audit_logs] Falha ao inserir log:", err);
  }
}

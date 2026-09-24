/**
 * Hook para chamar o c8-data-proxy do Maestr.ia.
 * A Edge Function c8-data-proxy consulta diretamente o Banco B de cada cliente
 * usando as credenciais individuais salvas em clients.client_supabase_service_key.
 *
 * Não usa mais crm-data-api externa, CRM_DATA_API_URL, CRM_API_KEY.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Chama o c8-data-proxy via supabase.functions.invoke */
export async function callC8DataApi(
  _organizationId: string,  // mantido para compatibilidade de assinatura
  action: string,
  tenantId?: string
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("c8-data-proxy", {
    body: { action, tenant_id: tenantId ?? null },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  console.log(`[C8DataApi] action=${action} tenant_id=${tenantId ?? "—"} response:`, data);
  return data;
}

/** Hook para buscar usuários de um tenant do C8 Control (Banco B) */
export function useC8TenantUsers(organizationId: string | undefined, tenantId: string | undefined) {
  return useQuery({
    queryKey: ["c8_tenant_users", organizationId, tenantId],
    queryFn: async () => {
      if (!organizationId || !tenantId) return [];
      const data = await callC8DataApi(organizationId, "users", tenantId) as { users?: unknown[] };
      return data?.users ?? [];
    },
    enabled: !!organizationId && !!tenantId,
    staleTime: 30_000,
  });
}

/** Hook para buscar resumo de todos os tenants */
export function useC8AllTenantsSummary(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["c8_all_tenants_summary", organizationId],
    queryFn: async () => {
      if (!organizationId) return {};
      try {
        const data = await callC8DataApi(organizationId, "all_tenants_summary") as {
          tenants?: Array<{ tenant_id: string; active_users: number; total_users: number }>;
        };
        const map: Record<string, { active_users: number; total_users: number }> = {};
        for (const t of data?.tenants ?? []) {
          map[t.tenant_id] = { active_users: t.active_users, total_users: t.total_users };
        }
        return map;
      } catch {
        return {};
      }
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

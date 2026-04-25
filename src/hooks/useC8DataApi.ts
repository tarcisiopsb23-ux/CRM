/**
 * Hook para chamar a crm-data-api do C8 Control diretamente do frontend.
 * As credenciais (URL + API key) são lidas da tabela organization_integrations
 * via RLS — sem passar por edge function, eliminando o problema de ES256.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface C8ControlConfig {
  crmDataApiUrl?: string;
  crmApiKey?: string;
  c8AnonKey?: string;  // anon key do Supabase do C8 Control (para o gateway)
}

/** Busca as credenciais da integração C8 Control do banco */
async function getC8Credentials(organizationId: string): Promise<C8ControlConfig | null> {
  const { data } = await supabase
    .from("organization_integrations")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("integration_type", "c8control")
    .maybeSingle();
  return (data?.config as C8ControlConfig) ?? null;
}

/** Chama a crm-data-api do C8 Control com as credenciais do banco */
export async function callC8DataApi(
  organizationId: string,
  action: string,
  tenantId?: string
): Promise<unknown> {
  const creds = await getC8Credentials(organizationId);
  if (!creds?.crmDataApiUrl || !creds?.crmApiKey) {
    throw new Error("Credenciais da crm-data-api não configuradas. Configure em Configurações → C8 Control.");
  }

  const url = new URL(creds.crmDataApiUrl);
  url.searchParams.set("action", action);
  if (tenantId) url.searchParams.set("tenant_id", tenantId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-crm-api-key": creds.crmApiKey,
      "Content-Type": "application/json",
      // O gateway do Supabase exige Authorization ou apikey.
      // Usamos o anon key do C8 Control se disponível, senão o próprio crmApiKey como Bearer.
      ...(creds.c8AnonKey
        ? { "apikey": creds.c8AnonKey, "Authorization": `Bearer ${creds.c8AnonKey}` }
        : { "Authorization": `Bearer ${creds.crmApiKey}` }
      ),
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status} na crm-data-api`);
  console.log(`[C8DataApi] action=${action} tenant_id=${tenantId ?? "—"} response:`, data);
  return data;
}

/** Hook para buscar usuários de um tenant do C8 Control */
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

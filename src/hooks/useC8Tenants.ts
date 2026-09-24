import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { callC8DataApi } from "@/hooks/useC8DataApi";
import type { SubscriptionStatus } from "@/lib/crmModules";

export interface C8Tenant {
  client_id: string;
  client_name: string;
  plan_name: string;
  plan_value: number;
  max_users: number;
  due_day: number;
  subscription_status: SubscriptionStatus;
  contract_start: string | null;
  contract_end: string | null;
  primary_user_email: string | null;
  notes: string | null;
  suspended_at: string | null;
  blocked_reason: string | null;
  active_users_count: number;
  total_users_count: number;
  c8_control_enabled: boolean;
  // Campos do Banco B
  client_supabase_url: string | null;
  client_supabase_anon_key: string | null;
  client_supabase_service_key_set: boolean;
  client_supabase_email_set: boolean;
  client_supabase_password_set: boolean;
  dashboard_slug: string | null;
  // Acesso gratuito
  c8_free_access: boolean;
  free_access_until: string | null;
  free_access_reason: string | null;
  // Schema
  c8_schema_updated_at: string | null;
}

export function useC8Tenants(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["c8_tenants", organizationId],
    queryFn: async (): Promise<C8Tenant[]> => {
      if (!organizationId) return [];

      // Query 1: clients + crm_client_plans
      const { data: plans, error: plansError } = await supabase
        .from("crm_client_plans")
        .select(`
          client_id,
          plan_name,
          plan_value,
          max_users,
          due_day,
          subscription_status,
          contract_start,
          contract_end,
          primary_user_email,
          notes,
          suspended_at,
          blocked_reason,
          c8_free_access,
          free_access_until,
          free_access_reason,
          c8_schema_updated_at,
          clients!inner (
            id,
            name,
            c8_control_enabled,
            organization_id,
            client_supabase_url,
            client_supabase_anon_key,
            client_supabase_service_key_set,
            client_supabase_email_set,
            client_supabase_password_set,
            dashboard_slug
          )
        `)
        .eq("clients.organization_id", organizationId)
        .eq("clients.c8_control_enabled", true);

      if (plansError) throw plansError;
      if (!plans || plans.length === 0) return [];

      // Query 2: contagem local do Banco A (fallback) — excluindo suporte
      const [localUsersResult] = await Promise.all([
        supabase
          .from("crm_client_users")
          .select("client_id, active, email, last_access_at, is_support")
          .in("client_id", plans.map(p => p.client_id))
          .eq("is_support", false),
      ]);

      // Fallback local — conta por client_id excluindo suporte
      const localTotalMap: Record<string, number> = {};
      const localActiveMap: Record<string, number> = {};

      for (const u of localUsersResult.data ?? []) {
        localTotalMap[u.client_id] = (localTotalMap[u.client_id] ?? 0) + 1;
        // Ativo = já fez primeiro login (last_access_at preenchido)
        if (u.last_access_at) {
          localActiveMap[u.client_id] = (localActiveMap[u.client_id] ?? 0) + 1;
        }
      }

      // Query 3: contagem do Banco B (fonte de verdade) via c8-data-proxy
      // Sobrepõe o Banco A quando disponível. Falha silenciosa — usa fallback local.
      const bankBCountMap: Record<string, { active: number; total: number }> = {};
      try {
        const summary = await callC8DataApi(organizationId, "all_tenants_summary") as {
          tenants?: Array<{ tenant_id: string; active_users: number; total_users: number }>;
        };
        for (const t of summary?.tenants ?? []) {
          bankBCountMap[t.tenant_id] = { active: t.active_users, total: t.total_users };
        }
      } catch {
        // Banco B indisponível — usa contagem local do Banco A
      }

      return plans.map((p) => {
        const client = p.clients as unknown as {
          id: string;
          name: string;
          c8_control_enabled: boolean;
          client_supabase_url: string | null;
          client_supabase_anon_key: string | null;
          client_supabase_service_key_set: boolean;
          client_supabase_email_set: boolean;
          client_supabase_password_set: boolean;
          dashboard_slug: string | null;
        };

        // Usa Banco B se disponível, senão Banco A como fallback
        const bankB = bankBCountMap[p.client_id];
        const activeCount = bankB !== undefined ? bankB.active : (localActiveMap[p.client_id] ?? 0);
        const totalCount  = bankB !== undefined ? bankB.total  : (localTotalMap[p.client_id]  ?? 0);
        const planAny = p as any;

        return {
          client_id: p.client_id,
          client_name: client?.name ?? "",
          plan_name: p.plan_name ?? "Starter",
          plan_value: p.plan_value ?? 0,
          max_users: p.max_users ?? 1,
          due_day: p.due_day ?? 1,
          subscription_status: (p.subscription_status ?? "ativo") as SubscriptionStatus,
          contract_start: p.contract_start ?? null,
          contract_end: p.contract_end ?? null,
          primary_user_email: p.primary_user_email ?? null,
          notes: p.notes ?? null,
          suspended_at: p.suspended_at ?? null,
          blocked_reason: p.blocked_reason ?? null,
          active_users_count: activeCount,
          total_users_count: totalCount,
          c8_control_enabled: client?.c8_control_enabled ?? true,
          // Campos do Banco B
          client_supabase_url: client?.client_supabase_url ?? null,
          client_supabase_anon_key: client?.client_supabase_anon_key ?? null,
          client_supabase_service_key_set: client?.client_supabase_service_key_set ?? false,
          client_supabase_email_set: client?.client_supabase_email_set ?? false,
          client_supabase_password_set: client?.client_supabase_password_set ?? false,
          dashboard_slug: client?.dashboard_slug ?? null,
          // Acesso gratuito
          c8_free_access: planAny.c8_free_access ?? false,
          free_access_until: planAny.free_access_until ?? null,
          free_access_reason: planAny.free_access_reason ?? null,
          // Schema
          c8_schema_updated_at: planAny.c8_schema_updated_at ?? null,
        };
      });
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });
}

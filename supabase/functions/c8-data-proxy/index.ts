/**
 * Edge Function: c8-data-proxy
 * Projeto: Maestr.ia
 *
 * Consulta dados diretamente no Banco B do cliente identificado por tenant_id.
 * Substitui o proxy para a crm-data-api centralizada do C8 Control.
 *
 * Não usa mais CRM_DATA_API_URL, CRM_API_KEY.
 *
 * Actions suportadas:
 *   users           — lista usuários ativos (crm_users, excluindo is_support)
 *   all_tenants_summary — resumo de todos os tenants da organização
 *
 * Body: { action: string, tenant_id?: string }
 *
 * Secrets necessários:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Banco A (injetados automaticamente)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const jwt = authHeader.replace("Bearer ", "").trim();
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      userId = payload.sub ?? null;
    } catch { return json({ error: "Token inválido" }, 401); }
    if (!userId) return json({ error: "Token sem sub" }, 401);

    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: profile } = await maestriaAdmin
      .from("profiles").select("role, organization_id").eq("id", userId).single();
    if (!["owner", "admin"].includes(profile?.role ?? ""))
      return json({ error: "Apenas owner/admin" }, 403);

    const orgId = profile.organization_id as string;

    let action: string | null = null;
    let tenantId: string | null = null;
    try {
      const b = await req.json();
      action   = b?.action ?? null;
      tenantId = b?.tenant_id ?? null;
    } catch { return json({ error: "Body JSON inválido" }, 400); }

    if (!action) return json({ error: "Parâmetro 'action' é obrigatório" }, 400);

    // ── Helper: busca credenciais do Banco B de um cliente ────────────────────
    async function getClientBankB(clientId: string) {
      const { data, error } = await maestriaAdmin
        .from("clients")
        .select("client_supabase_url, client_supabase_service_key, client_supabase_anon_key")
        .eq("id", clientId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error || !data) return null;
      const url    = (data as Record<string, unknown>).client_supabase_url as string | null;
      const svcKey = (data as Record<string, unknown>).client_supabase_service_key as string | null;
      if (!url || !svcKey) return null;
      return createClient(url, svcKey, { auth: { persistSession: false } });
    }

    // ── action: users ─────────────────────────────────────────────────────────
    if (action === "users") {
      if (!tenantId) return json({ error: "tenant_id é obrigatório para action=users" }, 400);

      const bankB = await getClientBankB(tenantId);
      if (!bankB) return json({ users: [], count: 0, tenant_id: tenantId });

      // Tenta com filtro is_support; se a coluna não existir (banco legado), faz sem o filtro
      let users: Record<string, unknown>[] = [];
      const { data: usersWithFilter, error: errWithFilter } = await bankB
        .from("crm_users")
        .select("id, email, full_name, role, active, is_support, last_seen_at, created_at")
        .eq("active", true)
        .neq("is_support", true)
        .order("created_at", { ascending: true });

      if (errWithFilter) {
        // Coluna is_support não existe — banco legado, busca sem filtro
        // O frontend filtrará pelo email quando necessário
        console.warn("[c8-data-proxy] is_support não existe, usando fallback sem filtro:", errWithFilter.message);
        const { data: fallbackUsers, error: fallbackErr } = await bankB
          .from("crm_users")
          .select("id, email, full_name, role, active, last_seen_at, created_at")
          .eq("active", true)
          .order("created_at", { ascending: true });
        if (fallbackErr) {
          console.error("[c8-data-proxy] crm_users fallback error:", fallbackErr);
          return json({ users: [], count: 0, tenant_id: tenantId });
        }
        users = (fallbackUsers ?? []) as Record<string, unknown>[];
      } else {
        users = (usersWithFilter ?? []) as Record<string, unknown>[];
      }

      const mapped = users.map((u) => ({
        id:             u.id,
        user_id:        u.id,
        email:          u.email,
        name:           u.full_name ?? null,
        role:           u.role,
        active:         u.active,
        is_support:     u.is_support ?? false,
        last_access_at: u.last_seen_at ?? null,
        created_at:     u.created_at,
      }));

      return json({ users: mapped, count: mapped.length, tenant_id: tenantId });
    }

    // ── action: all_tenants_summary ───────────────────────────────────────────
    // Consulta o Banco B de cada cliente para obter a contagem real de usuários.
    // Faz as consultas em paralelo (batches de 5) para não sobrecarregar.
    if (action === "all_tenants_summary") {
      const { data: plans } = await maestriaAdmin
        .from("crm_client_plans")
        .select("client_id")
        .eq("organization_id", orgId)
        .neq("subscription_status", "cancelado");

      const clientIds = (plans ?? []).map((p: { client_id: string }) => p.client_id);
      if (!clientIds.length) return json({ tenants: [] });

      // Busca credenciais de todos os clientes de uma vez
      const { data: clients } = await maestriaAdmin
        .from("clients")
        .select("id, client_supabase_url, client_supabase_service_key")
        .in("id", clientIds);

      const credMap = new Map<string, { url: string; key: string }>();
      for (const c of clients ?? []) {
        const url = (c as Record<string, unknown>).client_supabase_url as string | null;
        const key = (c as Record<string, unknown>).client_supabase_service_key as string | null;
        if (url && key) credMap.set(c.id, { url, key });
      }

      // Consulta Banco B de cada cliente em paralelo (batches de 5)
      const BATCH = 5;
      const results: Array<{ tenant_id: string; active_users: number; total_users: number }> = [];

      for (let i = 0; i < clientIds.length; i += BATCH) {
        const batch = clientIds.slice(i, i + BATCH);
        const batchResults = await Promise.allSettled(
          batch.map(async (clientId: string) => {
            const creds = credMap.get(clientId);
            if (!creds) {
              // Sem Banco B configurado — fallback para crm_client_users do Banco A
              const { count } = await maestriaAdmin
                .from("crm_client_users")
                .select("id", { count: "exact", head: true })
                .eq("client_id", clientId)
                .eq("active", true)
                .eq("is_support", false);
              const total = count ?? 0;
              return { tenant_id: clientId, active_users: total, total_users: total };
            }

            const bankB = createClient(creds.url, creds.key, { auth: { persistSession: false } });

            // Tenta contar excluindo is_support; fallback para contagem total se coluna não existir
            let activeCount: number | null = null;
            let totalCount: number | null = null;

            const { count: ac, error: acErr } = await bankB
              .from("crm_users")
              .select("id", { count: "exact", head: true })
              .eq("active", true)
              .neq("is_support", true);

            if (acErr) {
              // Coluna is_support não existe — banco legado
              const { count: acFallback } = await bankB
                .from("crm_users")
                .select("id", { count: "exact", head: true })
                .eq("active", true);
              activeCount = acFallback ?? 0;
              totalCount  = acFallback ?? 0;
            } else {
              activeCount = ac ?? 0;
              const { count: tc } = await bankB
                .from("crm_users")
                .select("id", { count: "exact", head: true })
                .neq("is_support", true);
              totalCount = tc ?? 0;
            }

            return {
              tenant_id:    clientId,
              active_users: activeCount,
              total_users:  totalCount,
            };
          })
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          }
        }
      }

      return json({ tenants: results });
    }

    return json({ error: `action "${action}" não suportada` }, 400);

  } catch (err) {
    console.error("[c8-data-proxy]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});

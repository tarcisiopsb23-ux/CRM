/**
 * Edge Function: crm-data-api
 *
 * API segura para o Maestr.IA consultar dados do C8 Control.
 * Autenticação: header x-crm-api-key
 *
 * Endpoints (GET via query string):
 *   ?action=users&tenant_id=<uuid>          — todos os usuários do tenant (admin + convidados)
 *   ?action=user_count&tenant_id=<uuid>     — contagem atual vs limite do plano
 *   ?action=audit_logs&tenant_id=<uuid>     — logs de auditoria
 *   ?action=all_tenants_summary             — resumo de todos os tenants
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-crm-api-key, content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const apiKey = req.headers.get("x-crm-api-key");
  if (!apiKey || apiKey !== Deno.env.get("CRM_API_KEY")) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const url      = new URL(req.url);
  const action   = url.searchParams.get("action");
  const tenantId = url.searchParams.get("tenant_id");
  const limit    = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
  const dateFrom = url.searchParams.get("date_from");

  if (!action) return jsonResponse({ error: "action é obrigatório" }, 400);

  // ── users: todos os usuários do tenant (admin + convidados) ───────────────
  if (action === "users") {
    if (!tenantId) return jsonResponse({ error: "tenant_id é obrigatório" }, 400);

    // 1. Buscar registros de tenant_users
    const { data: tuRows, error: tuErr } = await supabase
      .from("tenant_users")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (tuErr) return jsonResponse({ error: tuErr.message }, 500);

    // 2. Buscar todos os usuários do auth de uma vez (mais eficiente que getUserById em loop)
    const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authMap = new Map((authList?.users ?? []).map((u: any) => [u.id, u]));

    // 3. IDs já em tenant_users
    const tuIds = new Set((tuRows ?? []).map((u: any) => u.user_id));

    // 4. Usuários com tenant_id no user_metadata mas não em tenant_users
    //    (usuário principal criado antes da tabela existir, ou em migração)
    const extraFromAuth = (authList?.users ?? []).filter((u: any) => {
      const meta = u.user_metadata ?? {};
      return meta.tenant_id === tenantId && !tuIds.has(u.id);
    });

    const users = [
      // Usuários de tenant_users
      ...(tuRows ?? []).map((u: any) => {
        const a = authMap.get(u.user_id) as any;
        return {
          id:             u.user_id,
          email:          a?.email ?? null,
          name:           a?.user_metadata?.name ?? a?.email ?? null,
          role:           u.role,
          active:         a?.banned_until == null,
          last_access_at: a?.last_sign_in_at ?? null,
          created_at:     u.created_at,
          source:         "tenant_users",
        };
      }),
      // Usuários encontrados via auth.users mas não em tenant_users
      ...extraFromAuth.map((u: any) => ({
        id:             u.id,
        email:          u.email ?? null,
        name:           u.user_metadata?.name ?? u.email ?? null,
        role:           u.user_metadata?.role ?? "admin",
        active:         u.banned_until == null,
        last_access_at: u.last_sign_in_at ?? null,
        created_at:     u.created_at,
        source:         "auth_metadata",
      })),
    ];

    return jsonResponse({ tenant_id: tenantId, users, count: users.length });
  }

  // ── user_count: contagem atual vs limite ──────────────────────────────────
  if (action === "user_count") {
    if (!tenantId) return jsonResponse({ error: "tenant_id é obrigatório" }, 400);

    const { count, error } = await supabase
      .from("tenant_users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (error) return jsonResponse({ error: error.message }, 500);

    const { data: cache } = await supabase
      .from("tenant_config_cache")
      .select("max_users, plan_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    return jsonResponse({
      tenant_id:     tenantId,
      current_users: count ?? 0,
      max_users:     cache?.max_users ?? 3,
      plan_name:     cache?.plan_name ?? "Starter",
      at_limit:      (count ?? 0) >= (cache?.max_users ?? 3),
    });
  }

  // ── audit_logs: logs de auditoria do tenant ───────────────────────────────
  if (action === "audit_logs") {
    if (!tenantId) return jsonResponse({ error: "tenant_id é obrigatório" }, 400);

    let query = supabase
      .from("audit_logs")
      .select("id, user_email, user_role, action, category, entity_type, entity_id, details, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateFrom) query = query.gte("created_at", dateFrom);

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ tenant_id: tenantId, logs: data ?? [], count: (data ?? []).length });
  }

  // ── all_tenants_summary: resumo de todos os tenants ───────────────────────
  if (action === "all_tenants_summary") {
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, name, tenant_id")
      .not("tenant_id", "is", null);

    if (error) return jsonResponse({ error: error.message }, 500);

    const tenants = [];
    for (const c of clients ?? []) {
      const { count: total } = await supabase
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", c.tenant_id);

      const { data: cache } = await supabase
        .from("tenant_config_cache")
        .select("max_users, plan_name, status")
        .eq("tenant_id", c.tenant_id)
        .maybeSingle();

      tenants.push({
        tenant_id:    c.tenant_id,
        name:         c.name,
        active_users: total ?? 0,
        max_users:    cache?.max_users ?? 3,
        plan_name:    cache?.plan_name ?? "Starter",
        status:       cache?.status ?? "ativo",
      });
    }

    return jsonResponse({ tenants });
  }

  return jsonResponse({ error: `action inválida: ${action}` }, 400);
});

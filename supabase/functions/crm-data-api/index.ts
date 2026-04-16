/**
 * Edge Function: crm-data-api
 *
 * API segura para o Maestr.IA consultar dados do C8 Control.
 * Autenticação: header x-crm-api-key
 * CORS: Access-Control-Allow-Origin: * (chamada direta do browser do Maestr.IA)
 *
 * Endpoints (GET via query string):
 *   ?action=users&tenant_id=<uuid>
 *   ?action=user_count&tenant_id=<uuid>
 *   ?action=audit_logs&tenant_id=<uuid>
 *   ?action=all_tenants_summary
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
  // Responder ao preflight CORS com 200
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Autenticar via CRM_API_KEY
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

  // ── users ─────────────────────────────────────────────────────────────────
  // Formato esperado pelo Maestr.IA:
  // { users: [{ id, email, name, role, active, last_access_at, created_at }] }
  if (action === "users") {
    if (!tenantId) return jsonResponse({ error: "tenant_id é obrigatório" }, 400);

    const { data: tuRows, error } = await supabase
      .from("tenant_users")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) return jsonResponse({ error: error.message }, 500);

    const users = [];
    for (const u of tuRows ?? []) {
      const { data: authData } = await supabase.auth.admin.getUserById(u.user_id);
      const authUser = authData?.user;
      users.push({
        id:             u.user_id,
        email:          authUser?.email ?? null,
        name:           authUser?.user_metadata?.name ?? authUser?.email ?? null,
        role:           u.role,
        active:         authUser?.banned_until == null,
        last_access_at: authUser?.last_sign_in_at ?? null,
        created_at:     u.created_at,
      });
    }

    return jsonResponse({ users, count: users.length });
  }

  // ── user_count ────────────────────────────────────────────────────────────
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

  // ── audit_logs ────────────────────────────────────────────────────────────
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

    return jsonResponse({ logs: data ?? [], count: (data ?? []).length });
  }

  // ── all_tenants_summary ───────────────────────────────────────────────────
  // Formato esperado pelo Maestr.IA:
  // { tenants: [{ tenant_id, active_users, total_users }] }
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
        active_users: total ?? 0,          // usuários ativos (cadastrados)
        total_users:  cache?.max_users ?? 3, // limite do plano
        plan_name:    cache?.plan_name ?? "Starter",
        status:       cache?.status ?? "ativo",
      });
    }

    return jsonResponse({ tenants });
  }

  return jsonResponse({ error: `action inválida: ${action}` }, 400);
});

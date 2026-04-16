/**
 * Edge Function: crm-data-api
 *
 * API segura para o Maestr.IA consultar dados do C8 Control.
 * Autenticação: header x-crm-api-key
 *
 * Endpoints:
 *   GET ?action=users&tenant_id=xxx        — lista usuários do tenant
 *   GET ?action=audit_logs&tenant_id=xxx   — lista logs de auditoria do tenant
 *   GET ?action=user_count&tenant_id=xxx   — contagem de usuários
 *
 * O Maestr.IA usa isso para:
 * - Exibir usuários cadastrados por tenant no módulo gerencial
 * - Exibir audit logs por tenant
 * - Verificar uso atual vs limite do plano
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-api-key",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Autenticar via CRM_API_KEY
  const apiKey = req.headers.get("x-crm-api-key");
  if (!apiKey || apiKey !== Deno.env.get("CRM_API_KEY")) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const url = new URL(req.url);
  const action    = url.searchParams.get("action");
  const tenantId  = url.searchParams.get("tenant_id");
  const limit     = parseInt(url.searchParams.get("limit") ?? "100");
  const dateFrom  = url.searchParams.get("date_from");

  if (!action) return jsonResponse({ error: "action é obrigatório" }, 400);

  // ── users: lista usuários do tenant ──────────────────────────────────────
  if (action === "users") {
    if (!tenantId) return jsonResponse({ error: "tenant_id é obrigatório" }, 400);

    const { data, error } = await supabase
      .from("tenant_users")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) return jsonResponse({ error: error.message }, 500);

    // Enriquecer com e-mail do auth.users
    const userIds = (data ?? []).map((u: any) => u.user_id);
    const enriched = [];
    for (const u of data ?? []) {
      const { data: authUser } = await supabase.auth.admin.getUserById(u.user_id);
      enriched.push({
        user_id:    u.user_id,
        email:      authUser?.user?.email ?? null,
        role:       u.role,
        created_at: u.created_at,
      });
    }

    return jsonResponse({ tenant_id: tenantId, users: enriched, count: enriched.length });
  }

  // ── user_count: contagem rápida ───────────────────────────────────────────
  if (action === "user_count") {
    if (!tenantId) return jsonResponse({ error: "tenant_id é obrigatório" }, 400);

    const { count, error } = await supabase
      .from("tenant_users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (error) return jsonResponse({ error: error.message }, 500);

    // Ler limite do cache
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
      .limit(Math.min(limit, 500));

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ tenant_id: tenantId, logs: data ?? [], count: (data ?? []).length });
  }

  // ── all_tenants_summary: resumo de todos os tenants ───────────────────────
  if (action === "all_tenants_summary") {
    const { data: tenants, error } = await supabase
      .from("clients")
      .select("id, name, tenant_id, metadata")
      .not("tenant_id", "is", null);

    if (error) return jsonResponse({ error: error.message }, 500);

    const summary = [];
    for (const t of tenants ?? []) {
      const { count } = await supabase
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", t.tenant_id);

      const { data: cache } = await supabase
        .from("tenant_config_cache")
        .select("max_users, plan_name, status")
        .eq("tenant_id", t.tenant_id)
        .maybeSingle();

      summary.push({
        tenant_id:     t.tenant_id,
        name:          t.name,
        current_users: count ?? 0,
        max_users:     cache?.max_users ?? 3,
        plan_name:     cache?.plan_name ?? "Starter",
        status:        cache?.status ?? "ativo",
      });
    }

    return jsonResponse({ tenants: summary });
  }

  return jsonResponse({ error: `action inválida: ${action}` }, 400);
});

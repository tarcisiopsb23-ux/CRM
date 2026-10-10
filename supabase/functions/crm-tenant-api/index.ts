/**
 * Edge Function: crm-tenant-api
 * Projeto: Maestr.ia
 *
 * API segura consumida pelo C8 Control para verificar configurações de tenant.
 * Autenticação via header x-crm-api-key (secret compartilhado).
 *
 * Secrets necessários (supabase secrets set):
 *   CRM_API_KEY=<uuid-aleatorio-secreto>
 *
 * Endpoints:
 *   GET ?tenant_id=<uuid>        → config de um tenant específico
 *   GET ?action=list&org_id=<uuid> → lista todos os tenants da organização
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-api-key",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Auth: validate shared API key ──────────────────────────────────────────
  const apiKey = req.headers.get("x-crm-api-key");
  const expectedKey = Deno.env.get("CRM_API_KEY");

  if (!expectedKey || apiKey !== expectedKey) {
    return new Response(
      JSON.stringify({ error: "Não autorizado" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Supabase client with service role (bypasses RLS) ──────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");
  const action = url.searchParams.get("action");
  const orgId = url.searchParams.get("org_id");

  try {
    // ── GET ?tenant_id=<uuid> ─────────────────────────────────────────────────
    if (req.method === "GET" && tenantId) {
      const { data, error } = await supabase.rpc("get_tenant_config", {
        p_tenant_id: tenantId,
      });

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET ?action=list&org_id=<uuid> ────────────────────────────────────────
    if (req.method === "GET" && action === "list" && orgId) {
      const { data, error } = await supabase.rpc("list_tenant_configs", {
        p_org_id: orgId,
      });

      if (error) throw error;

      return new Response(JSON.stringify(data ?? []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Rota não encontrada" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[crm-tenant-api] error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

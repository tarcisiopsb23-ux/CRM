// Edge Function: valida acesso ao C8 Control (CRM externo)
// Autenticação via header x-crm-api-key (secret compartilhado com o CRM externo)
// Suporta actions: create_session, validate, revoke

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crm-api-key",
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Autenticação via API key compartilhada com o CRM externo
    const apiKey = req.headers.get("x-crm-api-key");
    const expectedKey = Deno.env.get("CRM_API_KEY");

    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido (JSON esperado)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action } = body;
    if (!action) {
      return new Response(
        JSON.stringify({ error: "Campo 'action' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ─── action: create_session ───────────────────────────────────────────────
    if (action === "create_session") {
      const { client_id, user_id } = body as { action: string; client_id: string; user_id: string };

      if (!client_id || !user_id) {
        return new Response(
          JSON.stringify({ error: "client_id e user_id são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar subscription_status
      const { data: plan, error: planError } = await adminClient
        .from("crm_client_plans")
        .select("subscription_status")
        .eq("client_id", client_id)
        .single();

      if (planError || !plan) {
        return new Response(
          JSON.stringify({ error: "Plano não encontrado para este cliente" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (plan.subscription_status !== "ativo") {
        return new Response(
          JSON.stringify({ error: "access_blocked", reason: plan.subscription_status }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar organization_id do cliente
      const { data: client, error: clientError } = await adminClient
        .from("clients")
        .select("organization_id")
        .eq("id", client_id)
        .single();

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: "Cliente não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const session_token = crypto.randomUUID();
      const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: insertError } = await adminClient
        .from("crm_sessions")
        .insert({
          organization_id: client.organization_id,
          client_id,
          user_id,
          session_token,
          expires_at,
        });

      if (insertError) {
        console.error("[crm-validate-access] Erro ao criar sessão:", insertError);
        return new Response(
          JSON.stringify({ error: "Erro ao criar sessão" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ session_token, expires_at }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── action: validate ─────────────────────────────────────────────────────
    if (action === "validate") {
      const { session_token } = body as { action: string; session_token: string };

      if (!session_token) {
        return new Response(
          JSON.stringify({ error: "session_token é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: session, error: sessionError } = await adminClient
        .from("crm_sessions")
        .select("*")
        .eq("session_token", session_token)
        .single();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ error: "Sessão não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.revoked) {
        return new Response(
          JSON.stringify({ error: "session_revoked" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "session_expired" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar subscription_status do cliente
      const { data: plan, error: planError } = await adminClient
        .from("crm_client_plans")
        .select("subscription_status, modules")
        .eq("client_id", session.client_id)
        .single();

      if (planError || !plan) {
        return new Response(
          JSON.stringify({ error: "Plano não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (plan.subscription_status === "bloqueado") {
        return new Response(
          JSON.stringify({ reason: "blocked" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (plan.subscription_status === "suspenso") {
        return new Response(
          JSON.stringify({ reason: "suspended" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Renovar sessão (+30 minutos)
      const new_expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await adminClient
        .from("crm_sessions")
        .update({
          last_activity_at: new Date().toISOString(),
          expires_at: new_expires_at,
        })
        .eq("session_token", session_token);

      return new Response(
        JSON.stringify({
          valid: true,
          client_id: session.client_id,
          user_id: session.user_id,
          modules: plan.modules ?? [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── action: revoke ───────────────────────────────────────────────────────
    if (action === "revoke") {
      const { session_token } = body as { action: string; session_token: string };

      if (!session_token) {
        return new Response(
          JSON.stringify({ error: "session_token é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await adminClient
        .from("crm_sessions")
        .update({ revoked: true })
        .eq("session_token", session_token);

      if (updateError) {
        console.error("[crm-validate-access] Erro ao revogar sessão:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao revogar sessão" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── action desconhecida ──────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: `Action desconhecida: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[crm-validate-access] Erro interno:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Edge Function: c8-data-proxy
 * Projeto: Maestr.ia
 *
 * Proxy autenticado para a crm-data-api do C8 Control.
 * Aceita POST com body JSON { action, tenant_id? }
 *
 * Secrets necessários:
 *   CRM_DATA_API_URL — ex: https://xcymhcqbyyuozkzhpxgi.supabase.co/functions/v1/crm-data-api
 *   CRM_API_KEY      — chave compartilhada com o C8 Control
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Autenticar chamador via JWT do Maestr.ia ───────────────────────────
    // O Supabase gateway já valida a assinatura do JWT antes de chegar aqui.
    // Decodificamos o payload para extrair o user_id sem re-validar a assinatura
    // (evita o erro ES256 que ocorre quando o projeto usa chave assimétrica).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const jwt = authHeader.replace("Bearer ", "").trim();

    // Decodifica o payload do JWT (base64url, parte do meio)
    let userId: string | null = null;
    try {
      const payloadB64 = jwt.split(".")[1];
      const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(payloadJson);
      userId = payload.sub ?? null;
    } catch {
      return json({ error: "Token inválido" }, 401);
    }

    if (!userId) return json({ error: "Token sem sub" }, 401);

    // Busca o perfil do usuário para verificar role
    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: profile } = await maestriaAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (!["owner", "admin"].includes(profile?.role ?? "")) {
      return json({ error: "Apenas owner/admin" }, 403);
    }

    // ── 2. Ler parâmetros do body (POST via supabase.functions.invoke) ─────────
    let action: string | null = null;
    let tenantId: string | null = null;

    try {
      const body = await req.json();
      action = body?.action ?? null;
      tenantId = body?.tenant_id ?? null;
    } catch {
      return json({ error: "Body JSON inválido" }, 400);
    }

    if (!action) return json({ error: "Parâmetro 'action' é obrigatório" }, 400);

    // ── 3. Configurações da crm-data-api ──────────────────────────────────────
    const crmDataApiUrl = Deno.env.get("CRM_DATA_API_URL");
    const crmApiKey = Deno.env.get("CRM_API_KEY");

    if (!crmDataApiUrl || !crmApiKey) {
      return json({ error: "CRM_DATA_API_URL ou CRM_API_KEY não configurados" }, 500);
    }

    // ── 4. Montar URL e chamar crm-data-api do C8 Control ─────────────────────
    const targetUrl = new URL(crmDataApiUrl);
    targetUrl.searchParams.set("action", action);
    if (tenantId) targetUrl.searchParams.set("tenant_id", tenantId);

    const upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "x-crm-api-key": crmApiKey,
        "Content-Type": "application/json",
      },
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("[c8-data-proxy] upstream error:", data);
      return json({ error: data?.error ?? `Erro ${upstream.status} no C8 Control`, details: data }, upstream.status);
    }

    return json(data);

  } catch (err) {
    console.error("[c8-data-proxy]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});

/**
 * dispatch-webhook — Edge Function
 *
 * Dispara webhooks genéricos com assinatura HMAC-SHA256 de forma server-side.
 * Chamada pelo frontend via supabase.functions.invoke() para manter o secret
 * fora do bundle do browser.
 *
 * Body esperado:
 *   { organization_id: string, event: string, data: unknown }
 *
 * Resposta:
 *   { ok: true } | { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── HMAC-SHA256 via Web Crypto ───────────────────────────────────────────────

async function signPayload(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { organization_id, event, data } = await req.json();

    if (!organization_id || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: "organization_id e event são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Busca configuração de webhook da organização
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: integration, error: dbError } = await supabaseAdmin
      .from("organization_integrations")
      .select("config")
      .eq("organization_id", organization_id)
      .eq("integration_type", "webhooks")
      .maybeSingle();

    if (dbError) throw dbError;

    const config = integration?.config as {
      url?: string;
      secret?: string;
      events?: string[];
      enabled?: boolean;
    } | null;

    // Sem configuração ou desabilitado — retorna ok silenciosamente
    if (!config?.url || !config.enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filtra por eventos configurados
    if (config.events && config.events.length > 0 && !config.events.includes(event)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "event_not_subscribed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamp = new Date().toISOString();
    const payload = { event, timestamp, organization_id, data };
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": event,
      "X-Webhook-Timestamp": timestamp,
      "User-Agent": "MaestrIA-CRM/1.0",
    };

    if (config.secret) {
      headers["X-Webhook-Signature"] = await signPayload(config.secret, body);
    }

    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const responseText = await res.text().catch(() => "");
      console.warn(`[dispatch-webhook] HTTP ${res.status} para ${config.url}: ${responseText}`);
      return new Response(
        JSON.stringify({ ok: false, error: `HTTP ${res.status}`, response: responseText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[dispatch-webhook] Erro:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * notaas-webhook — Edge Function
 *
 * Recebe e processa eventos de webhook enviados pela plataforma Notaas.
 * Valida a assinatura HMAC-SHA256 antes de processar qualquer evento.
 *
 * Eventos suportados:
 *   - nfse.autorizada: atualiza Invoice com status='autorizada', numero, pdf_url, xml_url, emitida_em
 *   - nfse.rejeitada:  atualiza Invoice com status='rejeitada', erro_mensagem
 *
 * Respostas:
 *   HTTP 200 — evento processado com sucesso
 *   HTTP 401 — assinatura HMAC-SHA256 inválida
 *   HTTP 404 — Invoice não encontrado para o notaas_id recebido
 *   HTTP 400 — payload inválido ou campos obrigatórios ausentes
 *   HTTP 500 — erro interno
 *
 * Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-notaas-signature, x-organization-id",
};

// ── HMAC-SHA256 validation via Web Crypto ────────────────────────────────────

/**
 * Validates the HMAC-SHA256 signature of a payload.
 * The expected signature format is the raw hex digest (64 chars).
 * Returns true only when the provided signature matches the computed one.
 *
 * Property 12: validateHmac accepts only correct HMAC-SHA256 signatures.
 */
async function validateHmac(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Normalize: accept both raw hex and "sha256=<hex>" formats
    const normalizedSig = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    // Convert hex string to Uint8Array
    const sigBytes = new Uint8Array(
      normalizedSig.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payload)
    );
  } catch {
    return false;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Read raw body for HMAC validation (must be done before parsing JSON)
    const rawBody = await req.text();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract organization_id from payload or custom header
    const organizationId =
      (payload.organization_id as string | undefined) ||
      req.headers.get("x-organization-id") ||
      null;

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = payload.event as string | undefined;
    const notaasId = payload.notaas_id as string | undefined;

    if (!event || !notaasId) {
      return new Response(
        JSON.stringify({ error: "event and notaas_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch webhook_secret from organization_integrations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: integration, error: configError } = await supabaseAdmin
      .from("organization_integrations")
      .select("config")
      .eq("organization_id", organizationId)
      .eq("integration_type", "notaas")
      .maybeSingle();

    if (configError) {
      console.error("[notaas-webhook] Erro ao buscar config:", configError.message);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = (integration?.config ?? {}) as {
      webhook_secret?: string;
      api_key?: string;
    };

    // Req 7.2, 7.3: Validate HMAC-SHA256 signature
    const signature = req.headers.get("x-notaas-signature") ?? "";

    if (config.webhook_secret) {
      const isValid = await validateHmac(config.webhook_secret, rawBody, signature);
      if (!isValid) {
        console.warn(
          `[notaas-webhook] Assinatura HMAC inválida para org=${organizationId}`
        );
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Req 7.4, 7.5: Process events
    if (event === "nfse.autorizada") {
      // Find Invoice by notaas_id
      const { data: invoice, error: findError } = await supabaseAdmin
        .from("invoices")
        .select("id, status")
        .eq("notaas_id", notaasId)
        .maybeSingle();

      if (findError) {
        console.error("[notaas-webhook] Erro ao buscar Invoice:", findError.message);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Req 7.6: Return 404 if Invoice not found
      if (!invoice) {
        console.warn(
          `[notaas-webhook] Invoice não encontrado para notaas_id=${notaasId}`
        );
        return new Response(
          JSON.stringify({ error: "Invoice not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Req 7.8: Idempotency — if already autorizada, return 200 without re-updating
      if (invoice.status === "autorizada") {
        return new Response(
          JSON.stringify({ ok: true, idempotent: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update Invoice as autorizada
      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({
          status:     "autorizada",
          numero:     (payload.numero as string | null) ?? null,
          pdf_url:    (payload.pdf_url as string | null) ?? null,
          xml_url:    (payload.xml_url as string | null) ?? null,
          emitida_em: (payload.emitida_em as string | null) ?? new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (updateError) {
        console.error("[notaas-webhook] Erro ao atualizar Invoice:", updateError.message);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event === "nfse.rejeitada") {
      // Find Invoice by notaas_id
      const { data: invoice, error: findError } = await supabaseAdmin
        .from("invoices")
        .select("id, status")
        .eq("notaas_id", notaasId)
        .maybeSingle();

      if (findError) {
        console.error("[notaas-webhook] Erro ao buscar Invoice:", findError.message);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Req 7.6: Return 404 if Invoice not found
      if (!invoice) {
        console.warn(
          `[notaas-webhook] Invoice não encontrado para notaas_id=${notaasId}`
        );
        return new Response(
          JSON.stringify({ error: "Invoice not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Req 7.8: Idempotency — if already rejeitada, return 200 without re-updating
      if (invoice.status === "rejeitada") {
        return new Response(
          JSON.stringify({ ok: true, idempotent: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update Invoice as rejeitada
      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({
          status:        "rejeitada",
          erro_mensagem: (payload.erro_mensagem as string | null) ?? "Rejeitada pela Notaas",
        })
        .eq("id", invoice.id);

      if (updateError) {
        console.error("[notaas-webhook] Erro ao atualizar Invoice:", updateError.message);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown event — ignore silently (Req 7.7: return 200 for all processed events)
    console.log(`[notaas-webhook] Evento desconhecido ignorado: ${event}`);
    return new Response(
      JSON.stringify({ ok: true, ignored: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[notaas-webhook] Erro inesperado:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

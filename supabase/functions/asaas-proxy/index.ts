/**
 * asaas-proxy — Edge Function
 *
 * Proxy para a API do Asaas. Necessário porque o IP do servidor n8n
 * (data center) é bloqueado pelo CloudFront WAF do Asaas.
 *
 * Body esperado:
 *   {
 *     method:  "POST" | "GET" | "PUT" | "DELETE"  (default: "POST")
 *     path:    string   — ex: "/v3/customers"
 *     payload: object   — body da requisição (opcional para GET/DELETE)
 *   }
 *
 * A chave ASAAS_API_KEY deve estar configurada nos secrets da Edge Function.
 */

const ASAAS_BASE_URL = "https://api.asaas.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ASAAS_API_KEY não configurada nos secrets da Edge Function" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lê o body como texto primeiro para diagnóstico
    const rawBody = await req.text();
    console.log("[asaas-proxy] raw body recebido:", rawBody);
    console.log("[asaas-proxy] Content-Type:", req.headers.get("content-type"));

    if (!rawBody || rawBody.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Body vazio recebido pelo proxy" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse do JSON
    let body: { method?: string; path: string; payload?: Record<string, unknown> };
    try {
      body = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error("[asaas-proxy] Falha ao parsear JSON:", parseErr, "| raw:", rawBody);
      return new Response(
        JSON.stringify({ error: `JSON inválido: ${String(parseErr)}`, received: rawBody.slice(0, 200) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.path) {
      return new Response(
        JSON.stringify({ error: "Campo 'path' é obrigatório. Ex: /v3/customers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const method = (body.method ?? "POST").toUpperCase();
    const url = `${ASAAS_BASE_URL}${body.path}`;

    console.log("[asaas-proxy] chamando Asaas:", method, url);
    console.log("[asaas-proxy] payload:", JSON.stringify(body.payload));

    const asaasRes = await fetch(url, {
      method,
      headers: {
        "access_token": apiKey,
        "Content-Type": "application/json",
        "User-Agent": "MaestrIA-CRM/1.0 (Supabase-EdgeFunction; producao)",
      },
      ...(body.payload && method !== "GET" && method !== "DELETE"
        ? { body: JSON.stringify(body.payload) }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });

    const responseText = await asaasRes.text();
    console.log("[asaas-proxy] Asaas status:", asaasRes.status, "| response:", responseText.slice(0, 300));

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    return new Response(JSON.stringify(responseJson), {
      status: asaasRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[asaas-proxy] Erro inesperado:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

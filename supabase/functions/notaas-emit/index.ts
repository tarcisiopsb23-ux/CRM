/**
 * notaas-emit — Edge Function
 *
 * Proxy server-side para a API Notaas (emissão e cancelamento de NFS-e).
 * Necessário para:
 *  - Não expor a api_key no frontend
 *  - Evitar bloqueios de CORS
 *  - Garantir que a chamada sai de um IP de servidor
 *
 * Body esperado:
 *   {
 *     action:     "emitir" | "cancelar"
 *     api_key:    string          — chave da organização (lida do config salvo)
 *     sandbox:    boolean         — true para ambiente de testes
 *     payload:    object          — body a enviar para a Notaas
 *     notaas_id?: string          — obrigatório para action="cancelar"
 *   }
 */

const PROD_BASE_URL    = "https://app.notaas.com.br";
const SANDBOX_BASE_URL = "https://app.notaas.com.br"; // mesmo host, sandbox via api_key de teste

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    if (!rawBody?.trim()) {
      return new Response(
        JSON.stringify({ error: "Body vazio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: {
      action: "emitir" | "cancelar";
      api_key: string;
      sandbox?: boolean;
      payload?: Record<string, unknown>;
      notaas_id?: string;
      motivo?: string;
    };

    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "JSON inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.api_key) {
      return new Response(
        JSON.stringify({ error: "api_key é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.action || !["emitir", "cancelar"].includes(body.action)) {
      return new Response(
        JSON.stringify({ error: "action deve ser 'emitir' ou 'cancelar'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = body.sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL;

    let notaasUrl: string;
    let notaasBody: Record<string, unknown> | undefined;

    if (body.action === "emitir") {
      notaasUrl = `${baseUrl}/api/v1/emitir`;
      notaasBody = body.payload;
    } else {
      if (!body.notaas_id) {
        return new Response(
          JSON.stringify({ error: "notaas_id é obrigatório para cancelamento" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      notaasUrl = `${baseUrl}/api/v1/cancelar/${encodeURIComponent(body.notaas_id)}`;
      notaasBody = body.motivo ? { motivo: body.motivo } : undefined;
    }

    console.log(`[notaas-emit] ${body.action} → ${notaasUrl}`);

    const notaasRes = await fetch(notaasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": body.api_key,
        "User-Agent": "MaestrIA-CRM/1.0 (Supabase-EdgeFunction)",
      },
      ...(notaasBody ? { body: JSON.stringify(notaasBody) } : {}),
      signal: AbortSignal.timeout(30_000),
    });

    const responseText = await notaasRes.text();
    console.log(`[notaas-emit] Notaas status: ${notaasRes.status} | response: ${responseText.slice(0, 300)}`);

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    return new Response(JSON.stringify(responseJson), {
      status: notaasRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notaas-emit] Erro inesperado:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Edge Function: meta-deauth
 *
 * Webhook chamado pela Meta quando um usuario desautoriza o app
 * (remove o app nas configuracoes do Facebook/Instagram).
 *
 * A Meta faz um POST com o campo "signed_request" (base64url.base64url).
 * Esta funcao:
 *   1. Valida a assinatura HMAC-SHA256 usando META_APP_SECRET
 *   2. Extrai o user_id do payload
 *   3. Deleta o registro em oauth_tokens correspondente
 *   4. Retorna { url, confirmation_code } conforme protocolo da Meta
 *
 * URL para cadastrar no Meta for Developers:
 *   App Settings -> Advanced -> Deauthorize Callback URL
 *   https://<supabase-ref>.supabase.co/functions/v1/meta-deauth
 *
 * Secrets necessarios:
 *   META_APP_SECRET            - secret do app Meta
 *   SUPABASE_URL               - auto-injetado
 *   SUPABASE_SERVICE_ROLE_KEY  - auto-injetado
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Valida a assinatura HMAC-SHA256 do signed_request da Meta
async function validateSignedRequest(
  signedRequest: string,
  appSecret: string
): Promise<Record<string, unknown> | null> {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;

  const [encodedSig, encodedPayload] = parts;

  // Decodifica payload (base64url -> JSON)
  const payloadJson = atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"));
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  // Verifica algoritmo
  if (payload.algorithm !== "HMAC-SHA256") return null;

  // Calcula assinatura esperada
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const expectedSig = btoa(
    String.fromCharCode(...new Uint8Array(expectedSigBuffer))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Compara assinaturas
  if (encodedSig !== expectedSig) return null;

  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  if (!appSecret) {
    console.error("[meta-deauth] META_APP_SECRET nao configurado");
    return json({ error: "Configuracao incompleta" }, 500);
  }

  try {
    // Extrai signed_request do body (form-encoded ou JSON)
    const contentType = req.headers.get("content-type") ?? "";
    let signedRequest = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      const params = new URLSearchParams(body);
      signedRequest = params.get("signed_request") ?? "";
    } else if (contentType.includes("application/json")) {
      const body = await req.json() as Record<string, unknown>;
      signedRequest = String(body.signed_request ?? "");
    } else {
      // Tenta form-encoded como fallback (padrao da Meta)
      const body = await req.text();
      const params = new URLSearchParams(body);
      signedRequest = params.get("signed_request") ?? "";
    }

    if (!signedRequest) {
      console.warn("[meta-deauth] signed_request ausente");
      return json({ error: "signed_request ausente" }, 400);
    }

    // Valida assinatura
    const payload = await validateSignedRequest(signedRequest, appSecret);
    if (!payload) {
      console.warn("[meta-deauth] Assinatura invalida");
      return json({ error: "Assinatura invalida" }, 403);
    }

    const metaUserId = String(payload.user_id ?? "");
    console.log(`[meta-deauth] Desautorizando user_id Meta: ${metaUserId}`);

    // Remove token da tabela oauth_tokens
    // O access_token Meta contem o user_id no campo meta_user_id (se salvo)
    // ou buscamos pelo provider = 'meta' e user_id nos metadados
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Tenta deletar pelo meta_user_id (campo opcional que pode ter sido salvo)
    const { error: delError, count } = await supabase
      .from("oauth_tokens")
      .delete({ count: "exact" })
      .eq("provider", "meta")
      .eq("meta_user_id", metaUserId);

    if (delError) {
      console.error("[meta-deauth] Erro ao deletar por meta_user_id:", delError.message);
    }

    // Log de auditoria
    await supabase.from("oauth_deauth_log").insert({
      provider:     "meta",
      meta_user_id: metaUserId,
      deleted_count: count ?? 0,
      raw_payload:  payload,
      created_at:   new Date().toISOString(),
    }).then(() => {}).catch(() => {}); // silencioso — tabela opcional

    console.log(`[meta-deauth] Concluido. Tokens removidos: ${count ?? 0}`);

    // Resposta obrigatoria pelo protocolo da Meta
    const confirmationCode = crypto.randomUUID();
    return json({
      url: `https://c8control.com.br/exclusao-de-dados`,
      confirmation_code: confirmationCode,
    });

  } catch (err) {
    console.error("[meta-deauth] Erro nao tratado:", err);
    return json({ error: "Erro interno" }, 500);
  }
});

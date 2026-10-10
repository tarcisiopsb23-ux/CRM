/**
 * meta-manual-validate — v2
 *
 * Valida um access_token Meta e os IDs de ativos contra a Graph API real.
 * Suporta dois modos:
 *   1. Token próprio  — access_token enviado no body
 *   2. Token agência  — use_agency_token=true, busca de organization_meta_credentials
 *
 * Nunca persiste nada. Nunca retorna o token. Exige JWT owner/admin/agency.
 *
 * POST /meta-manual-validate
 * Body: {
 *   organization_id: string,
 *   use_agency_token?: boolean,   ← se true, ignora access_token
 *   access_token?: string,        ← obrigatório quando use_agency_token=false
 *   provider: 'facebook'|'instagram'|'whatsapp'|'meta_multi',
 *   facebook_page_id?: string,
 *   instagram_account_id?: string,
 *   waba_id?: string,
 *   phone_number_id?: string,
 *   business_id?: string,
 *   ad_account_id?: string,
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v19.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function friendlyError(code: number | undefined, message: string): string {
  if (code === 190)  return "O token informado não é válido ou expirou.";
  if (code === 200 || code === 10) return "A credencial não possui a permissão necessária para este recurso.";
  if (code === 100)  return "O ativo informado não está acessível com esta credencial.";
  if (code === 803)  return "O ID informado não foi encontrado.";
  if (message?.toLowerCase().includes("unsupported get request")) {
    return "O ativo informado não está acessível com esta credencial.";
  }
  return message ?? "Erro desconhecido da Meta API.";
}

async function graphGet(
  path: string,
  token: string,
  fields?: string
): Promise<{ data: Record<string, unknown> | null; errorCode?: number; errorMsg?: string }> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", token);
  if (fields) url.searchParams.set("fields", fields);
  try {
    const res  = await fetch(url.toString());
    const body = await res.json() as Record<string, unknown>;
    if (body.error) {
      const err = body.error as Record<string, unknown>;
      return { data: null, errorCode: err.code as number | undefined, errorMsg: err.message as string | undefined };
    }
    return { data: body };
  } catch (e: unknown) {
    return { data: null, errorMsg: e instanceof Error ? e.message : "Network error" };
  }
}

// ── Crypto (AES-GCM) — para decriptografar token da agência ──────────────────

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc    = new TextEncoder();
  const keyMat = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("meta_connections_v1"), iterations: 100_000, hash: "SHA-256" },
    keyMat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function decrypt(cipherB64: string, secret: string): Promise<string> {
  const key      = await deriveKey(secret);
  const combined = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const plain    = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(plain);
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userToken  = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!userToken) return json({ error: "Não autorizado" }, 401);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cryptoSecret   = Deno.env.get("CRYPTO_SECRET");

  if (!cryptoSecret) return json({ error: "Configuração interna incompleta." }, 500);

  // Autenticação
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return json({ error: "Não autorizado" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const isAdminOrOwner = profile?.role === "owner" || profile?.role === "admin";
  const isAgency       = (user.email ?? "").endsWith("@agenciac8.com.br") ||
                         ["agency", "support"].includes(profile?.role ?? "");

  if (!isAdminOrOwner && !isAgency) {
    return json({ error: "Acesso negado. Apenas owner/admin podem usar configuração manual." }, 403);
  }

  let body: Record<string, string | boolean | undefined>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const {
    organization_id,
    use_agency_token = false,
    access_token: bodyToken,
    provider,
    facebook_page_id,
    instagram_account_id,
    waba_id,
    phone_number_id,
    business_id,
    ad_account_id,
  } = body;

  if (!organization_id || !provider) {
    return json({ error: "organization_id e provider são obrigatórios" }, 400);
  }

  const orgId = organization_id as string;

  if (!isAgency && profile?.organization_id && profile.organization_id !== orgId) {
    return json({ error: "Organização inválida." }, 403);
  }

  // ── Resolve o token a usar ────────────────────────────────────────────────
  let resolvedToken: string;

  if (use_agency_token) {
    // Busca token criptografado da agência
    const { data: agencyCred } = await adminClient
      .from("organization_meta_credentials")
      .select("access_token_encrypted")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .eq("token_is_set", true)
      .maybeSingle();

    if (!agencyCred?.access_token_encrypted) {
      return json({
        error: "agency_token_not_configured",
        message: "Nenhum token da agência configurado. Configure em Configurações → Meta.",
      }, 400);
    }

    try {
      resolvedToken = await decrypt(agencyCred.access_token_encrypted, cryptoSecret);
    } catch {
      return json({ error: "Erro ao descriptografar token da agência." }, 500);
    }
  } else if (bodyToken === "__use_stored__") {
    // Modo "testar conexão existente" — busca o token salvo da própria conexão.
    // O frontend não possui o token real; sinaliza com __use_stored__ para que
    // o backend o recupere diretamente do banco.
    const { connection_id } = body as Record<string, unknown>;
    if (!connection_id) {
      return json({ error: "connection_id é obrigatório quando access_token='__use_stored__'" }, 400);
    }

    const { data: connRow } = await adminClient
      .from("meta_connections")
      .select("access_token_encrypted, use_agency_token")
      .eq("id", connection_id as string)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!connRow) return json({ error: "Conexão não encontrada." }, 404);

    if (connRow.use_agency_token) {
      // Conexão usa token da agência — busca de organization_meta_credentials
      const { data: agencyCred } = await adminClient
        .from("organization_meta_credentials")
        .select("access_token_encrypted")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .eq("token_is_set", true)
        .maybeSingle();

      if (!agencyCred?.access_token_encrypted) {
        return json({
          error: "agency_token_not_configured",
          message: "Nenhum token da agência configurado.",
        }, 400);
      }

      try {
        resolvedToken = await decrypt(agencyCred.access_token_encrypted, cryptoSecret);
      } catch {
        return json({ error: "Erro ao descriptografar token da agência." }, 500);
      }
    } else {
      if (!connRow.access_token_encrypted) {
        return json({ error: "Esta conexão não possui token armazenado." }, 400);
      }
      try {
        resolvedToken = await decrypt(connRow.access_token_encrypted, cryptoSecret);
      } catch {
        return json({ error: "Erro ao descriptografar token da conexão." }, 500);
      }
    }
  } else {
    if (!bodyToken) {
      return json({ error: "access_token é obrigatório quando use_agency_token=false" }, 400);
    }
    resolvedToken = bodyToken as string;
  }

  // ── Validação do Token via debug_token ────────────────────────────────────
  const result: Record<string, unknown> = { errors: [] };
  const errors: string[] = [];

  const appId  = Deno.env.get("META_APP_ID")!;
  const appSec = Deno.env.get("META_APP_SECRET")!;
  const appTok = `${appId}|${appSec}`;

  const debugUrl = new URL(`${GRAPH}/debug_token`);
  debugUrl.searchParams.set("input_token", resolvedToken);
  debugUrl.searchParams.set("access_token", appTok);

  let tokenValid = false;
  let tokenUserId: string | undefined;
  let tokenExpiresAt: string | undefined;
  let tokenPermissions: string[] = [];

  try {
    const debugRes  = await fetch(debugUrl.toString());
    const debugBody = await debugRes.json() as Record<string, unknown>;
    const debugData = debugBody.data as Record<string, unknown> | undefined;

    if (debugData?.is_valid === true) {
      tokenValid       = true;
      tokenUserId      = debugData.user_id as string | undefined;
      const exp        = debugData.expires_at as number | undefined;
      if (exp && exp > 0) tokenExpiresAt = new Date(exp * 1000).toISOString();
      const scopes     = debugData.scopes as string[] | undefined;
      if (Array.isArray(scopes)) tokenPermissions = scopes;
    } else {
      const errData = debugData?.error as Record<string, unknown> | undefined;
      errors.push(friendlyError(errData?.code as number, errData?.message as string ?? "Token inválido."));
    }
  } catch {
    errors.push("Erro ao verificar o token com a Meta API.");
  }

  result.token = {
    valid:            tokenValid,
    user_id:          tokenUserId,
    expires_at:       tokenExpiresAt,
    permissions:      tokenPermissions,
    source:           use_agency_token ? "agency" : "own",
  };

  if (!tokenValid) return json({ ...result, errors });

  // ── Validação de ativos ───────────────────────────────────────────────────

  if (facebook_page_id) {
    const { data, errorCode, errorMsg } = await graphGet(
      facebook_page_id as string, resolvedToken, "id,name,category,verification_status"
    );
    if (data) {
      result.facebook_page = { id: data.id, name: data.name, category: data.category, accessible: true };
    } else {
      result.facebook_page = { id: facebook_page_id, accessible: false, error: friendlyError(errorCode, errorMsg ?? "") };
      errors.push(`Facebook Page: ${friendlyError(errorCode, errorMsg ?? "")}`);
    }
  }

  if (instagram_account_id) {
    const { data, errorCode, errorMsg } = await graphGet(
      instagram_account_id as string, resolvedToken, "id,username,name,account_type"
    );
    if (data) {
      result.instagram = { id: data.id, username: data.username, name: data.name, accessible: true };
    } else {
      // Fallback para System User Token: acesso direto ao IG Business Account pode retornar
      // erro 100 mesmo com permissões corretas. Nesse caso, tenta resolver via Page vinculada.
      // GET /{page_id}?fields=instagram_business_account{id,username,name}
      let resolvedViaPage = false;
      if ((errorCode === 100 || errorMsg?.toLowerCase().includes("unsupported get request")) && facebook_page_id) {
        const { data: pageData } = await graphGet(
          facebook_page_id as string, resolvedToken, "instagram_business_account{id,username,name}"
        );
        const igViaPage = pageData?.instagram_business_account as Record<string, unknown> | undefined;
        if (igViaPage?.id && igViaPage.id === instagram_account_id) {
          // ID confirmado via Page — conta acessível
          result.instagram = {
            id:         igViaPage.id,
            username:   igViaPage.username,
            name:       igViaPage.name,
            accessible: true,
          };
          resolvedViaPage = true;
        } else if (igViaPage?.id && igViaPage.id !== instagram_account_id) {
          // Page está vinculada a outro IG — ID divergente
          result.instagram = {
            id:         instagram_account_id,
            accessible: false,
            error:      `O ID informado (${instagram_account_id}) não corresponde à conta Instagram vinculada à Page (${igViaPage.id}).`,
          };
          errors.push(`Instagram: ID divergente — esperado ${igViaPage.id}`);
          resolvedViaPage = true;
        }
      }
      if (!resolvedViaPage) {
        result.instagram = { id: instagram_account_id, accessible: false, error: friendlyError(errorCode, errorMsg ?? "") };
        errors.push(`Instagram: ${friendlyError(errorCode, errorMsg ?? "")}`);
      }
    }
  }

  if (waba_id) {
    const { data, errorCode, errorMsg } = await graphGet(waba_id as string, resolvedToken, "id,name");
    if (data) {
      result.whatsapp_waba = { id: data.id, name: data.name, accessible: true };
    } else {
      result.whatsapp_waba = { id: waba_id, accessible: false, error: friendlyError(errorCode, errorMsg ?? "") };
      errors.push(`WhatsApp WABA: ${friendlyError(errorCode, errorMsg ?? "")}`);
    }
  }

  if (phone_number_id) {
    const { data, errorCode, errorMsg } = await graphGet(
      phone_number_id as string, resolvedToken, "id,display_phone_number,verified_name,quality_rating"
    );
    if (data) {
      result.whatsapp_phone = {
        id: data.id, display_number: data.display_phone_number,
        verified_name: data.verified_name, quality_rating: data.quality_rating, accessible: true,
      };
    } else {
      result.whatsapp_phone = { id: phone_number_id, accessible: false, error: friendlyError(errorCode, errorMsg ?? "") };
      errors.push(`WhatsApp Phone: ${friendlyError(errorCode, errorMsg ?? "")}`);
    }
  }

  if (business_id) {
    const { data, errorCode, errorMsg } = await graphGet(business_id as string, resolvedToken, "id,name");
    if (data) result.business = { id: data.id, name: data.name, accessible: true };
    else result.business = { id: business_id, accessible: false, error: friendlyError(errorCode, errorMsg ?? "") };
  }

  if (ad_account_id) {
    const cleanId = (ad_account_id as string).startsWith("act_") ? ad_account_id as string : `act_${ad_account_id}`;
    const { data, errorCode, errorMsg } = await graphGet(cleanId, resolvedToken, "id,name,account_status");
    if (data) result.ad_account = { id: data.id, name: data.name, accessible: true };
    else result.ad_account = { id: cleanId, accessible: false, error: friendlyError(errorCode, errorMsg ?? "") };
  }

  return json({ ...result, errors });
});

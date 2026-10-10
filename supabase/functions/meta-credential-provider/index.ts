/**
 * meta-credential-provider — v2
 *
 * Camada unificada de resolução de credencial Meta por connection_id.
 * Abstrai o método de provisionamento: oauth, manual (token próprio),
 * manual (token da agência), embedded_signup.
 *
 * USO EXCLUSIVO INTERNO — requer header X-Internal-Secret.
 *
 * POST /meta-credential-provider
 * Headers: X-Internal-Secret: <INTERNAL_SECRET>
 * Body: {
 *   connection_id: string,
 *   organization_id: string,
 *   action: 'get_token' | 'validate' | 'get_assets'
 * }
 *
 * Fluxo de resolução do token:
 *   1. connection.use_agency_token = true
 *      → busca em organization_meta_credentials (token do System User)
 *   2. connection.connection_method = 'manual' + use_agency_token = false
 *      → decripta connection.access_token_encrypted
 *   3. connection.connection_method = 'oauth'
 *      → busca em oauth_tokens por oauth_token_id ou organization_id
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v19.0";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Crypto (AES-GCM) ──────────────────────────────────────────────────────────

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

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MetaConnection {
  id: string;
  organization_id: string;
  provider: string;
  connection_method: "oauth" | "manual" | "embedded_signup";
  use_agency_token: boolean;
  status: string;
  access_token_encrypted: string | null;
  token_type: string | null;
  token_expires_at: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  instagram_account_id: string | null;
  instagram_username: string | null;
  waba_id: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_display_phone_number: string | null;
  ad_account_id: string | null;
  catalog_id: string | null;
  meta_user_id: string | null;
  business_id: string | null;
  oauth_token_id: string | null;
}

// ── Resolução de credencial ────────────────────────────────────────────────────

async function resolveToken(
  connection: MetaConnection,
  adminClient: ReturnType<typeof createClient>,
  cryptoSecret: string
): Promise<{ access_token: string; token_type: string; expires_at: string | null; source: string }> {

  // 1. Token da agência — prioridade máxima
  if (connection.use_agency_token) {
    const { data: agencyCred } = await adminClient
      .from("organization_meta_credentials")
      .select("access_token_encrypted, token_expires_at")
      .eq("organization_id", connection.organization_id)
      .eq("is_active", true)
      .eq("token_is_set", true)
      .maybeSingle();

    if (!agencyCred?.access_token_encrypted) {
      throw new Error("agency_token_not_configured");
    }

    const plainToken = await decrypt(agencyCred.access_token_encrypted, cryptoSecret);
    return {
      access_token: plainToken,
      token_type:   "system_user",
      expires_at:   agencyCred.token_expires_at ?? null,
      source:       "agency",
    };
  }

  // 2. Token manual próprio
  if (connection.connection_method === "manual") {
    if (!connection.access_token_encrypted) {
      throw new Error("manual_connection_no_token");
    }
    const plainToken = await decrypt(connection.access_token_encrypted, cryptoSecret);
    return {
      access_token: plainToken,
      token_type:   connection.token_type ?? "user",
      expires_at:   connection.token_expires_at,
      source:       "own",
    };
  }

  // 3. Token OAuth
  if (connection.connection_method === "oauth") {
    let oauthToken: { access_token: string; expires_at: string | null } | null = null;

    if (connection.oauth_token_id) {
      const { data } = await adminClient
        .from("oauth_tokens")
        .select("access_token, expires_at")
        .eq("id", connection.oauth_token_id)
        .maybeSingle();
      oauthToken = data as typeof oauthToken;
    }

    if (!oauthToken) {
      const { data } = await adminClient
        .from("oauth_tokens")
        .select("access_token, expires_at")
        .eq("tenant_id", connection.organization_id)
        .eq("provider", "meta")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      oauthToken = data as typeof oauthToken;
    }

    if (!oauthToken?.access_token) {
      throw new Error("oauth_token_not_found");
    }

    return {
      access_token: oauthToken.access_token,
      token_type:   "user",
      expires_at:   oauthToken.expires_at,
      source:       "oauth",
    };
  }

  throw new Error(`unknown_connection_method:${connection.connection_method}`);
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Proteção interna
  const internalSecret = Deno.env.get("INTERNAL_SECRET");
  if (!internalSecret || req.headers.get("X-Internal-Secret") !== internalSecret) {
    return json({ error: "Acesso não autorizado" }, 403);
  }

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cryptoSecret   = Deno.env.get("CRYPTO_SECRET");
  if (!cryptoSecret) return json({ error: "CRYPTO_SECRET não configurado" }, 500);

  let body: { connection_id?: string; organization_id?: string; action?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const { connection_id, organization_id, action = "get_token" } = body;
  if (!connection_id || !organization_id) {
    return json({ error: "connection_id e organization_id são obrigatórios" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: conn, error: fetchErr } = await adminClient
    .from("meta_connections")
    .select("*")
    .eq("id", connection_id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (fetchErr || !conn) return json({ error: "Conexão não encontrada" }, 404);

  const connection = conn as MetaConnection;

  if (!["active", "needs_reauthentication"].includes(connection.status)) {
    return json({ error: `connection_not_active:${connection.status}` }, 400);
  }

  // ── get_token ─────────────────────────────────────────────────────────────
  if (action === "get_token") {
    try {
      const cred = await resolveToken(connection, adminClient, cryptoSecret);
      return json(cred);
    } catch (e: unknown) {
      return json({ error: e instanceof Error ? e.message : "resolve_error" }, 400);
    }
  }

  // ── validate ──────────────────────────────────────────────────────────────
  if (action === "validate") {
    try {
      const cred   = await resolveToken(connection, adminClient, cryptoSecret);
      const appId  = Deno.env.get("META_APP_ID")!;
      const appSec = Deno.env.get("META_APP_SECRET")!;

      const debugUrl = new URL(`${GRAPH}/debug_token`);
      debugUrl.searchParams.set("input_token", cred.access_token);
      debugUrl.searchParams.set("access_token", `${appId}|${appSec}`);

      const debugRes  = await fetch(debugUrl.toString());
      const debugBody = await debugRes.json() as Record<string, unknown>;
      const debugData = debugBody.data as Record<string, unknown> | undefined;
      const valid     = debugData?.is_valid === true;

      const now = new Date().toISOString();
      await adminClient
        .from("meta_connections")
        .update({
          health_status:           valid ? "healthy" : "failed",
          last_health_check_at:    now,
          token_last_validated_at: valid ? now : undefined,
          status:                  valid ? "active" : "needs_reauthentication",
          last_error:              valid ? null : "Token inválido ou expirado",
        })
        .eq("id", connection_id)
        .eq("organization_id", organization_id);

      return json({ valid, expires_at: cred.expires_at, source: cred.source });
    } catch (e: unknown) {
      return json({ valid: false, error: e instanceof Error ? e.message : "validate_error" }, 400);
    }
  }

  // ── get_assets ────────────────────────────────────────────────────────────
  if (action === "get_assets") {
    return json({
      provider:                      connection.provider,
      connection_method:             connection.connection_method,
      use_agency_token:              connection.use_agency_token,
      facebook_page_id:              connection.facebook_page_id,
      facebook_page_name:            connection.facebook_page_name,
      instagram_account_id:          connection.instagram_account_id,
      instagram_username:            connection.instagram_username,
      waba_id:                       connection.waba_id,
      whatsapp_phone_number_id:      connection.whatsapp_phone_number_id,
      whatsapp_display_phone_number: connection.whatsapp_display_phone_number,
      ad_account_id:                 connection.ad_account_id,
      catalog_id:                    connection.catalog_id,
      meta_user_id:                  connection.meta_user_id,
      business_id:                   connection.business_id,
    });
  }

  return json({ error: "Ação inválida" }, 400);
});

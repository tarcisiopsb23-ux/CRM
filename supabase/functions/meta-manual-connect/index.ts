/**
 * meta-manual-connect — v2
 *
 * Salva/atualiza conexões Meta manuais na tabela meta_connections.
 * Suporta token próprio por conexão OU token global da agência (use_agency_token).
 *
 * Actions:
 *   create              — cria nova conexão (token próprio ou da agência)
 *   replace_token       — substitui token de uma conexão com token próprio
 *   set_agency_token    — salva/atualiza o token global da agência em organization_meta_credentials
 *   remove_agency_token — remove token global (zera access_token_encrypted)
 *   disconnect          — desativa ou remove credenciais de uma conexão
 *   migrate_to_oauth    — migra conexão manual → OAuth
 *
 * SEGURANÇA:
 * - Todos os tokens são criptografados AES-GCM com CRYPTO_SECRET antes de persistir.
 * - Tokens NUNCA aparecem em logs, respostas ou audit trail.
 * - Apenas owner/admin ou agency podem usar este endpoint.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ── Crypto (AES-GCM) ──────────────────────────────────────────────────────────

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc    = new TextEncoder();
  const keyMat = await crypto.subtle.importKey(
    "raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("meta_connections_v1"), iterations: 100_000, hash: "SHA-256" },
    keyMat,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key    = await deriveKey(secret);
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(12 + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(cipherB64: string, secret: string): Promise<string> {
  const key      = await deriveKey(secret);
  const combined = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const iv       = combined.slice(0, 12);
  const cipher   = combined.slice(12);
  const plain    = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

/** Gera preview mascarado: primeiros 4 + •••••••••••••• + últimos 3 chars */
function tokenPreview(token: string): string {
  if (token.length < 10) return "••••••••";
  return token.slice(0, 4) + "••••••••••••••••••••" + token.slice(-3);
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

  if (!cryptoSecret) {
    console.error("[meta-manual-connect] CRYPTO_SECRET não configurado");
    return json({ error: "Configuração interna incompleta." }, 500);
  }

  // Verifica JWT
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
    .select("id, role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const isAdminOrOwner = profile?.role === "owner" || profile?.role === "admin";
  const isAgency       = (user.email ?? "").endsWith("@agenciac8.com.br") ||
                         ["agency", "support"].includes(profile?.role ?? "");

  if (!isAdminOrOwner && !isAgency) {
    return json({ error: "Acesso negado. Apenas owner/admin podem usar configuração manual." }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const { action, organization_id } = body;
  if (!action || !organization_id) {
    return json({ error: "action e organization_id são obrigatórios" }, 400);
  }

  if (!isAgency && profile?.organization_id !== organization_id) {
    return json({ error: "Organização inválida." }, 403);
  }

  const orgId = organization_id as string;

  // ── SET_AGENCY_TOKEN ──────────────────────────────────────────────────────
  // Salva (ou substitui) o token global da agência em organization_meta_credentials.
  if (action === "set_agency_token") {
    const { access_token, display_name, token_type, meta_user_id, business_id, token_expires_at } = body;

    if (!access_token) {
      return json({ error: "access_token é obrigatório" }, 400);
    }

    let encryptedToken: string;
    try {
      encryptedToken = await encrypt(access_token as string, cryptoSecret);
    } catch {
      return json({ error: "Erro ao proteger a credencial." }, 500);
    }

    const preview = tokenPreview(access_token as string);

    // Desativa qualquer token ativo anterior
    await adminClient
      .from("organization_meta_credentials")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("is_active", true);

    // Insere o novo
    const { data: inserted, error: insertErr } = await adminClient
      .from("organization_meta_credentials")
      .insert({
        organization_id:         orgId,
        display_name:            display_name ?? "Token da Agência",
        token_type:              token_type   ?? "system_user",
        access_token_encrypted:  encryptedToken,
        token_is_set:            true,
        token_preview:           preview,
        meta_user_id:            meta_user_id ?? null,
        business_id:             business_id  ?? null,
        token_expires_at:        token_expires_at ?? null,
        token_last_validated_at: new Date().toISOString(),
        health_status:           "healthy",
        is_active:               true,
        created_by:              user.id,
        updated_by:              user.id,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[meta-manual-connect] set_agency_token error:", insertErr.message);
      return json({ error: "Erro ao salvar token da agência." }, 500);
    }

    await adminClient.from("meta_connection_audit").insert({
      organization_id:   orgId,
      action:            "agency_token_set",
      performed_by:      user.id,
      performed_by_role: profile?.role ?? "unknown",
      details:           { token_type: token_type ?? "system_user", display_name },
    });

    return json({ success: true, credential_id: (inserted as { id: string }).id });
  }

  // ── REMOVE_AGENCY_TOKEN ───────────────────────────────────────────────────
  if (action === "remove_agency_token") {
    await adminClient
      .from("organization_meta_credentials")
      .update({
        access_token_encrypted: null,
        token_is_set:           false,
        token_preview:          null,
        is_active:              false,
        updated_at:             new Date().toISOString(),
      })
      .eq("organization_id", orgId);

    await adminClient.from("meta_connection_audit").insert({
      organization_id:   orgId,
      action:            "agency_token_removed",
      performed_by:      user.id,
      performed_by_role: profile?.role ?? "unknown",
      details:           {},
    });

    return json({ success: true });
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (action === "create") {
    const {
      provider,
      connection_environment  = "production",
      display_name,
      access_token,
      use_agency_token        = false,
      client_id,
      meta_user_id,
      business_id,
      facebook_page_id,
      facebook_page_name,
      instagram_account_id,
      instagram_username,
      waba_id,
      whatsapp_phone_number_id,
      whatsapp_display_phone_number,
      ad_account_id,
      catalog_id,
      token_type              = "user",
      token_expires_at,
      force_update_existing_id,
    } = body;

    if (!provider) {
      return json({ error: "provider é obrigatório" }, 400);
    }

    // Se não usa token da agência, exige token próprio
    if (!use_agency_token && !access_token) {
      return json({ error: "access_token é obrigatório quando use_agency_token=false" }, 400);
    }

    // Se usa token da agência, verifica que ele existe
    if (use_agency_token) {
      const { data: agencyCred } = await adminClient
        .from("organization_meta_credentials")
        .select("id")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .eq("token_is_set", true)
        .maybeSingle();

      if (!agencyCred) {
        return json({
          error: "agency_token_not_configured",
          message: "Configure o token da agência antes de criar conexões que o utilizam.",
        }, 400);
      }
    }

    // Verifica duplicidade
    if (!force_update_existing_id) {
      const { data: dups } = await adminClient.rpc("check_meta_asset_duplicate", {
        p_organization_id:          orgId,
        p_facebook_page_id:         facebook_page_id         ?? null,
        p_instagram_account_id:     instagram_account_id     ?? null,
        p_whatsapp_phone_number_id: whatsapp_phone_number_id ?? null,
        p_waba_id:                  waba_id                  ?? null,
      });
      if (dups && (dups as unknown[]).length > 0) {
        return json({ error: "duplicate_asset", message: "Este ativo já está conectado.", existing: dups }, 409);
      }
    }

    // Criptografa token próprio (se houver)
    let encryptedToken: string | null = null;
    if (!use_agency_token && access_token) {
      try {
        encryptedToken = await encrypt(access_token as string, cryptoSecret);
      } catch {
        return json({ error: "Erro ao proteger a credencial." }, 500);
      }
    }

    const record: Record<string, unknown> = {
      organization_id:               orgId,
      created_by:                    user.id,
      provider,
      connection_method:             "manual",
      connection_environment,
      status:                        "active",
      display_name,
      use_agency_token,
      meta_user_id,
      business_id,
      facebook_page_id,
      facebook_page_name,
      instagram_account_id,
      instagram_username,
      waba_id,
      whatsapp_phone_number_id,
      whatsapp_display_phone_number,
      ad_account_id,
      catalog_id,
      client_id:                     client_id ?? null,
      access_token_encrypted:        encryptedToken,
      token_type:                    use_agency_token ? null : token_type,
      token_expires_at:              token_expires_at ?? null,
      token_last_validated_at:       new Date().toISOString(),
      health_status:                 "healthy",
    };

    let connectionId: string;

    if (force_update_existing_id) {
      const { error: updateErr } = await adminClient
        .from("meta_connections")
        .update({ ...record, updated_at: new Date().toISOString() })
        .eq("id", force_update_existing_id as string)
        .eq("organization_id", orgId);
      if (updateErr) return json({ error: "Erro ao atualizar conexão." }, 500);
      connectionId = force_update_existing_id as string;
    } else {
      const { data: inserted, error: insertErr } = await adminClient
        .from("meta_connections")
        .insert(record)
        .select("id")
        .single();
      if (insertErr) return json({ error: "Erro ao salvar conexão." }, 500);
      connectionId = (inserted as { id: string }).id;
    }

    await adminClient.from("meta_connection_audit").insert({
      connection_id:    connectionId,
      organization_id:  orgId,
      action:           "manual_connection_created",
      performed_by:     user.id,
      performed_by_role: profile?.role ?? "unknown",
      details: {
        provider,
        connection_environment,
        use_agency_token,
        has_facebook_page:  !!facebook_page_id,
        has_instagram:      !!instagram_account_id,
        has_whatsapp:       !!whatsapp_phone_number_id,
        display_name,
      },
    });

    return json({ success: true, connection_id: connectionId });
  }

  // ── REPLACE TOKEN ─────────────────────────────────────────────────────────
  if (action === "replace_token") {
    const { connection_id, access_token, token_expires_at } = body;
    if (!connection_id || !access_token) {
      return json({ error: "connection_id e access_token são obrigatórios" }, 400);
    }

    const { data: existing } = await adminClient
      .from("meta_connections")
      .select("id, organization_id, connection_method")
      .eq("id", connection_id as string)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!existing) return json({ error: "Conexão não encontrada." }, 404);

    let encryptedToken: string;
    try { encryptedToken = await encrypt(access_token as string, cryptoSecret); }
    catch { return json({ error: "Erro ao proteger a credencial." }, 500); }

    await adminClient
      .from("meta_connections")
      .update({
        access_token_encrypted:  encryptedToken,
        use_agency_token:        false,   // token próprio substitui o da agência
        token_expires_at:        token_expires_at ?? null,
        token_last_validated_at: new Date().toISOString(),
        status:                  "active",
        last_error:              null,
        health_status:           "healthy",
        updated_at:              new Date().toISOString(),
      })
      .eq("id", connection_id as string)
      .eq("organization_id", orgId);

    await adminClient.from("meta_connection_audit").insert({
      connection_id:    connection_id as string,
      organization_id:  orgId,
      action:           "manual_token_replaced",
      performed_by:     user.id,
      performed_by_role: profile?.role ?? "unknown",
      details: { connection_method: (existing as { connection_method: string }).connection_method },
    });

    return json({ success: true, connection_id });
  }

  // ── SWITCH_TO_AGENCY_TOKEN ────────────────────────────────────────────────
  // Muda uma conexão com token próprio para usar o token global da agência.
  if (action === "switch_to_agency_token") {
    const { connection_id } = body;
    if (!connection_id) return json({ error: "connection_id é obrigatório" }, 400);

    // Verifica que token da agência existe
    const { data: agencyCred } = await adminClient
      .from("organization_meta_credentials")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .eq("token_is_set", true)
      .maybeSingle();

    if (!agencyCred) {
      return json({ error: "agency_token_not_configured", message: "Configure o token da agência primeiro." }, 400);
    }

    await adminClient
      .from("meta_connections")
      .update({
        use_agency_token:        true,
        access_token_encrypted:  null,  // limpa token próprio
        token_last_validated_at: new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      })
      .eq("id", connection_id as string)
      .eq("organization_id", orgId);

    return json({ success: true });
  }

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  if (action === "disconnect") {
    const { connection_id, mode = "deactivate" } = body;
    if (!connection_id) return json({ error: "connection_id é obrigatório" }, 400);

    const { data: existing } = await adminClient
      .from("meta_connections")
      .select("id")
      .eq("id", connection_id as string)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!existing) return json({ error: "Conexão não encontrada." }, 404);

    if (mode === "remove_credentials") {
      await adminClient
        .from("meta_connections")
        .update({ access_token_encrypted: null, use_agency_token: false, status: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", connection_id as string)
        .eq("organization_id", orgId);
    } else {
      await adminClient
        .from("meta_connections")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", connection_id as string)
        .eq("organization_id", orgId);
    }

    await adminClient.from("meta_connection_audit").insert({
      connection_id:    connection_id as string,
      organization_id:  orgId,
      action:           mode === "remove_credentials" ? "connection_disconnected" : "connection_deactivated",
      performed_by:     user.id,
      performed_by_role: profile?.role ?? "unknown",
      details:          { mode },
    });

    return json({ success: true });
  }

  // ── MIGRATE TO OAUTH ──────────────────────────────────────────────────────
  if (action === "migrate_to_oauth") {
    const { connection_id, oauth_token_id } = body;
    if (!connection_id || !oauth_token_id) {
      return json({ error: "connection_id e oauth_token_id são obrigatórios" }, 400);
    }

    const { data: existing } = await adminClient
      .from("meta_connections")
      .select("id, connection_method")
      .eq("id", connection_id as string)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!existing) return json({ error: "Conexão não encontrada." }, 404);

    const prev = (existing as { connection_method: string }).connection_method;

    await adminClient
      .from("meta_connections")
      .update({
        connection_method:          "oauth",
        previous_connection_method: prev,
        migration_at:               new Date().toISOString(),
        migration_by:               user.id,
        oauth_token_id,
        access_token_encrypted:     null,
        use_agency_token:           false,
        status:                     "active",
        updated_at:                 new Date().toISOString(),
      })
      .eq("id", connection_id as string)
      .eq("organization_id", orgId);

    await adminClient.from("meta_connection_audit").insert({
      connection_id:    connection_id as string,
      organization_id:  orgId,
      action:           "connection_migrated_to_oauth",
      previous_method:  prev,
      new_method:       "oauth",
      performed_by:     user.id,
      performed_by_role: profile?.role ?? "unknown",
      details:          { oauth_token_id },
    });

    return json({ success: true });
  }

  return json({ error: "Ação inválida" }, 400);
});

export { encrypt, decrypt };

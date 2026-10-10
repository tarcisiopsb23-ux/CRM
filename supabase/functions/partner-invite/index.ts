/**
 * partner-invite
 *
 * Cria um novo parceiro/terceirizado para a organização.
 * Chamada pelo Maestr.IA (usuário interno autenticado com JWT da agência).
 *
 * Fluxo:
 *   1. Valida JWT do usuário da agência
 *   2. Verifica que o usuário pertence à organização
 *   3. Gera partner_slug a partir do nome (se não fornecido)
 *   4. Cria auth.users com email interno: <email>::<partner_slug>@c8partner.internal
 *   5. Insere em partner_users com login_key = email::partner_slug
 *   6. Retorna { partner_user_id, partner_slug }
 *
 * POST application/json:
 * {
 *   email:           string,
 *   full_name:       string,
 *   organization_id: string,
 *   specialty?:      string,
 *   phone?:          string,
 *   partner_slug?:   string,   // gerado automaticamente se omitido
 *   password?:       string    // senha inicial (opcional — padrão: aleatória)
 * }
 *
 * Autenticação: JWT do Maestr.IA (Bearer token do usuário da agência)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function randomPassword(length = 16): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  // Usa crypto.getRandomValues para senhas seguras no Deno
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const b of arr) pwd += chars[b % chars.length];
  return pwd;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Valida JWT do usuário da agência ──────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token de autenticação obrigatório" }, 401);

  const userClient = createClient(SUPA_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token inválido ou expirado" }, 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    email?:           string;
    full_name?:       string;
    organization_id?: string;
    specialty?:       string;
    phone?:           string;
    partner_slug?:    string;
    password?:        string;
  };
  try { body = await req.json(); }
  catch { return json({ error: "Body JSON inválido" }, 400); }

  const {
    email, full_name, organization_id,
    specialty, phone, password,
  } = body;

  if (!email?.trim())           return json({ error: "email obrigatório" }, 400);
  if (!full_name?.trim())       return json({ error: "full_name obrigatório" }, 400);
  if (!organization_id?.trim()) return json({ error: "organization_id obrigatório" }, 400);

  const emailNorm = email.trim().toLowerCase();

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Verifica que o usuário pertence à organização ─────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (!profile) {
    return json({ error: "Acesso negado — usuário não pertence à organização" }, 403);
  }

  // Apenas admin/owner podem convidar parceiros
  if (!["owner", "admin"].includes(profile.role ?? "")) {
    return json({ error: "Apenas admin ou owner podem convidar parceiros" }, 403);
  }

  // ── Gera partner_slug único ───────────────────────────────────────────────
  let partnerSlug = body.partner_slug?.trim().toLowerCase() || generateSlug(full_name!);

  // Garante unicidade do slug dentro da organização
  let slugAttempt = partnerSlug;
  let counter     = 1;
  while (true) {
    const { data: existing } = await admin
      .from("partner_users")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("partner_slug", slugAttempt)
      .maybeSingle();
    if (!existing) { partnerSlug = slugAttempt; break; }
    slugAttempt = `${partnerSlug}-${counter++}`;
    if (counter > 99) return json({ error: "Não foi possível gerar um slug único" }, 500);
  }

  const loginKey      = `${emailNorm}::${partnerSlug}`;
  const internalEmail = `${emailNorm}::${partnerSlug}@c8partner.internal`;
  const finalPassword = password?.trim() || randomPassword();

  // ── Verifica se já existe um parceiro com este login_key ──────────────────
  const { data: existingPartner } = await admin
    .from("partner_users")
    .select("id")
    .eq("login_key", loginKey)
    .maybeSingle();

  if (existingPartner) {
    return json({ error: `Parceiro com e-mail '${emailNorm}' e slug '${partnerSlug}' já existe` }, 409);
  }

  // ── Cria o usuário no Supabase Auth ───────────────────────────────────────
  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email:         internalEmail,
    password:      finalPassword,
    email_confirm: true,
    user_metadata: {
      real_email:    emailNorm,
      partner_slug:  partnerSlug,
      organization_id,
      user_type:     "partner",
      full_name:     full_name,
    },
    app_metadata: {
      user_type:      "partner",
      organization_id,
      partner_slug:   partnerSlug,
    },
  });

  if (createErr || !authUser.user) {
    console.error("[partner-invite] Auth create error:", createErr);
    return json({ error: createErr?.message ?? "Falha ao criar usuário" }, 500);
  }

  // ── Insere em partner_users ───────────────────────────────────────────────
  const { data: partnerUser, error: insertErr } = await admin
    .from("partner_users")
    .insert({
      organization_id,
      login_key:   loginKey,
      real_email:  emailNorm,
      partner_slug: partnerSlug,
      auth_user_id: authUser.user.id,
      full_name:   full_name!.trim(),
      specialty:   specialty ?? null,
      phone:       phone?.trim() ?? null,
      active:      true,
    })
    .select("id, partner_slug")
    .single();

  if (insertErr) {
    // Rollback: remove o auth user criado
    await admin.auth.admin.deleteUser(authUser.user.id);
    console.error("[partner-invite] Insert error:", insertErr);
    return json({ error: "Falha ao registrar parceiro" }, 500);
  }

  return json({
    success:         true,
    partner_user_id: partnerUser.id,
    partner_slug:    partnerUser.partner_slug,
    login_key:       loginKey,
    // Retorna a senha apenas se foi gerada automaticamente (para o admin comunicar ao parceiro)
    ...(body.password ? {} : { generated_password: finalPassword }),
    message: `Parceiro criado. Login: ${emailNorm} | Slug: ${partnerSlug}`,
  });
});

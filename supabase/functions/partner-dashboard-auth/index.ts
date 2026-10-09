/**
 * partner-dashboard-auth
 *
 * Autenticação do Portal Parceiro (parceiro.c8control.com.br).
 * Fluxo idêntico ao client-dashboard-auth, mas resolve partner_users
 * em vez de dashboard_users.
 *
 * login_key = lower(email) || '::' || lower(partner_slug)
 * E-mail em auth.users: <email>::<partner_slug>@c8partner.internal
 *
 * POST application/json:
 * { email: string, password: string, partner_slug?: string }
 *
 * Retorna:
 * { session, user: { id, email, full_name, specialty, partner_slug }, partner_info }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_MAX    = 5;
const RATE_WINDOW = 15 * 60; // 15 min em segundos

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("[partner-auth] UNCAUGHT:", err);
    return json({ error: "Erro interno do servidor" }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  let body: { email?: string; password?: string; partner_slug?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Corpo da requisição inválido" }, 400); }

  const { email, password, partner_slug } = body;
  if (!email?.trim() || !password) {
    return json({ error: "email e password são obrigatórios" }, 400);
  }

  const emailNorm    = email.trim().toLowerCase();
  const slugGiven    = partner_slug?.trim().toLowerCase() ?? "";
  const clientIp     = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rateKey      = `partner:${clientIp}:${slugGiven || emailNorm}`;

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = Math.floor(Date.now() / 1000);

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const { data: rateRow } = await admin
    .from("dashboard_login_attempts")
    .select("attempts, window_start, blocked_until")
    .eq("rate_key", rateKey)
    .maybeSingle();

  if (rateRow?.blocked_until && now < rateRow.blocked_until) {
    const wait = Math.ceil((rateRow.blocked_until - now) / 60);
    return json({ error: `Muitas tentativas. Aguarde ${wait} minuto(s).` }, 429);
  }

  // ── Resolve partner_slug se não fornecido ─────────────────────────────────
  let resolvedSlug = slugGiven;

  if (!resolvedSlug) {
    const { data: partnerRows } = await admin
      .from("partner_users")
      .select("partner_slug")
      .eq("real_email", emailNorm)
      .eq("active", true)
      .limit(2);

    if (!partnerRows || partnerRows.length === 0) {
      await incrementRateLimit(admin, rateKey, rateRow, now, RATE_MAX, RATE_WINDOW);
      return json({ error: "Parceiro não encontrado ou inativo" }, 401);
    }
    if (partnerRows.length > 1) {
      // Múltiplas organizações — solicita partner_slug
      return json({ multiple: true, error: "Informe o slug do parceiro" }, 409);
    }
    resolvedSlug = partnerRows[0].partner_slug;
  }

  const loginKey = `${emailNorm}::${resolvedSlug}`;

  // ── Busca partner_user via RPC ────────────────────────────────────────────
  const { data: partnerRows } = await admin
    .rpc("get_partner_user_by_login_key", { p_login_key: loginKey });

  if (!partnerRows || partnerRows.length === 0) {
    await incrementRateLimit(admin, rateKey, rateRow, now, RATE_MAX, RATE_WINDOW);
    return json({ error: "Credenciais inválidas" }, 401);
  }

  const partner = partnerRows[0];

  if (!partner.active) {
    return json({ error: "Conta inativa. Contate a agência." }, 403);
  }

  // ── Monta e-mail interno para auth ────────────────────────────────────────
  const internalEmail = `${emailNorm}::${resolvedSlug}@c8partner.internal`;

  // ── Autentica via Supabase Auth ───────────────────────────────────────────
  const authResponse = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        ANON_KEY,
    },
    body: JSON.stringify({ email: internalEmail, password }),
  });

  const authData = await authResponse.json();

  if (!authResponse.ok || !authData.access_token) {
    await incrementRateLimit(admin, rateKey, rateRow, now, RATE_MAX, RATE_WINDOW);
    return json({ error: "Credenciais inválidas" }, 401);
  }

  // ── Login bem-sucedido: limpa rate limit ──────────────────────────────────
  await admin
    .from("dashboard_login_attempts")
    .upsert({ rate_key: rateKey, attempts: 0, window_start: now, blocked_until: null })
    .eq("rate_key", rateKey);

  // ── Atualiza last_seen_at ─────────────────────────────────────────────────
  await admin
    .from("partner_users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", partner.partner_user_id);

  return json({
    session: {
      access_token:  authData.access_token,
      refresh_token: authData.refresh_token,
      expires_at:    authData.expires_at,
      expires_in:    authData.expires_in,
      token_type:    authData.token_type,
    },
    user: {
      id:             partner.partner_user_id,
      email:          partner.real_email,
      full_name:      partner.full_name,
      specialty:      partner.specialty,
      partner_slug:   partner.partner_slug,
      organization_id: partner.organization_id,
      org_name:       partner.org_name,
      user_type:      "partner",
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function incrementRateLimit(
  admin: ReturnType<typeof createClient>,
  rateKey: string,
  rateRow: { attempts: number; window_start: number; blocked_until: number } | null,
  now: number,
  maxAttempts: number,
  windowSeconds: number,
): Promise<void> {
  const windowStart = rateRow?.window_start ?? now;
  const inWindow    = rateRow && (now - windowStart) < windowSeconds;
  const attempts    = inWindow ? (rateRow!.attempts + 1) : 1;
  const blocked     = attempts >= maxAttempts ? now + windowSeconds : null;

  await admin.from("dashboard_login_attempts").upsert({
    rate_key:      rateKey,
    attempts,
    window_start:  inWindow ? windowStart : now,
    blocked_until: blocked,
  }).eq("rate_key", rateKey);
}

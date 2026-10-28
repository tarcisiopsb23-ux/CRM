/**
 * partner-token-login
 *
 * Faz o login automático do parceiro via token de convite recebido por e-mail.
 * Chamado pelo C8 Parceiro quando o parceiro clica no link do e-mail de convite.
 *
 * Fluxo:
 *   1. Recebe { token, partner_slug }
 *   2. Chama RPC validate_partner_invite_token — valida e marca como usado
 *   3. Busca o auth_user_id em partner_users pelo login_key resultante
 *   4. Gera uma session de curta duração via admin.generateLink (magic link OTP)
 *      ou via signInWithPassword com senha provisória (se ainda não foi trocada)
 *   5. Retorna { session, user, force_password_change }
 *
 * O parceiro usa essa session para fazer o primeiro login e então
 * é redirecionado para PartnerSetPasswordPage para trocar a senha.
 *
 * POST application/json:
 *   { token: string, partner_slug?: string }
 *
 * Sem autenticação — endpoint público (proteção via token único de 72h)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  let body: { token?: string; partner_slug?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Body JSON inválido" }, 400); }

  const { token } = body;
  if (!token?.trim()) return json({ error: "token obrigatório" }, 400);

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Valida o token via RPC ─────────────────────────────────────────────
  const { data: rpcResult, error: rpcErr } = await admin
    .rpc("validate_partner_invite_token", { p_token: token.trim() });

  if (rpcErr) {
    console.error("[partner-token-login] RPC error:", rpcErr);
    return json({ error: "Erro ao validar token" }, 500);
  }

  if (!rpcResult?.valid) {
    return json({
      error:  rpcResult?.reason ?? "Token inválido, expirado ou já utilizado",
      code:   "TOKEN_INVALID",
    }, 401);
  }

  // ── 2. Busca o parceiro pelo partner_id retornado pelo RPC ────────────────
  const { data: partner, error: partnerErr } = await admin
    .from("partner_users")
    .select("id, auth_user_id, login_key, real_email, partner_slug, full_name, specialty, partner_type, organization_id")
    .eq("id", rpcResult.partner_id)
    .eq("active", true)
    .maybeSingle();

  if (partnerErr || !partner?.auth_user_id) {
    return json({ error: "Parceiro não encontrado ou inativo" }, 404);
  }

  // ── 3. Gera link de login mágico (OTP) para o e-mail interno ─────────────
  // O e-mail interno é: real_email::partner_slug@c8partner.internal
  const internalEmail = `${partner.real_email}::${partner.partner_slug}@c8partner.internal`;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type:       "magiclink",
    email:      internalEmail,
    options: {
      redirectTo: `${Deno.env.get("C8_PARTNER_URL") ?? "https://parceiro.c8control.com.br"}/${partner.partner_slug}/set-password`,
    },
  });

  if (linkErr || !linkData?.properties) {
    console.error("[partner-token-login] generateLink error:", linkErr);
    // Fallback: retorna apenas os dados do parceiro para login manual
    return json({
      error:    "Não foi possível gerar a sessão automática. Use o login manual.",
      fallback: true,
      email:    partner.real_email,
      slug:     partner.partner_slug,
    }, 422);
  }

  // ── 4. Troca o hash_fragment/hashed_token por uma sessão real ─────────────
  // O generateLink retorna um action_link. Precisamos extrair o token OTP
  // e usá-lo para criar a sessão via verifyOtp.
  const actionLink   = linkData.properties.action_link ?? "";
  const urlObj       = new URL(actionLink);
  const otpToken     = urlObj.searchParams.get("token") ??
                       new URL(actionLink.replace("#", "?")).searchParams.get("access_token") ??
                       linkData.properties.hashed_token ?? "";

  // Cria client anon para fazer o verifyOtp (não usa service_role)
  const anonClient = createClient(SUPA_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sessionData, error: sessionErr } = await anonClient.auth.verifyOtp({
    email:    internalEmail,
    token:    otpToken,
    type:     "magiclink",
  });

  if (sessionErr || !sessionData?.session) {
    console.error("[partner-token-login] verifyOtp error:", sessionErr);
    // Fallback: redireciona para login manual com e-mail pré-preenchido
    return json({
      error:    "Sessão automática não disponível. Use o login manual.",
      fallback: true,
      email:    partner.real_email,
      slug:     partner.partner_slug,
    }, 422);
  }

  // ── 5. Atualiza last_seen_at ──────────────────────────────────────────────
  await admin
    .from("partner_users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", partner.id);

  // ── 6. Retorna sessão + dados do parceiro ─────────────────────────────────
  const forcePasswordChange = !!(
    sessionData.session.user?.user_metadata?.force_password_change
  );

  return json({
    session: {
      access_token:  sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_at:    sessionData.session.expires_at,
      expires_in:    sessionData.session.expires_in,
      token_type:    sessionData.session.token_type,
    },
    user: {
      id:              partner.id,
      email:           partner.real_email,
      full_name:       partner.full_name,
      specialty:       partner.specialty,
      partner_slug:    partner.partner_slug,
      organization_id: partner.organization_id,
      user_type:       "partner",
      force_password_change: forcePasswordChange,
    },
    force_password_change: forcePasswordChange,
  });
});

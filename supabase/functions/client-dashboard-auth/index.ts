/**
 * client-dashboard-auth — T-1.8
 *
 * Edge Function de autenticação para o Public Dashboard.
 * Proxy seguro para signInWithPassword no Banco B do cliente,
 * com rate limiting server-side: máximo 5 tentativas em 15 minutos por IP.
 *
 * Fluxo:
 * 1. Recebe { slug, email, password }
 * 2. Busca client_supabase_url + anon_key no Banco A via slug
 * 3. Verifica rate limit por IP na tabela dashboard_login_attempts (Banco A)
 * 4. Autentica no Banco B via signInWithPassword
 * 5. Retorna session JWT (sem expor anon_key)
 *
 * Segurança:
 * - anon_key do Banco B nunca é retornada ao frontend
 * - Bloqueio após 5 falhas em 15 min por IP
 * - CORS restrito
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX     = 5;
const RATE_LIMIT_WINDOW  = 15 * 60; // 15 minutos em segundos

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  let body: { slug?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }

  const { slug, email, password } = body;

  if (!slug?.trim() || !email?.trim() || !password) {
    return json({ error: "slug, email e password são obrigatórios" }, 400);
  }

  const clientIp   = getClientIp(req);
  const rateLimitKey = `${clientIp}:${slug.trim()}`;
  const emailNorm    = email.trim().toLowerCase();

  const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Verifica rate limit ────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);

  const { data: rateRow } = await adminClient
    .from("dashboard_login_attempts")
    .select("attempts, window_start, blocked_until")
    .eq("rate_key", rateLimitKey)
    .maybeSingle();

  if (rateRow) {
    // Verifica bloqueio ativo
    if (rateRow.blocked_until && now < rateRow.blocked_until) {
      const remaining = rateRow.blocked_until - now;
      return json({
        error: `Muitas tentativas. Aguarde ${Math.ceil(remaining / 60)} minuto(s) antes de tentar novamente.`,
        blocked: true,
      }, 429);
    }

    // Verifica janela de rate limit
    const windowStart = rateRow.window_start ?? 0;
    const inWindow = (now - windowStart) < RATE_LIMIT_WINDOW;

    if (inWindow && (rateRow.attempts ?? 0) >= RATE_LIMIT_MAX) {
      // Bloqueia pelo restante da janela
      await adminClient.from("dashboard_login_attempts").upsert({
        rate_key:      rateLimitKey,
        attempts:      rateRow.attempts,
        window_start:  windowStart,
        blocked_until: windowStart + RATE_LIMIT_WINDOW,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "rate_key" });

      return json({
        error: "Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.",
        blocked: true,
      }, 429);
    }
  }

  // ── 2. Busca dados do cliente no Banco A ──────────────────────────────────
  const { data: clients, error: fetchError } = await adminClient
    .rpc("get_client_by_slug", { p_slug: slug.trim() });

  if (fetchError || !clients?.length) {
    return json({ error: "Dashboard não encontrado" }, 404);
  }

  const client = clients[0] as {
    id: string;
    client_supabase_url: string | null;
    client_supabase_anon_key: string | null;
  };

  if (!client.client_supabase_url || !client.client_supabase_anon_key) {
    return json({ error: "Dashboard não configurado. Contate o administrador." }, 400);
  }

  // ── 3. Autentica no Banco B ───────────────────────────────────────────────
  const bankBClient = createClient(
    client.client_supabase_url,
    client.client_supabase_anon_key,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authData, error: authError } = await bankBClient.auth.signInWithPassword({
    email: emailNorm,
    password,
  });

  if (authError || !authData?.session) {
    // Incrementa contador de tentativas
    const windowStart = rateRow?.window_start ?? now;
    const inWindow    = (now - windowStart) < RATE_LIMIT_WINDOW;
    const attempts    = (inWindow ? (rateRow?.attempts ?? 0) : 0) + 1;

    await adminClient.from("dashboard_login_attempts").upsert({
      rate_key:      rateLimitKey,
      attempts,
      window_start:  inWindow ? windowStart : now,
      blocked_until: null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "rate_key" });

    return json({ error: "E-mail ou senha inválidos" }, 401);
  }

  // ── 4. Sucesso: limpa rate limit e retorna session ────────────────────────
  await adminClient
    .from("dashboard_login_attempts")
    .delete()
    .eq("rate_key", rateLimitKey);

  // Nunca retornar a anon_key — apenas a session do usuário
  return json({
    session: authData.session,
    user:    authData.user,
  });
});

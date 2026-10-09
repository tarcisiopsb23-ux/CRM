/**
 * lookup-clients-by-email
 *
 * Dado um e-mail real, retorna a lista de clientes do C8 Control
 * nos quais esse e-mail está cadastrado como usuário ativo.
 *
 * Usado pelo frontend antes do login para descobrir o slug sem
 * que o usuário precise conhecê-lo.
 *
 * Fluxo:
 *   1. Recebe { email }
 *   2. Busca em dashboard_users WHERE real_email = email AND active = true
 *   3. Para cada registro, busca o nome/empresa do cliente
 *   4. Retorna [{ slug, name, company }] — sem expor login_key nem dados internos
 *
 * Segurança:
 *   • Não retorna senha, login_key, auth_user_id nem e-mail interno
 *   • Não confirma nem nega a existência do e-mail de forma diferente
 *     (retorna lista vazia se não encontrar — sem distinguir "não existe" de "sem acesso")
 *   • Rate limiting básico: max 10 consultas por IP por minuto
 *   • Requer apenas anon key — não expõe dados sensíveis
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 60; // 1 minuto em segundos

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  try {
    let body: { email?: string };
    try { body = await req.json(); }
    catch { return json({ error: "Corpo da requisição inválido" }, 400); }

    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !email.includes("@")) {
      return json({ error: "E-mail inválido" }, 400);
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Rate limiting por IP ───────────────────────────────────────────────
    const clientIp = getClientIp(req);
    const rateKey  = `lookup:${clientIp}`;
    const now      = Math.floor(Date.now() / 1000);

    const { data: rateRow } = await admin
      .from("dashboard_login_attempts")
      .select("attempts, window_start, blocked_until")
      .eq("rate_key", rateKey)
      .maybeSingle();

    if (rateRow?.blocked_until && now < rateRow.blocked_until) {
      return json({ clients: [] }); // Silencioso — não revela o bloqueio
    }

    const windowStart = rateRow?.window_start ?? now;
    const inWindow    = (now - windowStart) < RATE_LIMIT_WINDOW;
    const attempts    = inWindow ? (rateRow?.attempts ?? 0) : 0;

    if (attempts >= RATE_LIMIT_MAX) {
      await admin.from("dashboard_login_attempts").upsert({
        rate_key:     rateKey,
        attempts:     attempts,
        window_start: windowStart,
        blocked_until: windowStart + RATE_LIMIT_WINDOW,
        updated_at:   new Date().toISOString(),
      }, { onConflict: "rate_key" });
      return json({ clients: [] }); // Silencioso
    }

    // Incrementa contador (fire-and-forget — não bloqueia a resposta)
    admin.from("dashboard_login_attempts").upsert({
      rate_key:     rateKey,
      attempts:     attempts + 1,
      window_start: inWindow ? windowStart : now,
      blocked_until: null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: "rate_key" }).then(() => {}).catch(() => {});

    // ── Busca clientes vinculados ao e-mail ────────────────────────────────
    const { data: rows, error } = await admin
      .from("dashboard_users")
      .select(`
        client_slug,
        role,
        clients!inner (
          name,
          company,
          c8_control_enabled
        )
      `)
      .eq("real_email", email)
      .eq("active", true)
      .order("client_slug", { ascending: true });

    if (error) {
      console.error("[lookup] DB error:", error.message);
      return json({ clients: [] }); // Silencioso — não expõe erros internos
    }

    if (!rows || rows.length === 0) {
      return json({ clients: [] });
    }

    // Filtra apenas clientes com c8_control_enabled = true
    // e monta resposta segura (sem login_key, auth_user_id, e-mail interno)
    const clients = rows
      .filter((r: any) => r.clients?.c8_control_enabled !== false)
      .map((r: any) => ({
        slug:    r.client_slug,
        name:    r.clients?.company || r.clients?.name || r.client_slug,
        role:    r.role,
      }));

    return json({ clients });

  } catch (err) {
    console.error("[lookup] UNCAUGHT:", err);
    return json({ clients: [] }); // Silencioso — nunca expõe stack trace
  }
});

/**
 * client-dashboard-auth — v4 (reescrito limpo)
 *
 * Fluxo:
 *   1. Recebe { slug?, email, password }
 *   2. Resolve slug + rate limit em paralelo
 *   3. Busca dashboard_user + autentica via fetch em paralelo
 *   4. Retorna { session, user, client_info, slug, mode }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const RATE_MAX    = 5;
const RATE_WINDOW = 15 * 60;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("[auth] UNCAUGHT:", err);
    return json({ error: "Erro interno do servidor" }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  let body: { slug?: string; email?: string; password?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Corpo da requisição inválido" }, 400); }

  const { slug, email, password } = body;
  if (!email?.trim() || !password) {
    return json({ error: "email e password são obrigatórios" }, 400);
  }

  const emailNorm = email.trim().toLowerCase();
  const clientIp  = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const SUPA_URL  = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now         = Math.floor(Date.now() / 1000);
  const slugGiven   = slug?.trim().toLowerCase() ?? "";
  const hasSlug     = !!slugGiven;
  const rateKeyTemp = hasSlug ? `${clientIp}:${slugGiven}` : `${clientIp}:${emailNorm}`;

  // ── Fase 1: resolve slug + rate limit (paralelo) ─────────────────────────
  const [slugRes, rateRes] = await Promise.all([

    hasSlug
      ? Promise.resolve({ slugNorm: slugGiven, notFound: false, multiple: false })
      : (async () => {
          const { data, error } = await admin
            .from("dashboard_users")
            .select("client_slug")
            .eq("real_email", emailNorm)
            .eq("active", true)
            .limit(2);
          if (error || !data || data.length === 0) return { slugNorm: "", notFound: true,  multiple: false };
          if (data.length > 1)                     return { slugNorm: "", notFound: false, multiple: true  };
          return { slugNorm: String(data[0].client_slug).toLowerCase(), notFound: false, multiple: false };
        })(),

    (async () => {
      const { data } = await admin
        .from("dashboard_login_attempts")
        .select("attempts, window_start, blocked_until")
        .eq("rate_key", rateKeyTemp)
        .maybeSingle();
      return data as { attempts: number; window_start: number; blocked_until: number | null } | null;
    })(),

  ]);

  if (slugRes.notFound) return json({ error: "E-mail ou senha inválidos" }, 401);
  if (slugRes.multiple)  return json({ error: "Múltiplos clientes encontrados. Informe o cliente desejado.", multiple: true }, 409);

  const slugNorm = slugRes.slugNorm;
  const rateKey  = `${clientIp}:${slugNorm}`;
  const rateRow  = rateRes;

  if (rateRow?.blocked_until && now < rateRow.blocked_until) {
    return json({ error: `Muitas tentativas. Aguarde ${Math.ceil((rateRow.blocked_until - now) / 60)} minuto(s).`, blocked: true }, 429);
  }

  const wStart   = rateRow?.window_start ?? now;
  const inWindow = (now - wStart) < RATE_WINDOW;
  if (inWindow && (rateRow?.attempts ?? 0) >= RATE_MAX) {
    admin.from("dashboard_login_attempts").upsert({
      rate_key: rateKey, attempts: rateRow!.attempts,
      window_start: wStart, blocked_until: wStart + RATE_WINDOW,
      updated_at: new Date().toISOString(),
    }, { onConflict: "rate_key" }).then(() => {});
    return json({ error: "Muitas tentativas. Aguarde 15 minutos.", blocked: true }, 429);
  }

  const recordFailure = async () => {
    const attempts = (inWindow ? (rateRow?.attempts ?? 0) : 0) + 1;
    await admin.from("dashboard_login_attempts").upsert({
      rate_key: rateKey, attempts,
      window_start: inWindow ? wStart : now,
      blocked_until: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "rate_key" });
  };

  // ── Fase 2: busca dashboard_user + autentica (paralelo) ───────────────────
  const loginKey   = `${emailNorm}::${slugNorm}`;
  const emailLocal = emailNorm.split("@")[0]; // "cantinhodochurrascoto" de "cantinhodochurrascoto@gmail.com"

  // Formatos de email interno a tentar (em ordem):
  //   1. email::slug@c8.internal  — usuários criados pela migration SQL original
  //   2. emaillocal_slug@c8.internal — usuários criados via admin API (sem :: no email)
  const trySignIn = async (): Promise<{ ok: boolean; session?: Record<string,string>; userId?: string }> => {
    const formats = [
      `${loginKey}@c8.internal`,
      `${emailLocal}_${slugNorm}@c8.internal`,
    ];
    for (const fmt of formats) {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
          body: JSON.stringify({ email: fmt, password }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.status === 500) { console.log("[auth] signIn 500 on fmt", fmt.slice(-30)); continue; }
        if (r.status === 400) {
          const e = await r.json().catch(() => ({})) as Record<string,string>;
          // Se é o primeiro formato e a senha pode estar certa mas no formato errado, tenta o próximo
          if (formats.indexOf(fmt) === 0) { console.log("[auth] signIn 400 fmt1, trying fmt2"); continue; }
          console.log("[auth] signIn 400 fmt2:", e.msg);
          return { ok: false };
        }
        if (!r.ok) { console.log("[auth] signIn", r.status, "on fmt", fmt.slice(-30)); return { ok: false }; }
        const d = await r.json() as Record<string, unknown>;
        console.log("[auth] signIn OK fmt:", fmt.includes("::") ? "::" : "_");
        return {
          ok: true,
          session: {
            access_token:  d.access_token  as string,
            refresh_token: d.refresh_token as string,
            expires_in:    String(d.expires_in),
            token_type:    d.token_type    as string,
          },
          userId: (d.user as Record<string,string>)?.id,
        };
      } catch (e: unknown) {
        clearTimeout(timer);
        console.log("[auth] signIn threw:", (e as Error).message?.slice(0,60));
        if ((e as Error).message?.includes("abort")) continue;
        return { ok: false };
      }
    }
    return { ok: false };
  };

  const [duRes, signInRes] = await Promise.all([
    admin.rpc("get_dashboard_user_by_login_key", { p_login_key: loginKey }),
    trySignIn(),
  ]);

  console.log("[auth] duErr:", duRes.error?.message ?? null, "| signIn ok:", signInRes.ok);

  if (!signInRes.ok || !signInRes.session) {
    await recordFailure();
    return json({ error: "E-mail ou senha inválidos" }, 401);
  }

  const duRows = Array.isArray(duRes.data) ? duRes.data : (duRes.data ? [duRes.data] : []);
  const duRow  = (duRows[0] ?? null) as Record<string, unknown> | null;

  if (!duRow?.auth_user_id) {
    await recordFailure();
    return json({ error: "E-mail ou senha inválidos" }, 401);
  }

  // Fire-and-forget: last_seen + rate limit clear
  admin.rpc("update_dashboard_user_last_seen", { p_auth_user_id: signInRes.userId }).then(() => {});
  admin.from("dashboard_login_attempts").delete().eq("rate_key", rateKey).then(() => {});

  return json({
    session: signInRes.session,
    user: {
      id:        signInRes.userId ?? "",
      email:     emailNorm,
      full_name: duRow.full_name ?? "",
      role:      duRow.role      ?? "member",
    },
    client_info: {
      id:                   duRow.client_id,
      organization_id:      duRow.organization_id,
      name:                 duRow.client_name,
      company:              duRow.client_company,
      show_ia_content:      duRow.show_ia_content     ?? false,
      c8_control_enabled:   duRow.c8_control_enabled  ?? false,
      modules_config:       duRow.modules_config       ?? {},
      metadata:             duRow.metadata             ?? {},
      client_supabase_url:  null,
      client_supabase_anon_key: null,
      migration_completed:  duRow.migration_completed  ?? true,
    },
    slug: slugNorm,
    mode: "bank_a",
  });
}

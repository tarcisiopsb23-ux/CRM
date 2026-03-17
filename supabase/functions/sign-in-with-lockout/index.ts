import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 30;
const MAX_ATTEMPTS = 3;

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corpo da requisição inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Informe um e-mail válido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!password) {
    return new Response(JSON.stringify({ error: "Informe sua senha" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date();

    const { data: attemptRow, error: attemptErr } = await adminClient
      .from("login_attempts")
      .select("email, attempts, window_start, locked_until")
      .eq("email", email)
      .maybeSingle();
    if (attemptErr) throw attemptErr;

    const lockedUntil = attemptRow?.locked_until ? new Date(attemptRow.locked_until as string) : null;
    if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
      return new Response(
        JSON.stringify({
          error: `Acesso bloqueado. Tente novamente após ${LOCK_MINUTES} minutos.`,
          locked_until: lockedUntil.toISOString(),
        }),
        { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const windowStart = attemptRow?.window_start ? new Date(attemptRow.window_start as string) : null;
    const isSameWindow =
      windowStart ? now.getTime() - windowStart.getTime() <= WINDOW_MINUTES * 60_000 : false;

    const attemptsBase = attemptRow?.attempts ?? 0;
    const attempts = isSameWindow ? attemptsBase : 0;
    const nextWindowStart = isSameWindow ? (windowStart as Date) : now;

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      const nextAttempts = attempts + 1;
      const shouldLock = nextAttempts >= MAX_ATTEMPTS;
      const lockUntilIso = shouldLock ? addMinutes(now, LOCK_MINUTES).toISOString() : null;

      const { error: upsertErr } = await adminClient
        .from("login_attempts")
        .upsert(
          {
            email,
            attempts: nextAttempts,
            window_start: nextWindowStart.toISOString(),
            locked_until: lockUntilIso,
            updated_at: nowIso(),
          },
          { onConflict: "email" }
        );
      if (upsertErr) throw upsertErr;

      if (shouldLock) {
        return new Response(
          JSON.stringify({
            error: `Acesso bloqueado por ${LOCK_MINUTES} minutos após ${MAX_ATTEMPTS} tentativas inválidas.`,
            locked_until: lockUntilIso,
          }),
          { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (nextAttempts === 2) {
        return new Response(
          JSON.stringify({
            error: `Senha incorreta. Mais uma tentativa e o acesso será bloqueado por ${LOCK_MINUTES} minutos.`,
            remaining_attempts: 1,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ error: "E-mail ou senha inválidos" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("login_attempts").delete().eq("email", email);

    return new Response(
      JSON.stringify({
        session: signInData.session,
        user: signInData.user,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


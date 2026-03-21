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

function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hashPasswordPBKDF2(password: string, saltB64: string) {
  const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 150_000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
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

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!bearer || bearer.split(".").length !== 3) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corpo da requisição inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const keyForAuth = anonKey || serviceKey;

    const authClient = createClient(supabaseUrl, keyForAuth, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão expirada. Faça login novamente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: historyRows, error: historyErr } = await adminClient
      .from("password_history")
      .select("password_hash, salt")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (historyErr) {
      const m = String((historyErr as { message?: string } | null)?.message ?? "");
      if (m.includes("password_history") && m.includes("does not exist")) {
        return new Response(JSON.stringify({ error: "Migração de senha não aplicada. Execute 00049_password_history.sql no Supabase." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw historyErr;
    }

    for (const r of (historyRows ?? []) as Array<{ password_hash: string; salt: string }>) {
      const nextHash = await hashPasswordPBKDF2(password, String(r.salt));
      if (nextHash === String(r.password_hash)) {
        return new Response(JSON.stringify({ error: "Senha já utilizada anteriormente. Defina uma senha diferente." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, { password });
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message || "Falha ao atualizar senha" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = bytesToBase64(saltBytes);
    const passwordHash = await hashPasswordPBKDF2(password, salt);

    const { error: insertErr } = await adminClient
      .from("password_history")
      .insert({ user_id: user.id, password_hash: passwordHash, salt });
    if (insertErr) {
      const m = String((insertErr as { message?: string } | null)?.message ?? "");
      if (m.includes("password_history") && m.includes("does not exist")) {
        return new Response(JSON.stringify({ error: "Migração de senha não aplicada. Execute 00049_password_history.sql no Supabase." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertErr;
    }

    const emailToClear = user.email ? String(user.email).trim().toLowerCase() : "";
    if (emailToClear) {
      const { error: clearErr } = await adminClient.from("login_attempts").delete().eq("email", emailToClear);
      if (clearErr) throw clearErr;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

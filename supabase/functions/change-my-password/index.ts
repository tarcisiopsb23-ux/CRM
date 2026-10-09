/**
 * change-my-password
 *
 * Altera a senha do dashboard_user autenticado no Banco A.
 *
 * Body: { current_password: string, password: string }
 *   • Verifica a senha atual via signIn antes de alterar
 *   • Exige senha forte (maiúscula + minúscula + número + especial)
 *   • Atualiza via admin.updateUserById (service_role)
 *
 * Requer: Authorization: Bearer <access_token> da sessão ativa.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  // ── Extrai Bearer token ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) {
    return json({ error: "Token inválido" }, 401);
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { password?: string; current_password?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Corpo da requisição inválido" }, 400); }

  const newPassword     = typeof body.password         === "string" ? body.password.trim()         : "";
  const currentPassword = typeof body.current_password === "string" ? body.current_password.trim() : "";

  if (!currentPassword) return json({ error: "Senha atual é obrigatória." }, 400);
  if (newPassword.length < 8) return json({ error: "A nova senha deve ter no mínimo 8 caracteres." }, 400);

  // ── Validação de senha forte ────────────────────────────────────────────────
  if (!/[A-Z]/.test(newPassword))                               return json({ error: "A nova senha deve conter pelo menos uma letra maiúscula." }, 400);
  if (!/[a-z]/.test(newPassword))                               return json({ error: "A nova senha deve conter pelo menos uma letra minúscula." }, 400);
  if (!/[0-9]/.test(newPassword))                               return json({ error: "A nova senha deve conter pelo menos um número." }, 400);
  if (!/[!@#$%^&*()\-_+=[\]{};':"|<>?,./`~\\]/.test(newPassword)) return json({ error: "A nova senha deve conter pelo menos um caractere especial." }, 400);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;

    // ── Obtém o user pelo token ───────────────────────────────────────────────
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth:   { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Sessão expirada. Faça login novamente." }, 401);
    }

    // ── Verifica a senha atual ────────────────────────────────────────────────
    // O email interno está em user.email (ex: "teste@teste.com::teste-agencia-c8@c8.internal"
    // ou "cantinhodochurrascoto_cantinho-do-churrasco@c8.internal")
    const internalEmail = user.email ?? "";
    if (!internalEmail) {
      return json({ error: "Não foi possível identificar o usuário." }, 400);
    }

    const verifyResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": anonKey },
      body:    JSON.stringify({ email: internalEmail, password: currentPassword }),
    });

    if (!verifyResp.ok) {
      // Tenta formato alternativo se o email tiver ::
      if (internalEmail.includes("::") && verifyResp.status === 500) {
        // Converte email::slug@c8.internal → emaillocal_slug@c8.internal
        const withoutDomain = internalEmail.replace("@c8.internal", "");
        const parts = withoutDomain.split("::");
        if (parts.length === 2) {
          const emailLocal = parts[0].split("@")[0];
          const slug       = parts[1];
          const altEmail   = `${emailLocal}_${slug}@c8.internal`;

          const verifyResp2 = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method:  "POST",
            headers: { "Content-Type": "application/json", "apikey": anonKey },
            body:    JSON.stringify({ email: altEmail, password: currentPassword }),
          });

          if (!verifyResp2.ok) {
            return json({ error: "Senha atual incorreta." }, 401);
          }
        } else {
          return json({ error: "Senha atual incorreta." }, 401);
        }
      } else {
        return json({ error: "Senha atual incorreta." }, 401);
      }
    }

    // ── Atualiza a senha ──────────────────────────────────────────────────────
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateErr) {
      console.error("[change-pw] updateUserById error:", updateErr.message);
      return json({ error: updateErr.message ?? "Falha ao atualizar senha." }, 400);
    }

    console.log("[change-pw] password updated for user:", user.id);
    return json({ success: true });

  } catch (err) {
    console.error("[change-pw] UNCAUGHT:", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno do servidor." }, 500);
  }
});

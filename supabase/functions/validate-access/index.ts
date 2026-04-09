/**
 * Edge Function: validate-access
 *
 * Gerencia acesso de usuários por tenant, verificando limites de plano no SaaS_DB.
 *
 * Actions:
 *   check-limit — verifica quantos usuários o tenant tem e qual o limite do plano
 *   invite      — convida novo usuário (cria no SaaS Auth + registra em tenant_users)
 *   remove      — remove usuário do tenant (deleta de tenant_users + revoga no SaaS Auth)
 *
 * Segurança:
 *   - O caller deve enviar um JWT válido no header Authorization
 *   - O caller deve pertencer ao mesmo tenant_id do body (ou ter role='support')
 *   - Para invite/remove: o caller deve ter role='admin' ou role='support'
 *
 * IMPORTANTE: Usuários de suporte (role='support') NUNCA são registrados em tenant_users
 * e NUNCA são contabilizados no limite de usuários de nenhum plano.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL              — CRM_DB URL
 *   SUPABASE_SERVICE_ROLE_KEY — CRM_DB service role key
 *   SAAS_URL                  — SaaS Supabase URL
 *   SAAS_SERVICE_ROLE_KEY     — SaaS service role key
 *   SAAS_JWT_SECRET           — JWT secret compartilhado para validação de assinatura
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractBearerToken,
  verifyJwt,
  isValidUuid,
  isValidEmail,
  JwtPayload,
} from "../_shared/jwt.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidateAccessRequest {
  action: "check-limit" | "invite" | "remove";
  tenant_id: string;
  email?: string;
  user_id?: string;
}

interface LimitResult {
  allowed: boolean;
  current_users: number;
  max_users: number;
  plan_name: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Autenticar o caller ──────────────────────────────────────────────────
    const callerToken = extractBearerToken(req);
    if (!callerToken) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const jwtSecret = Deno.env.get("SAAS_JWT_SECRET") ?? "";
    let callerPayload: JwtPayload;
    try {
      callerPayload = await verifyJwt(callerToken, jwtSecret);
    } catch (e: any) {
      return jsonResponse({ error: "Token inválido ou expirado" }, 401);
    }

    const callerTenantId = callerPayload.tenant_id ?? null;
    const callerRole = callerPayload.role ?? "member";
    const isSupport = callerRole === "support";

    // ── Parse e validação do body ────────────────────────────────────────────
    let body: ValidateAccessRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Body JSON inválido" }, 400);
    }

    const { action, tenant_id } = body;

    if (!action || !tenant_id) {
      return jsonResponse({ error: "action e tenant_id são obrigatórios" }, 400);
    }

    if (!isValidUuid(tenant_id)) {
      return jsonResponse({ error: "tenant_id inválido" }, 400);
    }

    // ── Autorização: caller deve pertencer ao tenant ou ser suporte ──────────
    if (!isSupport && callerTenantId !== tenant_id) {
      return jsonResponse({ error: "Acesso negado" }, 403);
    }

    // Para invite/remove: apenas admin ou suporte
    if ((action === "invite" || action === "remove") && callerRole !== "admin" && !isSupport) {
      return jsonResponse({ error: "Apenas administradores podem convidar ou remover usuários" }, 403);
    }

    // ── Clientes Supabase ────────────────────────────────────────────────────
    const crmClient: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const saasClient: SupabaseClient = createClient(
      Deno.env.get("SAAS_URL") ?? "",
      Deno.env.get("SAAS_SERVICE_ROLE_KEY") ?? ""
    );

    // ── check-limit ──────────────────────────────────────────────────────────
    if (action === "check-limit") {
      const result = await checkLimit(crmClient, saasClient, tenant_id);
      return jsonResponse(result);
    }

    // ── invite ───────────────────────────────────────────────────────────────
    if (action === "invite") {
      const { email } = body;
      if (!email) return jsonResponse({ error: "email é obrigatório para invite" }, 400);
      if (!isValidEmail(email)) return jsonResponse({ error: "Formato de e-mail inválido" }, 400);

      const limit = await checkLimit(crmClient, saasClient, tenant_id);
      if (!limit.allowed) {
        return jsonResponse({
          allowed: false,
          error: `Limite de usuários atingido. Plano ${limit.plan_name}: máximo ${limit.max_users} usuário(s).`,
          current_users: limit.current_users,
          max_users: limit.max_users,
          plan_name: limit.plan_name,
        }, 403);
      }

      const saasUrl = Deno.env.get("SAAS_URL") ?? "";
      const saasServiceKey = Deno.env.get("SAAS_SERVICE_ROLE_KEY") ?? "";

      const createRes = await fetch(`${saasUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${saasServiceKey}`,
          "apikey": saasServiceKey,
        },
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: { tenant_id, role: "member" },
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok || createData.error) {
        const errMsg = createData.error?.message ?? createData.msg ?? "Erro ao criar usuário";
        return jsonResponse({ allowed: false, error: errMsg }, 400);
      }

      const newUserId = createData.id ?? createData.user?.id;
      if (!newUserId) {
        return jsonResponse({ allowed: false, error: "Usuário criado mas ID não retornado" }, 500);
      }

      const { error: insertErr } = await crmClient
        .from("tenant_users")
        .insert({ user_id: newUserId, tenant_id, role: "member" });

      if (insertErr) {
        // Rollback: remover usuário do SaaS se o insert falhou
        await fetch(`${saasUrl}/auth/v1/admin/users/${newUserId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${saasServiceKey}`, "apikey": saasServiceKey },
        });
        console.error("[validate-access] insert tenant_users error:", insertErr.message);
        return jsonResponse({ allowed: false, error: "Erro ao registrar usuário. Tente novamente." }, 500);
      }

      return jsonResponse({ success: true, user_id: newUserId });
    }

    // ── remove ───────────────────────────────────────────────────────────────
    if (action === "remove") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ error: "user_id é obrigatório para remove" }, 400);
      if (!isValidUuid(user_id)) return jsonResponse({ error: "user_id inválido" }, 400);

      // Verificar que o usuário realmente pertence ao tenant ANTES de qualquer deleção
      const { count: existingCount, error: checkErr } = await crmClient
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id);

      if (checkErr) {
        console.error("[validate-access] check user error:", checkErr.message);
        return jsonResponse({ error: "Erro ao verificar usuário" }, 500);
      }

      if (!existingCount || existingCount === 0) {
        return jsonResponse({ error: "Usuário não encontrado neste tenant" }, 404);
      }

      // Deletar do CRM_DB
      const { error: deleteErr } = await crmClient
        .from("tenant_users")
        .delete()
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id);

      if (deleteErr) {
        console.error("[validate-access] delete tenant_users error:", deleteErr.message);
        return jsonResponse({ error: "Erro ao remover usuário. Tente novamente." }, 500);
      }

      // Revogar acesso no SaaS Auth (somente após confirmar que pertencia ao tenant)
      const saasUrl = Deno.env.get("SAAS_URL") ?? "";
      const saasServiceKey = Deno.env.get("SAAS_SERVICE_ROLE_KEY") ?? "";

      const revokeRes = await fetch(`${saasUrl}/auth/v1/admin/users/${user_id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${saasServiceKey}`, "apikey": saasServiceKey },
      });

      if (!revokeRes.ok) {
        console.warn(`[validate-access] Usuário ${user_id} removido do CRM mas falhou ao revogar no SaaS: ${revokeRes.status}`);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `action inválida: ${action}` }, 400);

  } catch (err: any) {
    console.error("[validate-access] unhandled error:", err.message);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkLimit(
  crmClient: SupabaseClient,
  saasClient: SupabaseClient,
  tenant_id: string
): Promise<LimitResult> {
  const { count: currentUsers, error: countErr } = await crmClient
    .from("tenant_users")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant_id);

  if (countErr) throw new Error(`Erro ao contar usuários: ${countErr.message}`);

  const { data: sub } = await saasClient
    .from("tenant_subscriptions")
    .select("status, plans(name, max_users)")
    .eq("tenant_id", tenant_id)
    .eq("status", "active")
    .single();

  const maxUsers: number = (sub as any)?.plans?.max_users ?? 3;
  const planName: string = (sub as any)?.plans?.name ?? "Starter";
  const current = currentUsers ?? 0;

  return {
    allowed: current < maxUsers,
    current_users: current,
    max_users: maxUsers,
    plan_name: planName,
  };
}

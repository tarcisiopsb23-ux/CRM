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
  decodeJwtPayload,
  isValidUuid,
  isValidEmail,
} from "../_shared/jwt.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidateAccessRequest {
  action: "check-limit" | "invite" | "resend-invite" | "remove" | "list-users";
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

    // O Supabase valida o JWT antes de chegar na Edge Function.
    // Decodificamos o payload sem reverificar a assinatura (evita problema com ES256).
    const callerPayload = decodeJwtPayload(callerToken);
    if (!callerPayload) {
      return jsonResponse({ error: "Token inválido" }, 401);
    }

    const callerTenantId = callerPayload.tenant_id ?? null;
    // app_role é o claim da aplicação (migration 20260516000003)
    // role é fallback para tokens antigos (antes da migration)
    const callerRole = callerPayload.app_role ?? callerPayload.role ?? "member";
    // agency/support/owner = usuários da agência com acesso total
    const isSupport = ["support", "agency", "owner"].includes(callerRole);

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

    // Para invite/remove: apenas admin, owner ou suporte
    if ((action === "invite" || action === "remove") && callerRole !== "admin" && callerRole !== "owner" && !isSupport) {
      return jsonResponse({ error: "Apenas administradores podem convidar ou remover usuários" }, 403);
    }

    // ── Clientes Supabase ────────────────────────────────────────────────────
    // crmClient usa service role — acesso total ao banco do C8 Control
    const crmClient: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // saasClient mantido para compatibilidade mas não é mais usado para criar usuários
    const saasClient: SupabaseClient = crmClient;

    // ── check-limit ──────────────────────────────────────────────────────────
    if (action === "check-limit") {
      const result = await checkLimit(crmClient, saasClient, tenant_id);
      return jsonResponse(result);
    }

    // ── list-users — retorna usuários do tenant com email (service role) ─────
    if (action === "list-users") {
      // Buscar registros em tenant_users — excluindo owners e agency (suporte)
      const { data: tuRows, error: tuErr } = await crmClient
        .from("tenant_users")
        .select("id, user_id, tenant_id, role, created_at")
        .eq("tenant_id", tenant_id)
        .not("role", "in", '("owner","agency")')
        .order("created_at", { ascending: true });

      if (tuErr) return jsonResponse({ error: tuErr.message }, 500);

      // Buscar emails via auth.admin — paginar para garantir todos
      const emailMap = new Map<string, string>();
      let page = 1;
      while (true) {
        const { data: authList } = await crmClient.auth.admin.listUsers({ page, perPage: 1000 });
        const users = authList?.users ?? [];
        for (const u of users) emailMap.set(u.id, u.email ?? "");
        if (users.length < 1000) break;
        page++;
      }

      const users = (tuRows ?? []).map((u: any) => ({
        ...u,
        email: emailMap.get(u.user_id) ?? null,
      }));

      return jsonResponse({ users });
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

      // Gerar senha temporária segura (12 chars: letras + números)
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => chars[b % chars.length]).join("");

      // Buscar nome do tenant para personalizar o e-mail
      const { data: clientRow } = await crmClient
        .from("clients").select("name, company").eq("tenant_id", tenant_id).maybeSingle();
      const tenantName = clientRow?.company || clientRow?.name || "C8 Control";

      // Criar usuário com senha temporária
      const { data: newUser, error: createErr } = await crmClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password: tempPassword,
        user_metadata: {
          tenant_id,
          role:                  "member",
          force_password_change: true,
        },
      });

      if (createErr || !newUser?.user) {
        const isDuplicate = createErr?.message?.toLowerCase().includes("already registered")
          || createErr?.message?.toLowerCase().includes("already exists");
        return jsonResponse({
          allowed: false,
          error: isDuplicate
            ? `E-mail '${email}' já está cadastrado no C8 Control.`
            : `Erro ao criar usuário: ${createErr?.message ?? "desconhecido"}`,
        }, isDuplicate ? 409 : 400);
      }

      const newUserId = newUser.user.id;

      const { error: insertErr } = await crmClient
        .from("tenant_users")
        .insert({ user_id: newUserId, tenant_id, role: "member" });

      if (insertErr) {
        await crmClient.auth.admin.deleteUser(newUserId);
        console.error("[validate-access] insert tenant_users error:", insertErr.message);
        return jsonResponse({ allowed: false, error: "Erro ao registrar usuário. Tente novamente." }, 500);
      }

      // Enviar e-mail de convite via Resend
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const appUrl    = Deno.env.get("APP_URL") ?? "https://c8control.com.br";
      if (resendKey) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type":  "application/json",
            },
            body: JSON.stringify({
              from:    "Suporte Agência C8 <suporte@agenciac8.com.br>",
              to:      email,
              subject: `Você foi convidado para o ${tenantName} no C8 Control`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0F172A;color:#e2e8f0;border-radius:12px;">
                  <div style="text-align:center;margin-bottom:24px;">
                    <div style="display:inline-block;background:#7C3AED;border-radius:12px;padding:12px 20px;">
                      <span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-1px;">C8 CONTROL</span>
                    </div>
                  </div>
                  <h2 style="color:#fff;font-size:20px;font-weight:800;margin:0 0 8px;">Você foi convidado!</h2>
                  <p style="color:#94a3b8;margin:0 0 20px;">
                    Você recebeu acesso ao dashboard <strong style="color:#e2e8f0;">${tenantName}</strong> no C8 Control.
                  </p>
                  <div style="background:#1E293B;border-radius:8px;padding:16px;margin-bottom:20px;">
                    <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Seus dados de acesso</p>
                    <p style="margin:0 0 4px;color:#e2e8f0;"><strong>E-mail:</strong> ${email}</p>
                    <p style="margin:0;color:#e2e8f0;"><strong>Senha temporária:</strong> <span style="font-family:monospace;background:#0F172A;padding:2px 8px;border-radius:4px;color:#a78bfa;">${tempPassword}</span></p>
                  </div>
                  <p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">
                    Você será solicitado a criar uma nova senha no primeiro acesso.
                  </p>
                  <a href="${appUrl}/login" style="display:inline-block;background:#7C3AED;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
                    Acessar o Dashboard
                  </a>
                  <p style="color:#475569;font-size:11px;margin-top:28px;border-top:1px solid #1E293B;padding-top:16px;">
                    Powered by Agência C8 · Este e-mail foi enviado automaticamente, não responda.
                  </p>
                </div>
              `,
            }),
          });
          console.log(`[validate-access] E-mail de convite enviado para ${email}`);
        } catch (emailErr: any) {
          // Falha no e-mail não reverte o convite — usuário foi criado
          console.warn("[validate-access] Falha ao enviar e-mail via Resend:", emailErr.message);
        }
      }

      return jsonResponse({ success: true, user_id: newUserId, email });
    }

    // ── resend-invite — gera nova senha, desbloqueia e reenvia e-mail ────────
    if (action === "resend-invite") {
      const { user_id } = body;
      if (!user_id) return jsonResponse({ error: "user_id é obrigatório para resend-invite" }, 400);
      if (!isValidUuid(user_id)) return jsonResponse({ error: "user_id inválido" }, 400);

      // Verificar que o usuário pertence ao tenant
      const { count } = await crmClient
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id);

      if (!count || count === 0) {
        return jsonResponse({ error: "Usuário não encontrado neste tenant" }, 404);
      }

      // Gerar nova senha temporária
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => chars[b % chars.length]).join("");

      // Atualizar senha + desbloquear (ban_duration: "none") + forçar troca
      const { data: updatedUser, error: updateErr } = await crmClient.auth.admin.updateUserById(
        user_id,
        {
          password:     tempPassword,
          ban_duration: "none",
          user_metadata: { force_password_change: true },
        } as any
      );

      if (updateErr || !updatedUser?.user) {
        return jsonResponse({ error: `Erro ao atualizar usuário: ${updateErr?.message ?? "desconhecido"}` }, 500);
      }

      const userEmail = updatedUser.user.email ?? "";

      // Buscar nome do tenant
      const { data: clientRow } = await crmClient
        .from("clients").select("name, company").eq("tenant_id", tenant_id).maybeSingle();
      const tenantName = clientRow?.company || clientRow?.name || "C8 Control";

      // Reenviar e-mail via Resend
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const appUrl    = Deno.env.get("APP_URL") ?? "https://c8control.com.br";
      if (resendKey && userEmail) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type":  "application/json",
            },
            body: JSON.stringify({
              from:    "Suporte Agência C8 <suporte@agenciac8.com.br>",
              to:      userEmail,
              subject: `Novo acesso ao ${tenantName} — C8 Control`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0F172A;color:#e2e8f0;border-radius:12px;">
                  <div style="text-align:center;margin-bottom:24px;">
                    <div style="display:inline-block;background:#7C3AED;border-radius:12px;padding:12px 20px;">
                      <span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:-1px;">C8 CONTROL</span>
                    </div>
                  </div>
                  <h2 style="color:#fff;font-size:20px;font-weight:800;margin:0 0 8px;">Nova senha gerada</h2>
                  <p style="color:#94a3b8;margin:0 0 20px;">
                    Uma nova senha temporária foi gerada para o seu acesso ao dashboard <strong style="color:#e2e8f0;">${tenantName}</strong>.
                  </p>
                  <div style="background:#1E293B;border-radius:8px;padding:16px;margin-bottom:20px;">
                    <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Seus dados de acesso</p>
                    <p style="margin:0 0 4px;color:#e2e8f0;"><strong>E-mail:</strong> ${userEmail}</p>
                    <p style="margin:0;color:#e2e8f0;"><strong>Nova senha temporária:</strong> <span style="font-family:monospace;background:#0F172A;padding:2px 8px;border-radius:4px;color:#a78bfa;">${tempPassword}</span></p>
                  </div>
                  <p style="color:#94a3b8;font-size:13px;margin:0 0 20px;">
                    Você será solicitado a criar uma nova senha permanente no primeiro acesso.
                  </p>
                  <a href="${appUrl}/login" style="display:inline-block;background:#7C3AED;color:#fff;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
                    Acessar o Dashboard
                  </a>
                  <p style="color:#475569;font-size:11px;margin-top:28px;border-top:1px solid #1E293B;padding-top:16px;">
                    Powered by Agência C8 · Este e-mail foi enviado automaticamente, não responda.
                  </p>
                </div>
              `,
            }),
          });
          console.log(`[validate-access] Nova senha enviada para ${userEmail}`);
        } catch (emailErr: any) {
          console.warn("[validate-access] Falha ao reenviar e-mail:", emailErr.message);
        }
      }

      return jsonResponse({ success: true, email: userEmail, message: "Nova senha gerada e e-mail reenviado." });
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

      // Se não está em tenant_users mas pode estar no auth — limpar auth também
      if (!existingCount || existingCount === 0) {
        // Tentar deletar do auth mesmo assim (limpeza de inconsistência)
        await crmClient.auth.admin.deleteUser(user_id).catch(() => {});
        return jsonResponse({ success: true, message: "Usuário não encontrado em tenant_users (já removido ou inconsistência corrigida)." });
      }

      // 1. Deletar de tenant_users PRIMEIRO
      const { error: deleteErr } = await crmClient
        .from("tenant_users")
        .delete()
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id);

      if (deleteErr) {
        console.error("[validate-access] delete tenant_users error:", deleteErr.message);
        return jsonResponse({ error: "Erro ao remover usuário. Tente novamente." }, 500);
      }

      // 2. Deletar do auth
      const { error: revokeErr } = await crmClient.auth.admin.deleteUser(user_id);
      if (revokeErr) {
        console.warn(`[validate-access] tenant_users removido mas falhou ao deletar do auth: ${revokeErr.message}`);
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
  _saasClient: SupabaseClient,
  tenant_id: string
): Promise<LimitResult> {
  // Contar usuários em tenant_users — excluindo owners e agency (suporte da agência)
  const { data: tuData, error: countErr } = await crmClient
    .from("tenant_users")
    .select("user_id, role")
    .eq("tenant_id", tenant_id)
    .not("role", "in", '("owner","agency","support")');

  if (countErr) throw new Error(`Erro ao contar usuários: ${countErr.message}`);

  const current = tuData?.length ?? 0;

  // Ler limite de max_users da tabela clients (fonte de verdade sincronizada do Maestr.ia)
  // Fallback para tenant_config_cache se clients não tiver o campo preenchido
  const { data: clientData } = await crmClient
    .from("clients")
    .select("max_users, plan_name")
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  const { data: cache } = await crmClient
    .from("tenant_config_cache")
    .select("max_users, plan_name")
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  const maxUsers: number = clientData?.max_users ?? cache?.max_users ?? 3;
  const planName: string = clientData?.plan_name ?? cache?.plan_name ?? "Starter";

  return {
    allowed: current < maxUsers,
    current_users: current,
    max_users: maxUsers,
    plan_name: planName,
  };
}

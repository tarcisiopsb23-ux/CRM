/**
 * Edge Function: crm-manage-user
 *
 * Gerencia usuários do dashboard do cliente (Banco B de cada tenant).
 * Autenticação via JWT do usuário da agência (Authorization header).
 *
 * Cada cliente tem seu próprio projeto Supabase isolado (Banco B).
 * Esta função busca as credenciais do Banco B no Banco A e opera
 * diretamente no auth.users do cliente — sem criar nada no Banco A.
 *
 * Suporta actions: invite, remove
 */

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

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const groups = 3; const groupLen = 4;
  let pwd = ""; const bytes = new Uint8Array(groups * groupLen);
  crypto.getRandomValues(bytes);
  for (let g = 0; g < groups; g++) {
    if (g > 0) pwd += "-";
    for (let i = 0; i < groupLen; i++) pwd += chars[bytes[g * groupLen + i] % chars.length];
  }
  return pwd;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── 1. Autenticar chamador ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Cabeçalho de autorização ausente" }, 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return respond({ error: "Corpo da requisição inválido (JSON esperado)" }, 400); }

    const { action } = body;
    if (!action) return respond({ error: "Campo 'action' é obrigatório" }, 400);

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return respond({ error: "Não autorizado" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      return respond({ error: "Organização não encontrada" }, 400);
    }

    const organization_id = profile.organization_id;

    // ─── action: invite ───────────────────────────────────────────────────────
    if (action === "invite") {
      const { client_id, email, name } = body as {
        action: string; client_id: string; email: string; name?: string;
      };

      if (!client_id || !email) return respond({ error: "client_id e email são obrigatórios" }, 400);

      // Verificar limite do plano
      const { data: plan } = await adminClient
        .from("crm_client_plans")
        .select("max_users")
        .eq("client_id", client_id)
        .single();

      if (!plan) return respond({ error: "Plano não encontrado para este cliente" }, 404);

      // ── Buscar credenciais do Banco B deste cliente ───────────────────────────
      // Cada cliente tem seu próprio projeto Supabase isolado (Banco B).
      // A service_key é armazenada criptografada no Banco A e nunca vai ao frontend.
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("name, company, dashboard_slug, client_supabase_url, client_supabase_service_key")
        .eq("id", client_id)
        .single();

      const bankBUrl        = (clientRow as Record<string, unknown> | null)?.client_supabase_url as string | null;
      const bankBServiceKey = (clientRow as Record<string, unknown> | null)?.client_supabase_service_key as string | null;
      const dashboardSlug   = (clientRow as Record<string, unknown> | null)?.dashboard_slug as string | null;
      const clientName      = (clientRow as Record<string, unknown> | null)?.company as string
                           ?? (clientRow as Record<string, unknown> | null)?.name as string
                           ?? client_id;

      if (!bankBUrl || !bankBServiceKey) {
        return respond({
          error: `O cliente "${clientRow?.name ?? client_id}" não tem Banco B configurado. ` +
                 "Preencha URL e Service Key do Supabase nas configurações do cliente no C8 Control.",
        }, 400);
      }

      // ── Criar cliente do Banco B ──────────────────────────────────────────────
      const bankBAdmin = createClient(bankBUrl, bankBServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // ── Contar usuários ativos no Banco B excluindo suporte ──────────────────
      let activeCount = 0;
      const { count: countWithFilter, error: countError } = await bankBAdmin
        .from("crm_users")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .neq("is_support", true);

      if (countError) {
        // Coluna is_support não existe (banco legado) — conta sem o filtro
        const { count: countFallback, error: countFallbackError } = await bankBAdmin
          .from("crm_users")
          .select("id", { count: "exact", head: true })
          .eq("active", true);
        if (countFallbackError) {
          console.error("[crm-manage-user] Erro ao contar usuários no Banco B:", countFallbackError);
          return respond({ error: "Erro ao verificar limite de usuários" }, 500);
        }
        activeCount = countFallback ?? 0;
      } else {
        activeCount = countWithFilter ?? 0;
      }

      if (activeCount >= plan.max_users) {
        return respond({ error: "user_limit_reached", limit: plan.max_users }, 400);
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Verificar duplicata no Banco B (fonte de verdade)
      const { data: existingBankB } = await bankBAdmin
        .from("crm_users")
        .select("id, active, email")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingBankB?.active) {
        return respond({ error: "Usuário já cadastrado para este cliente" }, 400);
      }

      // Verificar duplicata local (Banco A) para reativação
      const { data: existing } = await adminClient
        .from("crm_client_users")
        .select("id, active")
        .eq("client_id", client_id)
        .ilike("email", normalizedEmail)
        .maybeSingle();

      // ── Criar usuário diretamente no Banco B do cliente ───────────────────────
      // O trigger sync_auth_user_to_crm no Banco B popula crm_users automaticamente.

      // Determina o role: primeiro usuário ativo no Banco B é "owner", demais "member"
      const isPrimary = activeCount === 0;
      const userRole  = isPrimary ? "owner" : "member";

      const tempPassword = generateTempPassword();

      const { data: newUser, error: createError } = await bankBAdmin.auth.admin.createUser({
        email:         normalizedEmail,
        password:      tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name ?? normalizedEmail.split("@")[0],
          client_id,
          role: userRole,
          force_password_change:    true,
          temp_password_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      });

      if (createError || !newUser?.user) {
        console.error("[crm-manage-user] Erro ao criar usuário no Banco B:", createError);
        return respond({
          error: createError?.message ?? "Erro ao criar usuário no banco do cliente",
        }, 500);
      }

      // ── Registrar vínculo local em crm_client_users (Banco A) ─────────────────
      if (existing) {
        await adminClient
          .from("crm_client_users")
          .update({ active: true, name: name ?? null, user_id: newUser.user.id, is_primary: isPrimary })
          .eq("id", existing.id);
      } else {
        const { error: insertError } = await adminClient
          .from("crm_client_users")
          .insert({
            organization_id,
            client_id,
            user_id:    newUser.user.id,
            email:      normalizedEmail,
            name:       name ?? null,
            is_primary: isPrimary,
            is_support: false,
          });

        if (insertError) {
          // Não bloqueia — usuário já criado no Banco B. Registro local pode ser recriado.
          console.error("[crm-manage-user] crm_client_users insert:", insertError);
        }
      }

      // ── Enviar e-mail com senha temporária via Resend ─────────────────────────
      const resendKey  = Deno.env.get("RESEND_API_KEY");
      const fromEmail  = Deno.env.get("RESEND_FROM_EMAIL") ?? "suporte@agenciac8.com.br";
      const c8Base     = (Deno.env.get("C8_CONTROL_URL") ?? Deno.env.get("APP_URL") ?? "https://app.c8control.com.br").replace(/\/$/, "");
      const loginUrl   = dashboardSlug ? `${c8Base}/${dashboardSlug}` : c8Base;
      const userName   = name ?? normalizedEmail.split("@")[0];

      let emailSent = false;
      let emailWarning: string | undefined;

      if (resendKey) {
        // Tenta buscar template customizado do banco; fallback para HTML inline
        const { getEmailTemplate } = await import("../_shared/emailTemplate.ts");
        const tpl = await getEmailTemplate(adminClient, organization_id, "user_invite", {
          client_name:   clientName,
          user_name:     userName,
          user_email:    normalizedEmail,
          temp_password: tempPassword,
          dashboard_url: loginUrl,
        });

        const emailHtml = tpl?.html ?? `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
            <h2 style="color:#7c3aed">Seu acesso ao ${clientName} está pronto!</h2>
            <p>Olá, <strong>${userName}</strong>!</p>
            <p>Você foi convidado para acessar o dashboard de <strong>${clientName}</strong>.</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
              <p style="margin:6px 0"><strong>URL:</strong> <a href="${loginUrl}" style="color:#7c3aed">${loginUrl}</a></p>
              <p style="margin:6px 0"><strong>E-mail:</strong> ${normalizedEmail}</p>
              <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
              <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
                <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">${tempPassword}</span>
              </div>
            </div>
            <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Por segurança, altere sua senha no primeiro acesso.</p>
            <div style="margin:24px 0;text-align:center">
              <a href="${loginUrl}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o Dashboard</a>
            </div>
          </div>`;

        const emailSubject = tpl?.subject ?? `Seu acesso ao ${clientName} foi criado`;

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    fromEmail,
            to:      [normalizedEmail],
            subject: emailSubject,
            html:    emailHtml,
          }),
        });

        if (emailRes.ok) {
          emailSent = true;
        } else {
          const errBody = await emailRes.text();
          console.warn("[crm-manage-user] Resend error:", errBody);
          emailWarning = `Usuário criado mas e-mail não enviado (Resend: ${errBody})`;
        }
      } else {
        emailWarning = "RESEND_API_KEY não configurado — e-mail não enviado.";
      }

      return respond({
        success:       true,
        temp_password: tempPassword,
        email_sent:    emailSent,
        ...(emailWarning ? { warning: emailWarning } : {}),
      });
    }

    // ─── action: remove ───────────────────────────────────────────────────────
    if (action === "remove") {
      const { client_id, email, c8_user_id } = body as {
        action: string; client_id: string; email?: string; c8_user_id?: string;
      };

      if (!client_id) return respond({ error: "client_id é obrigatório" }, 400);
      if (!email && !c8_user_id) return respond({ error: "email ou c8_user_id é obrigatório" }, 400);

      // 1. Desativar localmente no Banco A (busca por email ou user_id)
      const { data: userRecord } = await adminClient
        .from("crm_client_users")
        .select("id, user_id")
        .eq("client_id", client_id)
        .ilike("email", email ?? "")
        .maybeSingle();

      // Fallback: busca por user_id se email não retornou
      const { data: userRecordById } = !userRecord && c8_user_id ? await adminClient
        .from("crm_client_users")
        .select("id, user_id")
        .eq("client_id", client_id)
        .eq("user_id", c8_user_id)
        .maybeSingle() : { data: null };

      const record = userRecord ?? userRecordById;

      if (record) {
        await adminClient
          .from("crm_client_users")
          .update({ active: false })
          .eq("id", record.id)
          .eq("client_id", client_id);
      }

      // 2. Desativar no Banco B (bloqueia o login sem deletar dados)
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("client_supabase_url, client_supabase_service_key")
        .eq("id", client_id)
        .maybeSingle();

      const bankBUrl        = (clientRow as Record<string, unknown> | null)?.client_supabase_url as string | null;
      const bankBServiceKey = (clientRow as Record<string, unknown> | null)?.client_supabase_service_key as string | null;

      if (bankBUrl && bankBServiceKey) {
        const bankBAdmin = createClient(bankBUrl, bankBServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Resolve user_id no Banco B: usa c8_user_id passado, depois tenta pelo user_id local, depois busca por email
        let targetUserId = c8_user_id ?? record?.user_id ?? null;
        if (!targetUserId && email) {
          const { data: usersPage } = await bankBAdmin.auth.admin.listUsers({ perPage: 1000 });
          const found = usersPage?.users?.find(
            (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
          );
          targetUserId = found?.id ?? null;
        }

        if (targetUserId) {
          // 1. Deleta de auth.users do Banco B — remove o acesso/login
          const { error: deleteAuthErr } = await bankBAdmin.auth.admin.deleteUser(targetUserId);
          if (deleteAuthErr) {
            console.warn("[crm-manage-user] deleteUser auth.users error:", deleteAuthErr.message);
          }

          // 2. Deleta de crm_users do Banco B — remove o perfil do dashboard
          // (o trigger de delete do auth.users não apaga crm_users automaticamente)
          // Dados das demais tabelas (crm_deals, crm_contacts, ai_reminders, etc.) são preservados.
          const { error: deleteCrmErr } = await bankBAdmin
            .from("crm_users")
            .delete()
            .eq("id", targetUserId);
          if (deleteCrmErr) {
            console.warn("[crm-manage-user] delete crm_users error:", deleteCrmErr.message);
          }
        }
      }

      return respond({ success: true });
    }

    return respond({ error: `Action desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error("[crm-manage-user] Erro interno:", err);
    return respond({ error: `Erro interno: ${String(err)}` }, 500);
  }
});

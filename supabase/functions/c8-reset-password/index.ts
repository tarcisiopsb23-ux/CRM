/**
 * Edge Function: c8-reset-password
 * Projeto: Maestr.ia
 *
 * Reseta ou cria a senha do usuário principal de um cliente
 * diretamente no auth.users do Banco B daquele cliente.
 * Envia e-mail com senha temporária via Resend.
 *
 * Não usa mais CRM_URL, CRM_API_KEY.
 *
 * Secrets necessários:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Banco A (injetados automaticamente)
 *   RESEND_API_KEY, RESEND_FROM_EMAIL       — e-mail
 *   APP_URL                                 — base URL do dashboard
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const groups = 3; const groupLen = 4;
  let pwd = "";
  const bytes = new Uint8Array(groups * groupLen);
  crypto.getRandomValues(bytes);
  for (let g = 0; g < groups; g++) {
    if (g > 0) pwd += "-";
    for (let i = 0; i < groupLen; i++) pwd += chars[bytes[g * groupLen + i] % chars.length];
  }
  return pwd;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const maestriaAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller }, error: jwtErr } = await maestriaAdmin.auth.getUser(jwt);
    if (jwtErr || !caller) return json({ error: "Sessão inválida" }, 401);

    const { data: profile } = await maestriaAdmin
      .from("profiles").select("role, organization_id").eq("id", caller.id).single();
    if (!["owner", "admin"].includes(profile?.role ?? ""))
      return json({ error: "Apenas owner/admin" }, 403);

    const body = await req.json() as {
      client_id: string;
      email: string;
      client_name?: string;
    };

    const { client_id, email } = body;
    if (!client_id) return json({ error: "client_id é obrigatório" }, 400);
    if (!email?.includes("@")) return json({ error: "E-mail inválido" }, 400);

    // ── Busca credenciais do Banco B ──────────────────────────────────────────
    const { data: clientRow, error: clientErr } = await maestriaAdmin
      .from("clients")
      .select("name, company, dashboard_slug, client_supabase_url, client_supabase_service_key")
      .eq("id", client_id)
      .maybeSingle();

    if (clientErr || !clientRow) return json({ error: "Cliente não encontrado" }, 404);

    const bankBUrl = (clientRow as Record<string, unknown>).client_supabase_url as string | null;
    const bankBKey = (clientRow as Record<string, unknown>).client_supabase_service_key as string | null;

    if (!bankBUrl || !bankBKey)
      return json({ error: `Cliente "${clientRow.name}" sem Banco B configurado.` }, 400);

    const bankBAdmin = createClient(bankBUrl, bankBKey, { auth: { persistSession: false } });

    const tempPassword = generateTempPassword();
    const displayName  = body.client_name ?? clientRow.company ?? clientRow.name ?? email.split("@")[0];

    // ── Localiza usuário no Banco B ───────────────────────────────────────────
    const { data: usersPage } = await bankBAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existing = usersPage?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let isNewUser: boolean;

    if (existing) {
      const { error: updateErr } = await bankBAdmin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        ban_duration: "none",
        user_metadata: {
          ...existing.user_metadata,
          force_password_change:    true,
          temp_password_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      });
      if (updateErr) return json({ error: `Erro ao atualizar senha: ${updateErr.message}` }, 500);
      isNewUser = false;
    } else {
      // Usuário não existe — cria novo
      const { error: createErr } = await bankBAdmin.auth.admin.createUser({
        email:         email.toLowerCase(),
        password:      tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name:                displayName,
          client_id,
          role:                     "owner",
          force_password_change:    true,
          temp_password_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      });
      if (createErr) return json({ error: `Erro ao criar usuário: ${createErr.message}` }, 500);
      isNewUser = true;
    }

    // ── Atualiza status no Banco A ────────────────────────────────────────────
    await maestriaAdmin
      .from("crm_client_plans")
      .update({ provisioning_status: isNewUser ? "confirmed" : "sent" })
      .eq("client_id", client_id);

    // ── E-mail via Resend ─────────────────────────────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    // Remetente sempre no domínio c8control.com.br
    const fromEmail = Deno.env.get("C8_FROM_EMAIL") ?? "noreply@c8control.com.br";
    const slug      = (clientRow as Record<string, unknown>).dashboard_slug as string | null;
    const c8Base    = (Deno.env.get("C8_CONTROL_URL") ?? Deno.env.get("APP_URL") ?? "https://app.c8control.com.br").replace(/\/$/, "");
    const loginUrl  = slug ? `${c8Base}/${slug}` : c8Base;

    if (!resendKey) {
      return json({ success: true, is_new_user: isNewUser, temp_password: tempPassword,
        warning: "RESEND_API_KEY não configurado — e-mail não enviado." });
    }

    // Tenta buscar template customizado do banco; fallback para HTML inline
    const { getEmailTemplate } = await import("../_shared/emailTemplate.ts");
    const { data: callerProfile } = await maestriaAdmin
      .from("profiles").select("organization_id").eq("id", caller.id).single();
    const orgId = callerProfile?.organization_id;

    const tplSlug = isNewUser ? "tenant_welcome" : "password_reset";
    const tpl = orgId ? await getEmailTemplate(maestriaAdmin, orgId, tplSlug, {
      client_name:   displayName,
      user_email:    email,
      temp_password: tempPassword,
      dashboard_url: loginUrl,
    }) : null;

    const emailHtml = tpl?.html ?? `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#7c3aed">${isNewUser ? "Bem-vindo ao C8 Control!" : "Nova senha temporária"}</h2>
        <p>Olá, <strong>${displayName}</strong>!</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:6px 0"><strong>URL:</strong> <a href="${loginUrl}" style="color:#7c3aed">${loginUrl}</a></p>
          <p style="margin:6px 0"><strong>E-mail:</strong> ${email}</p>
          <p style="margin:12px 0 6px 0"><strong>Senha temporária:</strong></p>
          <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:6px;padding:12px;text-align:center">
            <span style="font-family:monospace;font-size:22px;font-weight:bold;color:#5b21b6;letter-spacing:2px">${tempPassword}</span>
          </div>
        </div>
        <p style="color:#dc2626;font-size:13px;font-weight:500">⚠️ Ao fazer login, você será solicitado a criar uma senha permanente.</p>
        <div style="margin:24px 0;text-align:center">
          <a href="${loginUrl}" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Acessar o Dashboard</a>
        </div>
      </div>`;

    const emailSubject = tpl?.subject ?? (isNewUser ? "Seu acesso ao C8 Control está pronto!" : "Nova senha temporária — C8 Control");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [email], subject: emailSubject, html: emailHtml }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      return json({ success: true, is_new_user: isNewUser, temp_password: tempPassword,
        warning: `Senha ${isNewUser ? "criada" : "atualizada"} mas e-mail não enviado (Resend: ${errBody}).` });
    }

    return json({
      success: true, is_new_user: isNewUser,
      message: isNewUser ? `Usuário criado e e-mail enviado para ${email}` : `Nova senha enviada para ${email}`,
    });

  } catch (err) {
    console.error("[c8-reset-password]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});

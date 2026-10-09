/**
 * Edge Function: c8-support-user
 * Projeto: Maestr.ia
 *
 * Gerencia o usuário de suporte da agência no Banco B de cada cliente.
 * Cada cliente tem seu próprio auth.users isolado — o suporte é criado
 * diretamente lá usando as credenciais individuais da tabela `clients`.
 *
 * Email do suporte: {10 primeiros chars do client_id sem hífens}@agenciac8.com.br
 * Ex: bac833f455@agenciac8.com.br
 *
 * Não usa mais CRM_URL, CRM_API_KEY, C8_SUPABASE_URL, C8_SUPABASE_SERVICE_KEY.
 *
 * Actions:
 *   provision  — cria/atualiza usuário de suporte no Banco B de um cliente
 *   reset_all  — provisiona suporte em todos os tenants ativos da organização
 *   remove     — remove o usuário de suporte do Banco B do cliente
 *   check      — verifica se o usuário de suporte existe no Banco B do cliente
 *
 * Secrets necessários:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Banco A (injetados automaticamente)
 *   C8_SUPPORT_EMAIL_DOMAIN                 — domínio do email (default: agenciac8.com.br)
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

function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

/** Gera o email de suporte deterministicamente a partir do client_id */
function supportEmailFor(clientId: string): string {
  const domain = Deno.env.get("C8_SUPPORT_EMAIL_DOMAIN") ?? "agenciac8.com.br";
  const prefix = clientId.replace(/-/g, "").substring(0, 10);
  return `${prefix}@${domain}`;
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

    const orgId = profile.organization_id as string;

    const body = await req.json() as {
      action: "provision" | "reset_all" | "remove" | "check";
      client_id?: string;
      client_name?: string;
      // Se true: remove apenas o registro no Maestr.ia sem tentar acessar o Banco B.
      // Usar ao limpar registros do modelo antigo (C8 Control centralizado).
      local_only?: boolean;
    };
    const { action, client_id, client_name } = body;

    // ── Helper: busca credenciais do Banco B ──────────────────────────────────
    async function getBankB(tenantId: string) {
      const { data, error } = await maestriaAdmin
        .from("clients")
        .select("name, company, client_supabase_url, client_supabase_service_key")
        .eq("id", tenantId)
        .maybeSingle();
      if (error || !data) return null;
      const url = (data as Record<string, unknown>).client_supabase_url as string | null;
      const key = (data as Record<string, unknown>).client_supabase_service_key as string | null;
      if (!url || !key) return null;
      return {
        admin: createClient(url, key, { auth: { persistSession: false } }),
        name: (data as Record<string, unknown>).company as string ?? data.name as string,
      };
    }

    // ── Helper: provisiona suporte em um tenant ───────────────────────────────
    async function provisionSupport(tenantId: string, tenantName: string) {
      const password = generatePassword();

      // Verifica email existente no registro (pode ter formato antigo)
      const { data: existing } = await maestriaAdmin
        .from("c8_support_passwords")
        .select("support_email, c8_user_id")
        .eq("organization_id", orgId)
        .eq("client_id", tenantId)
        .maybeSingle();

      // Email: reutiliza se já tem 10+ chars, senão gera no formato correto
      const correctEmail = supportEmailFor(tenantId);
      let emailForTenant: string;
      if (existing?.support_email) {
        const prefix = existing.support_email.split("@")[0];
        emailForTenant = prefix.length >= 10 ? existing.support_email : correctEmail;
      } else {
        emailForTenant = correctEmail;
      }

      const bankB = await getBankB(tenantId);
      if (!bankB) {
        throw new Error(`Banco B não configurado para o cliente ${tenantId}`);
      }

      // Localiza ou cria o usuário de suporte no Banco B
      const { data: usersPage } = await bankB.admin.auth.admin.listUsers({ perPage: 1000 });
      const supportUser = usersPage?.users?.find(
        (u: { email?: string }) => u.email?.toLowerCase() === emailForTenant.toLowerCase()
      );

      let c8UserId: string;

      if (supportUser) {
        // Atualiza senha
        await bankB.admin.auth.admin.updateUserById(supportUser.id, {
          password,
          ban_duration: "none",
          user_metadata: {
            ...supportUser.user_metadata,
            full_name: `Suporte — ${tenantName}`,
            is_support: true,
            role: "owner",
          },
        });
        c8UserId = supportUser.id;
      } else {
        // Cria novo usuário de suporte
        const { data: newUser, error: createErr } = await bankB.admin.auth.admin.createUser({
          email:         emailForTenant,
          password,
          email_confirm: true,
          user_metadata: {
            full_name:  `Suporte — ${tenantName}`,
            client_id:  tenantId,
            role:       "owner",
            is_support: true,
          },
        });
        if (createErr || !newUser?.user)
          throw new Error(`Erro ao criar suporte: ${createErr?.message}`);
        c8UserId = newUser.user.id;
      }

      // Salva/atualiza registro no Maestr.ia
      const { error: saveErr } = await maestriaAdmin
        .from("c8_support_passwords")
        .upsert({
          organization_id: orgId,
          client_id:       tenantId,
          support_email:   emailForTenant,
          password,
          c8_user_id:      c8UserId,
        }, { onConflict: "organization_id,client_id" });
      if (saveErr) throw new Error(`Erro ao salvar senha: ${saveErr.message}`);

      return { client_id: tenantId, support_email: emailForTenant, password, c8_user_id: c8UserId };
    }

    // ── action: provision ─────────────────────────────────────────────────────
    if (action === "provision") {
      if (!client_id) return json({ error: "client_id obrigatório" }, 400);
      const name = client_name ?? client_id;
      const result = await provisionSupport(client_id, name);
      return json({ success: true, ...result });
    }

    // ── action: reset_all ─────────────────────────────────────────────────────
    if (action === "reset_all") {
      const { data: plans } = await maestriaAdmin
        .from("crm_client_plans")
        .select("client_id, clients(name, company)")
        .eq("organization_id", orgId)
        .neq("subscription_status", "cancelado");

      const results = [];
      for (const p of plans ?? []) {
        const cd = p.clients as unknown as { name: string; company: string | null } | null;
        const name = cd?.company || cd?.name || p.client_id;
        try {
          const r = await provisionSupport(p.client_id, name);
          results.push({ ...r, client_name: name, success: true });
        } catch (e) {
          results.push({ client_id: p.client_id, client_name: name, success: false, error: String(e) });
        }
      }
      return json({ success: true, results });
    }

    // ── action: remove ────────────────────────────────────────────────────────
    if (action === "remove") {
      if (!client_id) return json({ error: "client_id obrigatório" }, 400);

      const { data: supportRecord, error: fetchErr } = await maestriaAdmin
        .from("c8_support_passwords")
        .select("support_email, c8_user_id")
        .eq("organization_id", orgId)
        .eq("client_id", client_id)
        .maybeSingle();

      if (fetchErr) return json({ error: fetchErr.message }, 500);
      if (!supportRecord)
        return json({ success: true, message: "Nenhum usuário de suporte cadastrado para este cliente." });

      const { support_email, c8_user_id } = supportRecord;
      let deletedFromBankB = false;

      // Se local_only, pula a busca no Banco B (registros do modelo antigo)
      if (!body.local_only) {
        const bankB = await getBankB(client_id);
        if (bankB) {
          // Tenta deletar por ID salvo primeiro
          if (c8_user_id) {
            const { error: delErr } = await bankB.admin.auth.admin.deleteUser(c8_user_id);
            if (!delErr) deletedFromBankB = true;
          }
          // Fallback: busca por email
          if (!deletedFromBankB) {
            const { data: usersPage } = await bankB.admin.auth.admin.listUsers({ perPage: 1000 });
            const target = usersPage?.users?.find(
              (u: { email?: string }) => u.email?.toLowerCase() === support_email.toLowerCase()
            );
            if (target) {
              const { error: delErr } = await bankB.admin.auth.admin.deleteUser(target.id);
              if (!delErr) deletedFromBankB = true;
            }
          }
        }
      }

      // Remove registro do Maestr.ia independente do resultado no Banco B
      const { error: removeErr } = await maestriaAdmin
        .from("c8_support_passwords")
        .delete()
        .eq("organization_id", orgId)
        .eq("client_id", client_id);

      if (removeErr) return json({ error: `Erro ao remover registro: ${removeErr.message}` }, 500);

      return json({
        success: true,
        bank_b_deleted: deletedFromBankB,
        local_only: body.local_only ?? false,
        message: body.local_only
          ? `Registro de suporte de ${support_email} removido do Maestr.ia (model antigo).`
          : deletedFromBankB
            ? `Usuário de suporte ${support_email} removido com sucesso.`
            : `Registro removido do Maestr.ia. Usuário ${support_email} pode não ter sido encontrado no Banco B.`,
      });
    }

    // ── action: check ─────────────────────────────────────────────────────────
    if (action === "check") {
      if (!client_id) return json({ error: "client_id obrigatório" }, 400);

      const { data: supportRecord } = await maestriaAdmin
        .from("c8_support_passwords")
        .select("support_email, c8_user_id, updated_at")
        .eq("organization_id", orgId)
        .eq("client_id", client_id)
        .maybeSingle();

      if (!supportRecord)
        return json({ success: true, exists: false, reason: "Nenhum registro em c8_support_passwords" });

      const { support_email, c8_user_id } = supportRecord;

      const bankB = await getBankB(client_id);
      if (!bankB) {
        return json({
          success: true, exists: null,
          support_email,
          reason: "Banco B não configurado — não é possível verificar",
        });
      }

      // Tenta por ID salvo primeiro
      if (c8_user_id) {
        const { data: userById, error: byIdErr } = await bankB.admin.auth.admin.getUserById(c8_user_id);
        if (!byIdErr && userById?.user) {
          return json({
            success: true, exists: true, support_email, c8_user_id,
            last_sign_in:  userById.user.last_sign_in_at ?? null,
            confirmed:     !!userById.user.email_confirmed_at,
            updated_at:    supportRecord.updated_at,
          });
        }
      }

      // Fallback: busca por email
      const { data: usersPage } = await bankB.admin.auth.admin.listUsers({ perPage: 1000 });
      const found = usersPage?.users?.find(
        (u: { email?: string }) => u.email?.toLowerCase() === support_email.toLowerCase()
      );

      if (!found) {
        return json({
          success: true, exists: false, support_email,
          reason: "Usuário não encontrado no Banco B",
        });
      }

      // Corrige c8_user_id desatualizado
      if (c8_user_id !== found.id) {
        await maestriaAdmin
          .from("c8_support_passwords")
          .update({ c8_user_id: found.id })
          .eq("organization_id", orgId)
          .eq("client_id", client_id);
      }

      return json({
        success: true, exists: true, support_email, c8_user_id: found.id,
        last_sign_in: found.last_sign_in_at ?? null,
        confirmed:    !!found.email_confirmed_at,
        updated_at:   supportRecord.updated_at,
      });
    }

    return json({ error: "action inválida" }, 400);

  } catch (err) {
    console.error("[c8-support-user]", err);
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});

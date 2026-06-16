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

      const { count } = await adminClient
        .from("crm_client_users")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client_id)
        .eq("is_support", false);

      if ((count ?? 0) >= plan.max_users) {
        return respond({ error: "user_limit_reached", limit: plan.max_users }, 400);
      }

      // Verificar duplicata local
      const { data: existing } = await adminClient
        .from("crm_client_users")
        .select("id, active")
        .eq("client_id", client_id)
        .ilike("email", email)
        .maybeSingle();

      if (existing?.active) {
        return respond({ error: "Usuário já cadastrado para este cliente" }, 400);
      }

      // ── Buscar credenciais do Banco B deste cliente ───────────────────────────
      // Cada cliente tem seu próprio projeto Supabase isolado (Banco B).
      // A service_key é armazenada criptografada no Banco A e nunca vai ao frontend.
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("name, client_supabase_url, client_supabase_service_key")
        .eq("id", client_id)
        .single();

      const bankBUrl        = (clientRow as Record<string, unknown> | null)?.client_supabase_url as string | null;
      const bankBServiceKey = (clientRow as Record<string, unknown> | null)?.client_supabase_service_key as string | null;

      if (!bankBUrl || !bankBServiceKey) {
        return respond({
          error: `O cliente "${clientRow?.name ?? client_id}" não tem Banco B configurado. ` +
                 "Preencha URL e Service Key do Supabase nas configurações do cliente no C8 Control.",
        }, 400);
      }

      // ── Criar usuário diretamente no Banco B do cliente ───────────────────────
      // O trigger sync_auth_user_to_crm no Banco B popula crm_users automaticamente.
      const bankBAdmin = createClient(bankBUrl, bankBServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Determina o role: primeiro usuário não-suporte do cliente é "owner",
      // demais são "member"
      const isPrimary = (count ?? 0) === 0;
      const userRole  = isPrimary ? "owner" : "member";

      const tempPassword    = generateTempPassword();
      const normalizedEmail = email.trim().toLowerCase();

      const { data: newUser, error: createError } = await bankBAdmin.auth.admin.createUser({
        email:         normalizedEmail,
        password:      tempPassword,
        email_confirm: true, // acesso imediato — sem aguardar confirmação de e-mail
        user_metadata: {
          full_name: name ?? normalizedEmail.split("@")[0],
          client_id,
          role: userRole,
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

      return respond({ success: true, temp_password: tempPassword });
    }

    // ─── action: remove ───────────────────────────────────────────────────────
    if (action === "remove") {
      const { client_id, email, c8_user_id } = body as {
        action: string; client_id: string; email: string; c8_user_id?: string;
      };

      if (!client_id || !email) return respond({ error: "client_id e email são obrigatórios" }, 400);

      // 1. Desativar localmente no Banco A
      const { data: userRecord } = await adminClient
        .from("crm_client_users")
        .select("id, user_id")
        .eq("client_id", client_id)
        .ilike("email", email)
        .maybeSingle();

      if (userRecord) {
        await adminClient
          .from("crm_client_users")
          .update({ active: false })
          .eq("id", userRecord.id)
          .eq("client_id", client_id);

        if (userRecord.user_id) {
          await adminClient
            .from("crm_sessions")
            .update({ revoked: true })
            .eq("user_id", userRecord.user_id)
            .eq("client_id", client_id);
        }
      }

      // 2. Desativar no Banco B (bloqueia o login sem deletar dados)
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("client_supabase_url, client_supabase_service_key")
        .eq("id", client_id)
        .single();

      const bankBUrl        = (clientRow as Record<string, unknown> | null)?.client_supabase_url as string | null;
      const bankBServiceKey = (clientRow as Record<string, unknown> | null)?.client_supabase_service_key as string | null;

      if (bankBUrl && bankBServiceKey) {
        const bankBAdmin = createClient(bankBUrl, bankBServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Resolve user_id no Banco B se não foi passado
        let targetUserId = c8_user_id ?? userRecord?.user_id ?? null;
        if (!targetUserId) {
          const { data: usersPage } = await bankBAdmin.auth.admin.listUsers({ perPage: 1000 });
          const found = usersPage?.users?.find(
            (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
          );
          targetUserId = found?.id ?? null;
        }

        if (targetUserId) {
          // Bane o usuário — impede novos logins sem deletar dados do CRM
          await bankBAdmin.auth.admin.updateUser(targetUserId, { ban_duration: "876600h" }); // ~100 anos
          // Também desativa em crm_users do Banco B
          await bankBAdmin.from("crm_users").update({ active: false }).eq("id", targetUserId);
        }
      }

      return respond({ success: true });
    }

    return respond({ error: `Action desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error("[crm-manage-user] Erro interno:", err);
    return respond({ error: "Erro interno" }, 500);
  }
});

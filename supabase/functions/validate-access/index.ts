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
 * IMPORTANTE: Usuários de suporte (role='support') NUNCA são registrados em tenant_users
 * e NUNCA são contabilizados no limite de usuários de nenhum plano.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL              — CRM_DB URL
 *   SUPABASE_SERVICE_ROLE_KEY — CRM_DB service role key
 *   SAAS_URL                  — SaaS Supabase URL
 *   SAAS_SERVICE_ROLE_KEY     — SaaS service role key
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidateAccessRequest {
  action: "check-limit" | "invite" | "remove";
  tenant_id: string;
  email?: string;   // para invite
  user_id?: string; // para remove
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: ValidateAccessRequest = await req.json();
    const { action, tenant_id } = body;

    if (!action || !tenant_id) {
      return new Response(JSON.stringify({ error: "action e tenant_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente CRM_DB (service role — bypassa RLS para operações internas)
    const crmClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Cliente SaaS_DB (service role — para consultar planos e Admin API)
    const saasClient = createClient(
      Deno.env.get("SAAS_URL") ?? "",
      Deno.env.get("SAAS_SERVICE_ROLE_KEY") ?? ""
    );

    // ── check-limit ──────────────────────────────────────────────────────────
    if (action === "check-limit") {
      const result = await checkLimit(crmClient, saasClient, tenant_id);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── invite ───────────────────────────────────────────────────────────────
    if (action === "invite") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "email é obrigatório para invite" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verificar limite antes de convidar
      const limit = await checkLimit(crmClient, saasClient, tenant_id);
      if (!limit.allowed) {
        return new Response(JSON.stringify({
          allowed: false,
          error: `Limite de usuários atingido. Plano ${limit.plan_name}: máximo ${limit.max_users} usuário(s).`,
          current_users: limit.current_users,
          max_users: limit.max_users,
          plan_name: limit.plan_name,
        }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar usuário no SaaS Auth via Admin API
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
          user_metadata: {
            tenant_id,
            role: "member",
          },
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok || createData.error) {
        const errMsg = createData.error?.message ?? createData.msg ?? "Erro ao criar usuário no SaaS";
        return new Response(JSON.stringify({ allowed: false, error: errMsg }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUserId = createData.id ?? createData.user?.id;
      if (!newUserId) {
        return new Response(JSON.stringify({ allowed: false, error: "Usuário criado mas ID não retornado" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Registrar em tenant_users no CRM_DB
      const { error: insertErr } = await crmClient
        .from("tenant_users")
        .insert({ user_id: newUserId, tenant_id, role: "member" });

      if (insertErr) {
        // Rollback: remover usuário do SaaS se o insert falhou
        await fetch(`${saasUrl}/auth/v1/admin/users/${newUserId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${saasServiceKey}`,
            "apikey": saasServiceKey,
          },
        });
        return new Response(JSON.stringify({ allowed: false, error: `Erro ao registrar usuário: ${insertErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── remove ───────────────────────────────────────────────────────────────
    if (action === "remove") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório para remove" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deletar de tenant_users no CRM_DB
      const { error: deleteErr } = await crmClient
        .from("tenant_users")
        .delete()
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id);

      if (deleteErr) {
        return new Response(JSON.stringify({ error: `Erro ao remover usuário: ${deleteErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Revogar acesso no SaaS Auth
      const saasUrl = Deno.env.get("SAAS_URL") ?? "";
      const saasServiceKey = Deno.env.get("SAAS_SERVICE_ROLE_KEY") ?? "";

      const revokeRes = await fetch(`${saasUrl}/auth/v1/admin/users/${user_id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${saasServiceKey}`,
          "apikey": saasServiceKey,
        },
      });

      if (!revokeRes.ok) {
        // Usuário removido do CRM mas falhou no SaaS — logar mas não reverter
        console.warn(`Usuário ${user_id} removido do CRM mas falhou ao revogar no SaaS: ${revokeRes.status}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function checkLimit(crmClient: any, saasClient: any, tenant_id: string) {
  // Contar usuários ativos do tenant no CRM_DB
  // NOTA: suporte nunca está em tenant_users, então COUNT(*) é sempre correto
  const { count: currentUsers, error: countErr } = await crmClient
    .from("tenant_users")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant_id);

  if (countErr) throw new Error(`Erro ao contar usuários: ${countErr.message}`);

  // Buscar limite do plano no SaaS_DB
  const { data: sub, error: subErr } = await saasClient
    .from("tenant_subscriptions")
    .select("status, plans(name, max_users)")
    .eq("tenant_id", tenant_id)
    .eq("status", "active")
    .single();

  // Se não há assinatura ativa, usar plano Starter como fallback (max_users=3)
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

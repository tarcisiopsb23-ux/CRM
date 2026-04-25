// Edge Function: gerencia usuários do C8 Control
// Autenticação via JWT do usuário da agência (Authorization header)
// Suporta actions: invite, remove

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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Cabeçalho de autorização ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido (JSON esperado)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action } = body;
    if (!action) {
      return new Response(
        JSON.stringify({ error: "Campo 'action' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente autenticado com o JWT da agência
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verificar JWT do usuário da agência
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente administrativo para operações privilegiadas
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Buscar organization_id do usuário da agência
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "Organização não encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const organization_id = profile.organization_id;

    // ─── action: invite ───────────────────────────────────────────────────────
    if (action === "invite") {
      const { client_id, email, name } = body as {
        action: string;
        client_id: string;
        email: string;
        name?: string;
      };

      if (!client_id || !email) {
        return new Response(
          JSON.stringify({ error: "client_id e email são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar limite de usuários do plano
      const { data: plan, error: planError } = await adminClient
        .from("crm_client_plans")
        .select("max_users")
        .eq("client_id", client_id)
        .single();

      if (planError || !plan) {
        return new Response(
          JSON.stringify({ error: "Plano não encontrado para este cliente" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Contar usuários cadastrados (excluindo suporte)
      const { count, error: countError } = await adminClient
        .from("crm_client_users")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client_id)
        .eq("is_support", false);

      if (countError) {
        return new Response(
          JSON.stringify({ error: "Erro ao verificar limite de usuários" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if ((count ?? 0) >= plan.max_users) {
        return new Response(
          JSON.stringify({ error: "user_limit_reached", limit: plan.max_users }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Convidar usuário via Admin API
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        { data: { role: "crm_user", client_id } }
      );

      if (inviteError || !inviteData?.user) {
        console.error("[crm-manage-user] Erro ao convidar usuário:", inviteError);
        return new Response(
          JSON.stringify({ error: inviteError?.message ?? "Erro ao convidar usuário" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registrar vínculo em crm_client_users
      const { error: insertError } = await adminClient
        .from("crm_client_users")
        .insert({
          organization_id,
          client_id,
          user_id: inviteData.user.id,
          email,
          name: name ?? null,
          is_primary: false,
          is_support: false,
        });

      if (insertError) {
        console.error("[crm-manage-user] Erro ao inserir crm_client_users:", insertError);
        return new Response(
          JSON.stringify({ error: "Erro ao registrar usuário no cliente" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── action: remove ───────────────────────────────────────────────────────
    if (action === "remove") {
      const { client_id, email, c8_user_id } = body as {
        action: string;
        client_id: string;
        email: string;
        c8_user_id?: string;
      };

      if (!client_id || !email) {
        return new Response(
          JSON.stringify({ error: "client_id e email são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Desativar localmente na crm_client_users do Maestr.ia
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

      // 2. Remover do C8 Control
      const crmUrl = Deno.env.get("CRM_URL");
      const crmApiKey = Deno.env.get("CRM_API_KEY");
      const c8AnonKey = Deno.env.get("C8_ANON_KEY") ?? "";

      if (crmUrl && crmApiKey && c8_user_id) {
        // Usa validate-access action remove com tenant_id + user_id
        const validateUrl = crmUrl.replace(/\/$/, "") + "/functions/v1/validate-access";
        fetch(validateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-crm-api-key": crmApiKey,
            "apikey": c8AnonKey,
            "Authorization": `Bearer ${c8AnonKey}`,
          },
          body: JSON.stringify({ action: "remove", tenant_id: client_id, user_id: c8_user_id }),
        }).catch(e => console.warn("[crm-manage-user] validate-access remove failed:", e));
      } else if (crmUrl && crmApiKey) {
        // Fallback: deleta pelo email via c8-delete-user
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        fetch(`${supabaseUrl}/functions/v1/c8-delete-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": req.headers.get("Authorization") ?? "",
            "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify({ email }),
        }).catch(e => console.warn("[crm-manage-user] c8-delete-user failed:", e));
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── action desconhecida ──────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ error: `Action desconhecida: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[crm-manage-user] Erro interno:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

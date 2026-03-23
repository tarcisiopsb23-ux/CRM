// Edge Function: cria usuário diretamente (sem token/convite)
// Admin preenche email, nome e opcionalmente senha na aba Colaboradores.
// Sem senha: gera token de set-password e retorna link para o admin enviar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://ia-maestr-ia.whlwlh.easypanel.host").replace(/\/$/, "");

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
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: {
      email?: string;
      password?: string;
      full_name?: string;
      phone?: string;
      display_name?: string;
      cpf?: string;
      rg?: string;
      pix_key?: string;
      address_street?: string;
      address_city?: string;
      address_state?: string;
      address_zip?: string;
      education_level?: string;
      graduation?: string;
      job_title?: string;
      role?: string;
      base_salary?: number;
      commission_percent?: number;
      overtime_factor?: number;
      notes?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      email,
      password,
      full_name,
      phone,
      display_name,
      cpf,
      rg,
      pix_key,
      address_street,
      address_city,
      address_state,
      address_zip,
      education_level,
      graduation,
      job_title,
      role: bodyRole,
      base_salary,
      commission_percent,
      overtime_factor,
      notes,
    } = body;

    const emailTrim = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!emailTrim || !emailTrim.includes("@")) {
      return new Response(
        JSON.stringify({ error: "E-mail válido é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasPassword = typeof password === "string" && password.trim().length >= 6;
    const noPassword = !password || (typeof password === "string" && password.trim().length === 0);

    if (!noPassword && !hasPassword) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: adminUser } } = await authClient.auth.getUser();
    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: "Sessão expirada. Faça login novamente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminProfile } = await adminClient
      .from("profiles")
      .select("organization_id, role")
      .eq("id", adminUser.id)
      .single();

    const orgId = adminProfile?.organization_id;
    const role = adminProfile?.role ?? "";

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Organização não encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (role !== "admin" && role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Apenas admin ou owner podem cadastrar colaboradores diretamente" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar permissão vinculada ao cargo no catálogo
    let finalRole = (bodyRole as string) || "member";
    if (job_title) {
      const { data: catalogItem } = await adminClient
        .from("job_title_catalog")
        .select("role")
        .eq("organization_id", orgId)
        .eq("job_title", job_title.trim())
        .single();
      if (catalogItem?.role) {
        finalRole = catalogItem.role as string;
      }
    }

    const baseFullName =
      typeof full_name === "string" ? full_name.trim() || emailTrim.split("@")[0] : emailTrim.split("@")[0];

    const userMeta = {
      full_name: baseFullName,
      phone: typeof phone === "string" ? phone.trim() : "",
      display_name: typeof display_name === "string" ? display_name.trim() : "",
      cpf: typeof cpf === "string" ? cpf.trim() : "",
      rg: typeof rg === "string" ? rg.trim() : "",
      pix_key: typeof pix_key === "string" ? pix_key.trim() : "",
      address_street: typeof address_street === "string" ? address_street.trim() : "",
      address_city: typeof address_city === "string" ? address_city.trim() : "",
      address_state: typeof address_state === "string" ? address_state.trim() : "",
      address_zip: typeof address_zip === "string" ? address_zip.trim() : "",
      education_level: typeof education_level === "string" ? education_level : "fundamental",
      graduation: typeof graduation === "string" ? graduation.trim() : "",
      job_title: typeof job_title === "string" ? job_title.trim() : "",
      base_salary: typeof base_salary === "number" ? base_salary : 0,
      commission_percent: typeof commission_percent === "number" ? commission_percent : 0,
      overtime_factor: typeof overtime_factor === "number" ? overtime_factor : 1,
      notes: typeof notes === "string" ? notes.trim() : "",
      profile_completed: true,
      direct_organization_id: orgId,
    };

    // Verifica se já existe auth.users com esse e-mail
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === emailTrim
    );

    let newUserId: string | undefined;

    if (existingAuthUser) {
      const { data: activeProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", existingAuthUser.id)
        .eq("organization_id", orgId)
        .single();

      if (activeProfile) {
        return new Response(
          JSON.stringify({ error: "Este e-mail já está cadastrado como colaborador ativo" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updatePayload: Record<string, unknown> = {
        email_confirm: true,
        user_metadata: userMeta,
      };
      if (hasPassword) updatePayload.password = password;

      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        existingAuthUser.id,
        updatePayload
      );
      if (updateError) {
        return new Response(
          JSON.stringify({ error: `Falha ao reativar colaborador: ${updateError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      newUserId = existingAuthUser.id;
    } else {
      const createPayload: Record<string, unknown> = {
        email: emailTrim,
        email_confirm: true,
        user_metadata: userMeta,
      };
      if (hasPassword) createPayload.password = password;

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser(
        createPayload as Parameters<typeof adminClient.auth.admin.createUser>[0]
      );

      if (createError) {
        return new Response(
          JSON.stringify({ error: `Falha ao cadastrar colaborador: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      newUserId = newUser?.user?.id;
    }

    if (newUserId) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .upsert(
          {
            id: newUserId,
            organization_id: orgId,
            full_name: baseFullName,
            email: emailTrim,
            phone: typeof phone === "string" ? phone.trim() : null,
            role: finalRole,
            metadata: {
              display_name: typeof display_name === "string" ? display_name.trim() : "",
              cpf: typeof cpf === "string" ? cpf.trim() : "",
              rg: typeof rg === "string" ? rg.trim() : "",
              pix_key: typeof pix_key === "string" ? pix_key.trim() : "",
              address_street: typeof address_street === "string" ? address_street.trim() : "",
              address_city: typeof address_city === "string" ? address_city.trim() : "",
              address_state: typeof address_state === "string" ? address_state.trim() : "",
              address_zip: typeof address_zip === "string" ? address_zip.trim() : "",
              education_level: typeof education_level === "string" ? education_level : "fundamental",
              graduation: typeof graduation === "string" ? graduation.trim() : "",
              job_title: typeof job_title === "string" ? job_title.trim() : "",
              base_salary: typeof base_salary === "number" ? base_salary : 0,
              commission_percent: typeof commission_percent === "number" ? commission_percent : 0,
              overtime_factor: typeof overtime_factor === "number" ? overtime_factor : 1,
              notes: typeof notes === "string" ? notes.trim() : "",
              profile_completed: true,
            },
          },
          { onConflict: "id" }
        );

      if (profileError) {
        console.error("[CreateUserDirect] Profile Upsert Error:", profileError);
      }
    }

    // Se não tem senha, gera token de set-password e retorna link
    if (noPassword && newUserId) {
      const { data: token, error: tokenErr } = await adminClient.rpc(
        "create_set_password_token",
        { p_user_id: newUserId, p_org_id: orgId }
      );

      if (tokenErr || !token) {
        console.error("[CreateUserDirect] Token Error:", tokenErr);
        return new Response(
          JSON.stringify({
            success: true,
            no_password: true,
            invite_link: null,
            message: "Colaborador cadastrado, mas falha ao gerar link de senha. Aplique a migration 00111.",
            user_id: newUserId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const inviteLink = `${APP_URL}/set-password?token=${token}`;

      return new Response(
        JSON.stringify({
          success: true,
          no_password: true,
          invite_link: inviteLink,
          message: "Colaborador cadastrado sem senha. Envie o link para ele definir o acesso.",
          user_id: newUserId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Colaborador cadastrado com sucesso. Ele já pode fazer login.",
        user_id: newUserId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

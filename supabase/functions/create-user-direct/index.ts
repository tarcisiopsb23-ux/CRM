// Edge Function: cria usuário diretamente (sem token/convite)
// Admin preenche email, nome e senha na aba Colaboradores.
// Usa service role para auth.admin.createUser com email_confirm: true.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS: restringe origem quando APP_URL configurado (produção); "*" em dev
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
    if (typeof password !== "string" || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Cliente com token do admin para validar sessão
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

    // Cliente administrativo para realizar as operações no banco e auth
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id, role")
      .eq("id", adminUser.id)
      .single();

    const orgId = profile?.organization_id;
    const role = profile?.role ?? "";
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

    // Criar usuário diretamente via admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: emailTrim,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: typeof full_name === "string" ? full_name.trim() || emailTrim.split("@")[0] : emailTrim.split("@")[0],
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
      },
    });

    if (createError) {
      const msg = createError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        return new Response(
          JSON.stringify({ error: "Este e-mail já está cadastrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Falha ao cadastrar colaborador: ${createError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = newUser?.user?.id;
    if (newUserId) {
      const baseFullName =
        typeof full_name === "string" ? full_name.trim() || emailTrim.split("@")[0] : emailTrim.split("@")[0];
      
      const { error: profileError } = await adminClient
        .from("profiles")
        .upsert(
          {
            id: newUserId,
            organization_id: orgId,
            full_name: baseFullName,
            email: emailTrim,
            phone: typeof phone === "string" ? phone.trim() : null,
            role: "member",
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Colaborador cadastrado com sucesso. Ele já pode fazer login.",
        user_id: newUser?.user?.id,
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

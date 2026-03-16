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

    let body: { email?: string; password?: string; full_name?: string; job_title?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { email, password, full_name, job_title } = body;
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
    const safeJobTitle = typeof job_title === "string" ? job_title.trim() : "";
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
            role: "member",
            metadata: safeJobTitle ? { job_title: safeJobTitle } : {},
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

// Edge Function: convida usuário por e-mail
// Gera token, envia link por e-mail (Resend). Token válido por 24h.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";

// CORS: restringe origem quando APP_URL configurado (produção); "*" em dev
function getCorsHeaders() {
  const appUrl = Deno.env.get("APP_URL");
  let origin = "*";
  if (appUrl) {
    try {
      origin = new URL(appUrl).origin;
    } catch {
      origin = "*";
    }
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

const corsHeaders = getCorsHeaders();

serve(async (req) => {
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

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "E-mail é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Organização não encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: invite, error: rpcError } = await supabase.rpc(
      "create_invitation_token",
      { org_id: orgId, email_input: email.trim().toLowerCase() }
    );

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: "Falha ao criar convite" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const link = invite?.link ?? `${APP_URL}/complete-registration?token=${invite?.token}`;
    const orgName = invite?.organization_name ?? "Maestr.IA";

    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Maestr.IA <onboarding@resend.dev>",
          to: [email],
          subject: `Convite para ${orgName}`,
          html: `
            <p>Você foi convidado para entrar em <strong>${orgName}</strong> no Maestr.IA.</p>
            <p>Clique no link abaixo para criar sua conta (válido por 24 horas):</p>
            <p><a href="${link}">${link}</a></p>
            <p>Se não solicitou este convite, ignore este e-mail.</p>
          `,
        }),
      });

      if (!res.ok) {
        await res.json().catch(() => null);
        return new Response(
          JSON.stringify({ error: "Falha ao enviar e-mail. Verifique RESEND_API_KEY." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: RESEND_API_KEY
          ? "Convite enviado por e-mail."
          : "Token criado. Configure RESEND_API_KEY para envio automático.",
        link: !RESEND_API_KEY ? link : undefined,
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

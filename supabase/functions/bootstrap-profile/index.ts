import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const corsHeaders = getCorsHeaders();

type ProfileRow = {
  id: string;
  organization_id: string | null;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr) throw userErr;
    const user = userRes.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão expirada. Faça login novamente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingProfile, error: profileErr } = await supabaseService
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (existingProfile) {
      return new Response(JSON.stringify({ profile: existingProfile }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const email = user.email ?? "";
    const emailPrefix = email.includes("@") ? email.split("@")[0] : "user";
    const fullNameRaw = meta.full_name;
    const fullName =
      typeof fullNameRaw === "string" && fullNameRaw.trim()
        ? fullNameRaw.trim()
        : emailPrefix || "Usuário";

    let organizationId: string | null = null;
    let role: "owner" | "member" = "owner";

    const directOrgId = meta.direct_organization_id;
    if (typeof directOrgId === "string" && directOrgId.trim()) {
      organizationId = directOrgId.trim();
      role = "member";
    } else {
      const tokenValRaw = meta.invitation_token ?? meta.registration_code;
      const tokenVal = typeof tokenValRaw === "string" ? tokenValRaw.trim() : "";
      if (tokenVal) {
        const nowIso = new Date().toISOString();
        const { data: tokenRow } = await supabaseService
          .from("invitation_tokens")
          .select("id, organization_id")
          .eq("token", tokenVal)
          .is("used_by", null)
          .gt("expires_at", nowIso)
          .maybeSingle();

        if (tokenRow?.organization_id) {
          organizationId = tokenRow.organization_id as string;
          role = "member";
          await supabaseService
            .from("invitation_tokens")
            .update({ used_by: user.id, used_at: nowIso })
            .eq("id", tokenRow.id);
        } else {
          const { data: codeRow } = await supabaseService
            .from("registration_codes")
            .select("id, organization_id")
            .eq("code", tokenVal)
            .is("used_by", null)
            .gt("expires_at", nowIso)
            .maybeSingle();
          if (codeRow?.organization_id) {
            organizationId = codeRow.organization_id as string;
            role = "member";
            await supabaseService
              .from("registration_codes")
              .update({ used_by: user.id, used_at: nowIso })
              .eq("id", codeRow.id);
          }
        }
      }
    }

    if (!organizationId) {
      const uidPrefix = user.id.slice(0, 8);
      const slugBase = emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, "") || "org";
      const slug = `${slugBase}-${uidPrefix}`;
      const { data: org, error: orgErr } = await supabaseService
        .from("organizations")
        .insert({ name: `${fullName}'s Organization`, slug })
        .select("id")
        .single();
      if (orgErr) throw orgErr;
      organizationId = org.id as string;
      role = "owner";
    }

    const insertPayload = {
      id: user.id,
      organization_id: organizationId,
      full_name: fullName,
      email: email,
      role,
    };
    const { data: createdProfile, error: insertErr } = await supabaseService
      .from("profiles")
      .insert(insertPayload)
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ profile: createdProfile as ProfileRow }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


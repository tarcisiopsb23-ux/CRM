/**
 * upload-branding-logo
 *
 * Edge Function para upload de logo do cliente no Storage.
 * Usa service_role para bypassar RLS — valida o client_id
 * comparando com o JWT do usuário autenticado.
 *
 * POST multipart/form-data:
 *   file      — arquivo de imagem (PNG, JPG, SVG, WebP, máx 2MB)
 *   client_id — UUID do cliente
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const MAX_SIZE   = 2 * 1024 * 1024; // 2MB
const ALLOWED    = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const BUCKET     = "branding";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Valida JWT do usuário ──────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();

  if (!token) return json({ error: "Token de autenticação obrigatório" }, 401);

  // Usa anon key para validar o JWT do usuário
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token inválido ou expirado" }, 401);

  // ── Lê o form data ────────────────────────────────────────────────────────
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return json({ error: "Corpo inválido — envie multipart/form-data" }, 400); }

  const file     = formData.get("file") as File | null;
  const clientId = (formData.get("client_id") as string | null)?.trim();

  if (!file)     return json({ error: "Campo 'file' obrigatório" }, 400);
  if (!clientId) return json({ error: "Campo 'client_id' obrigatório" }, 400);

  // ── Valida que o usuário pertence ao client_id informado ──────────────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: dashUser } = await adminClient
    .from("dashboard_users")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!dashUser) {
    return json({ error: "Acesso negado ao client_id informado" }, 403);
  }

  // ── Valida arquivo ────────────────────────────────────────────────────────
  if (!ALLOWED.includes(file.type)) {
    return json({ error: `Tipo não permitido: ${file.type}. Use PNG, JPG, SVG ou WebP.` }, 400);
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_SIZE) {
    return json({ error: "Arquivo muito grande. Máximo 2MB." }, 400);
  }

  const ext  = file.type === "image/svg+xml" ? "svg"
             : file.type === "image/webp"    ? "webp"
             : file.type === "image/png"     ? "png"
             : "jpg";

  const path = `${clientId}/logo.${ext}`;

  // ── Upload com service_role (bypassa RLS) ─────────────────────────────────
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType:  file.type,
      upsert:       true,
      cacheControl: "3600",
    });

  if (uploadError) {
    console.error("[upload-branding-logo] Erro no upload:", uploadError);
    return json({ error: "Erro ao fazer upload: " + uploadError.message }, 500);
  }

  const { data: urlData } = adminClient.storage
    .from(BUCKET)
    .getPublicUrl(path);

  // Cache-busting
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  return json({ success: true, url: publicUrl });
});

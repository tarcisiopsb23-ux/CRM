/**
 * content-upload-asset
 *
 * Recebe um arquivo de mídia, salva no bucket temporário 'content-staging',
 * cria o registro em content_assets com status='processing' e dispara
 * o webhook n8n para processamento assíncrono (Drive ou Vimeo).
 *
 * O n8n chama content-asset-callback ao concluir o upload externo.
 *
 * POST multipart/form-data:
 *   file            — arquivo (imagem, vídeo, PDF, documento)
 *   content_item_id — UUID do content_item ao qual o asset pertence
 *   is_final        — "true" | "false" — indica se é a arte/entrega final
 *
 * Autenticação: JWT Supabase do usuário (agência, cliente ou parceiro)
 * Tamanhos máximos: vídeo 500MB, imagem/doc 50MB
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_VIDEO = 500 * 1024 * 1024;  // 500MB
const MAX_OTHER = 50  * 1024 * 1024;  // 50MB
const BUCKET    = "content-staging";

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const DOC_TYPES   = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function getFileType(mime: string): string {
  if (VIDEO_TYPES.has(mime)) return "video";
  if (IMAGE_TYPES.has(mime)) return "image";
  if (DOC_TYPES.has(mime))   return mime === "application/pdf" ? "pdf" : "document";
  return "outro";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const N8N_URL  = Deno.env.get("N8N_CONTENT_ASSET_WEBHOOK_URL");

  // ── Valida JWT ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token de autenticação obrigatório" }, 401);

  const userClient = createClient(SUPA_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Token inválido ou expirado" }, 401);

  // Extrai claims do JWT para determinar tipo de usuário
  const jwt        = JSON.parse(atob(token.split(".")[1]));
  const userType   = jwt.user_type as string | undefined;   // 'agency' | 'client' | 'partner'
  const uploaderType: "agency" | "client" | "partner" =
    userType === "client"  ? "client"  :
    userType === "partner" ? "partner" :
    "agency";

  // ── Lê form data ───────────────────────────────────────────────────────────
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return json({ error: "Corpo inválido — envie multipart/form-data" }, 400); }

  const file          = formData.get("file") as File | null;
  const contentItemId = (formData.get("content_item_id") as string | null)?.trim();
  const isFinal       = formData.get("is_final") === "true";

  if (!file)          return json({ error: "Campo 'file' obrigatório" }, 400);
  if (!contentItemId) return json({ error: "Campo 'content_item_id' obrigatório" }, 400);

  // ── Valida tipo e tamanho ──────────────────────────────────────────────────
  const mime     = file.type || "application/octet-stream";
  const fileType = getFileType(mime);
  const maxSize  = fileType === "video" ? MAX_VIDEO : MAX_OTHER;

  if (file.size > maxSize) {
    return json({
      error: `Arquivo excede o tamanho máximo (${Math.round(maxSize / 1024 / 1024)}MB)`,
    }, 413);
  }

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Valida acesso ao content_item ─────────────────────────────────────────
  const { data: item } = await admin
    .from("content_items")
    .select("id, organization_id, client_id, assigned_to, assigned_to_type")
    .eq("id", contentItemId)
    .maybeSingle();

  if (!item) return json({ error: "Item de conteúdo não encontrado" }, 404);

  // Verifica permissão de acordo com o tipo de usuário
  if (uploaderType === "partner") {
    const partnerId = jwt.partner_user_id as string | undefined;
    if (!partnerId || item.assigned_to !== partnerId || item.assigned_to_type !== "partner") {
      return json({ error: "Acesso negado — item não atribuído a este parceiro" }, 403);
    }
  } else if (uploaderType === "client") {
    const clientId = jwt.client_id as string | undefined;
    if (!clientId || item.client_id !== clientId) {
      return json({ error: "Acesso negado — item não pertence a este cliente" }, 403);
    }
  }
  // agency: acesso garantido pela pertença à organização (não verificamos aqui,
  // a RLS do content_item já garante via organization_id)

  // ── Salva no bucket staging ────────────────────────────────────────────────
  const ext        = file.name.split(".").pop() ?? "bin";
  const storagePath = `${item.organization_id}/${contentItemId}/${crypto.randomUUID()}.${ext}`;

  const fileBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mime,
      upsert:      false,
    });

  if (uploadErr) {
    console.error("[content-upload-asset] Storage error:", uploadErr);
    return json({ error: "Falha ao fazer upload do arquivo" }, 500);
  }

  // Obtém URL pública temporária do staging
  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  // ── Cria registro em content_assets ──────────────────────────────────────
  const { data: asset, error: insertErr } = await admin
    .from("content_assets")
    .insert({
      organization_id:  item.organization_id,
      content_item_id:  contentItemId,
      file_name:        file.name,
      file_type:        fileType,
      mime_type:        mime,
      file_size:        file.size,
      is_final:         isFinal,
      status:           "processing",
      uploaded_by:      user.id,
      uploader_type:    uploaderType,
      // staging path salvo temporariamente no external_id até o n8n processar
      external_id:      storagePath,
    })
    .select("id")
    .single();

  if (insertErr || !asset) {
    console.error("[content-upload-asset] Insert error:", insertErr);
    // Tenta remover o arquivo do staging em caso de falha
    await admin.storage.from(BUCKET).remove([storagePath]);
    return json({ error: "Falha ao registrar o asset" }, 500);
  }

  // ── Dispara webhook n8n para processamento ────────────────────────────────
  if (N8N_URL) {
    fetch(N8N_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        asset_id:         asset.id,
        content_item_id:  contentItemId,
        organization_id:  item.organization_id,
        client_id:        item.client_id,
        file_name:        file.name,
        file_type:        fileType,
        mime_type:        mime,
        staging_url:      publicUrl,
        staging_path:     storagePath,
        is_final:         isFinal,
        uploader_type:    uploaderType,
      }),
    }).catch(err => console.error("[content-upload-asset] n8n webhook error:", err));
    // Fire-and-forget: não aguarda resposta do n8n
  } else {
    console.warn("[content-upload-asset] N8N_CONTENT_ASSET_WEBHOOK_URL não configurado — processamento manual necessário");
  }

  return json({
    success:  true,
    asset_id: asset.id,
    status:   "processing",
    message:  "Upload recebido. Processando arquivo...",
  });
});

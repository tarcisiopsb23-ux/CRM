/**
 * content-asset-callback
 *
 * Chamada pelo n8n após concluir o upload externo (Drive ou Vimeo).
 * Atualiza content_assets com os dados do provedor externo,
 * remove o arquivo do bucket staging e notifica o frontend via
 * Supabase Realtime (broadcast no canal content-assets).
 *
 * Autenticação: header x-content-api-key (chave interna, nunca exposta ao frontend)
 *
 * POST application/json:
 * {
 *   asset_id:          UUID,
 *   external_provider: "google_drive" | "vimeo",
 *   external_id:       string,   // drive_file_id ou vimeo_video_id
 *   embed_url:         string,   // URL de embed
 *   view_url:          string,   // URL de visualização direta
 *   thumbnail_url?:    string,
 *   staging_path:      string,   // path no bucket content-staging para remover
 *   success:           boolean,
 *   error_message?:    string    // preenchido se success=false
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-content-api-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Método não permitido" }, 405);

  // ── Autenticação via API key interna ──────────────────────────────────────
  const apiKey = req.headers.get("x-content-api-key");
  if (!apiKey || apiKey !== Deno.env.get("CONTENT_API_KEY")) {
    return json({ error: "Não autorizado" }, 401);
  }

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BUCKET   = "content-staging";

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    asset_id:          string;
    external_provider?: string;
    external_id?:       string;
    embed_url?:         string;
    view_url?:          string;
    thumbnail_url?:     string;
    staging_path?:      string;
    success:            boolean;
    error_message?:     string;
  };

  try { body = await req.json(); }
  catch { return json({ error: "Body JSON inválido" }, 400); }

  if (!body.asset_id) return json({ error: "asset_id obrigatório" }, 400);

  const admin = createClient(SUPA_URL, SVC_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Busca o asset para obter organization_id e content_item_id ───────────
  const { data: asset } = await admin
    .from("content_assets")
    .select("id, organization_id, content_item_id")
    .eq("id", body.asset_id)
    .maybeSingle();

  if (!asset) return json({ error: "Asset não encontrado" }, 404);

  if (body.success) {
    // ── Sucesso: atualiza asset com dados do provedor ──────────────────────
    const { error: updateErr } = await admin
      .from("content_assets")
      .update({
        external_provider: body.external_provider ?? null,
        external_id:       body.external_id       ?? null,
        embed_url:         body.embed_url          ?? null,
        view_url:          body.view_url           ?? null,
        thumbnail_url:     body.thumbnail_url      ?? null,
        status:            "ready",
        error_message:     null,
        // Limpa o staging path do external_id temporário
        updated_at:        new Date().toISOString(),
      })
      .eq("id", body.asset_id);

    if (updateErr) {
      console.error("[content-asset-callback] Update error:", updateErr);
      return json({ error: "Falha ao atualizar asset" }, 500);
    }

    // Remove arquivo do bucket staging (fire-and-forget)
    if (body.staging_path) {
      admin.storage.from(BUCKET).remove([body.staging_path])
        .catch(err => console.warn("[content-asset-callback] Staging cleanup error:", err));
    }

  } else {
    // ── Falha: marca asset como error ─────────────────────────────────────
    await admin
      .from("content_assets")
      .update({
        status:        "error",
        error_message: body.error_message ?? "Erro desconhecido no processamento",
        updated_at:    new Date().toISOString(),
      })
      .eq("id", body.asset_id);

    console.error("[content-asset-callback] Asset processing failed:", body.error_message);
  }

  // ── Notifica frontend via Realtime broadcast ───────────────────────────────
  // O frontend subscreve o canal `content-assets:{content_item_id}`
  // e atualiza a lista de assets quando recebe este broadcast.
  try {
    const realtimeClient = createClient(SUPA_URL, SVC_KEY, {
      auth:     { autoRefreshToken: false, persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });

    const channel = realtimeClient.channel(`content-assets:${asset.content_item_id}`);
    await channel.send({
      type:    "broadcast",
      event:   "asset_updated",
      payload: {
        asset_id:        body.asset_id,
        content_item_id: asset.content_item_id,
        status:          body.success ? "ready" : "error",
        embed_url:       body.embed_url ?? null,
        thumbnail_url:   body.thumbnail_url ?? null,
      },
    });
    await realtimeClient.removeChannel(channel);
  } catch (realtimeErr) {
    // Realtime não é crítico — loga mas não falha a resposta
    console.warn("[content-asset-callback] Realtime broadcast error:", realtimeErr);
  }

  return json({ success: true });
});

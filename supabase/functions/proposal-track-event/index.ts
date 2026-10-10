// Edge Function: proposal-track-event
// Recebe eventos da Proposal_Viewer (página pública, sem auth de usuário)
// Actions: load | scroll_50 | scroll_90 | click_whatsapp | click_aprovar | aceite

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

// Simple SHA-256 using Web Crypto
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Simple IP geolocation (fails silently)
async function getCity(ip: string): Promise<string | null> {
  try {
    if (ip === "127.0.0.1" || ip.startsWith("::")) return null;
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return (data.city as string) ?? null;
  } catch {
    return null;
  }
}

// Simple user-agent parsing
function parseUserAgent(ua: string): { device: string; browser: string; os: string } {
  const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
  let browser = "other";
  if (/Chrome/i.test(ua) && !/Chromium|Edge/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "safari";
  else if (/Firefox/i.test(ua)) browser = "firefox";
  else if (/Edge/i.test(ua)) browser = "edge";
  let os = "other";
  if (/Windows/i.test(ua)) os = "windows";
  else if (/Mac OS/i.test(ua)) os = "macos";
  else if (/Android/i.test(ua)) os = "android";
  else if (/iPhone|iPad/i.test(ua)) os = "ios";
  else if (/Linux/i.test(ua)) os = "linux";
  return { device, browser, os };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as {
      action: "load" | "scroll_50" | "scroll_90" | "click_whatsapp" | "click_aprovar" | "aceite";
      slug: string;
      session_id: string;
      user_agent?: string;
      approver_name?: string;
      approver_cpf?: string;
      proposal_snapshot?: Record<string, unknown>;
    };

    const { action, slug, session_id } = body;
    if (!action || !slug || !session_id) {
      return json({ error: "action, slug e session_id são obrigatórios" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve proposal by slug
    const { data: propData, error: propError } = await admin.rpc("get_proposal_by_slug", { p_slug: slug });
    if (propError || !propData || propData.length === 0) {
      return json({ error: "Proposta não encontrada" }, 404);
    }
    const propResult = propData[0] as {
      proposal_id: string;
      organization_id: string;
      status: string;
    };
    
    // Get full proposal to get lead_id
    const { data: fullProp, error: fullPropError } = await admin.from("proposals").select("*").eq("id", propResult.proposal_id).single();
    if (fullPropError || !fullProp) {
      return json({ error: "Proposta não encontrada" }, 404);
    }
    const prop = fullProp as {
      id: string;
      organization_id: string;
      status: string;
      lead_id?: string | null;
    };

    // Detect IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? null;

    const ua = body.user_agent ?? req.headers.get("user-agent") ?? "";
    const { device, browser, os } = parseUserAgent(ua);

    // ── action: load ──────────────────────────────────────────────────────────
    if (action === "load") {
      const city = ip ? await getCity(ip) : null;

      await admin.from("proposal_events").insert({
        proposal_id: prop.id,
        organization_id: prop.organization_id,
        event_type: "visualizacao",
        session_id,
        ip,
        city,
        device,
        browser,
        os,
        user_agent: ua || null,
      });

      // Update aggregate counters atomically
      await admin.rpc("increment_proposal_access", {
        p_proposal_id: prop.id,
        p_first_access: prop.status === "enviada",
      }).catch(() => {
        // Fallback if RPC doesn't exist yet
        admin.from("proposals").update({
          total_accesses: 0, // will be handled by trigger
          last_accessed_at: new Date().toISOString(),
        }).eq("id", prop.id);
      });

      // Update counters directly
      const { data: current } = await admin
        .from("proposals")
        .select("total_accesses, first_accessed_at")
        .eq("id", prop.id)
        .single();

      const updates: Record<string, unknown> = {
        total_accesses: ((current as Record<string, unknown>)?.total_accesses as number ?? 0) + 1,
        last_accessed_at: new Date().toISOString(),
      };
      if (!(current as Record<string, unknown>)?.first_accessed_at) {
        updates.first_accessed_at = new Date().toISOString();
      }
      // Transition enviada → visualizada on first visit
      if (prop.status === "enviada") {
        updates.status = "visualizada";
      }
      await admin.from("proposals").update(updates).eq("id", prop.id);

      return json({ success: true });
    }

    // ── scroll / click events ─────────────────────────────────────────────────
    const eventMap: Record<string, string> = {
      scroll_50: "scroll_parcial",
      scroll_90: "scroll_completo",
      click_whatsapp: "clique_whatsapp",
      click_aprovar: "clique_aprovar",
    };

    if (eventMap[action]) {
      await admin.from("proposal_events").insert({
        proposal_id: prop.id,
        organization_id: prop.organization_id,
        event_type: eventMap[action],
        session_id,
        ip,
        device,
        browser,
        os,
        user_agent: ua || null,
      });
      return json({ success: true });
    }

    // ── action: aceite ────────────────────────────────────────────────────────
    if (action === "aceite") {
      const { approver_name, approver_cpf, proposal_snapshot } = body;
      if (!approver_name || !approver_cpf || !proposal_snapshot) {
        return json({ error: "approver_name, approver_cpf e proposal_snapshot são obrigatórios para aceite" }, 400);
      }

      // Idempotency check — P5
      const { data: existing } = await admin
        .from("proposal_acceptances")
        .select("id")
        .eq("proposal_id", prop.id)
        .maybeSingle();

      if (existing) {
        return json({ error: "Esta proposta já foi aprovada" }, 409);
      }

      // SHA-256 of snapshot — P3
      const snapshotStr = JSON.stringify(proposal_snapshot);
      const snapshot_hash = await sha256(snapshotStr);

      // Insert acceptance
      const { error: accError } = await admin.from("proposal_acceptances").insert({
        proposal_id: prop.id,
        organization_id: prop.organization_id,
        approver_name,
        approver_cpf,
        ip_address: ip ?? "unknown",
        user_agent: ua || null,
        proposal_snapshot,
        snapshot_hash,
      });

      if (accError) {
        // Handle unique constraint violation (race condition)
        if (accError.code === "23505") {
          return json({ error: "Esta proposta já foi aprovada" }, 409);
        }
        throw accError;
      }

      // Update proposal status
      await admin.from("proposals")
        .update({ status: "aprovada" })
        .eq("id", prop.id);

      // If there's a lead, move it to efetivados
      if (prop.lead_id) {
        await admin.from("leads").update({ etapa_kanban: "efetivados" }).eq("id", prop.lead_id).eq("organization_id", prop.organization_id);
      }

      // Insert analytics event
      await admin.from("proposal_events").insert({
        proposal_id: prop.id,
        organization_id: prop.organization_id,
        event_type: "aprovacao_confirmada",
        session_id,
        ip,
        device,
        browser,
        os,
        user_agent: ua || null,
      });

      // Audit log
      await admin.from("proposal_audit_log").insert({
        organization_id: prop.organization_id,
        proposal_id: prop.id,
        action: "aprovacao",
        metadata: { approver_name, ip },
      });

      // Trigger contract generation (fire-and-forget)
      const supabaseFunctionsUrl = supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
      fetch(`${supabaseFunctionsUrl}/proposal-generate-contract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ proposal_id: prop.id }),
      }).catch((e) => console.error("[proposal-track-event] Failed to trigger contract generation:", e));

      return json({ success: true });
    }

    return json({ error: `Action desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error("[proposal-track-event] Erro interno:", err);
    return json({ error: "Erro interno" }, 500);
  }
});

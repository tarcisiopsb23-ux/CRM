/**
 * receive-client-kpis
 * Edge Function chamada pelo n8n do cliente para enviar KPIs diárias de conversas.
 *
 * Autenticação: Header "x-api-key: <client_api_key>"
 * Método: POST
 *
 * Payload esperado:
 * {
 *   "period_date": "2026-03-20",
 *   "source": "whatsapp",
 *   "campaign": "Campanha Verão",
 *   "conversations": 120,
 *   "bot_finished": 85,
 *   "human_transfer": 20,
 *   "leads_identified": 60,
 *   "conversions": 15,
 *   "agents": [                          // opcional
 *     {
 *       "name": "João Silva",
 *       "conversations_started": 10,
 *       "conversations_finished": 8,
 *       "conversions": 3
 *     }
 *   ]
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 1. Autenticação via API Key ──────────────────────────────────────────
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing x-api-key header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  const { data: keyRow, error: keyError } = await supabase
    .from("client_api_keys")
    .select("id, organization_id, client_id, active")
    .eq("api_key", apiKey)
    .single();

  if (keyError || !keyRow || !keyRow.active) {
    return new Response(JSON.stringify({ error: "Invalid or inactive API key" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Atualiza last_used_at sem bloquear a resposta
  supabase.from("client_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(() => {});

  // ── 2. Parse e validação do payload ─────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    period_date,
    source = "whatsapp",
    campaign = null,
    conversations   = 0,
    bot_finished    = 0,
    human_transfer  = 0,
    leads_identified = 0,
    conversions     = 0,
    agents          = [],
  } = body;

  // Validações básicas
  if (!period_date || !/^\d{4}-\d{2}-\d{2}$/.test(period_date)) {
    return new Response(JSON.stringify({ error: "period_date is required (YYYY-MM-DD)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const validSources = ["whatsapp", "instagram", "facebook"];
  if (!validSources.includes(source)) {
    return new Response(JSON.stringify({ error: `source must be one of: ${validSources.join(", ")}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 3. Upsert na tabela isolada ──────────────────────────────────────────
  const { data, error } = await supabase
    .from("client_conversation_kpis")
    .upsert({
      organization_id:  keyRow.organization_id,
      client_id:        keyRow.client_id,
      period_date,
      source,
      campaign,
      conversations:    Number(conversations),
      bot_finished:     Number(bot_finished),
      human_transfer:   Number(human_transfer),
      leads_identified: Number(leads_identified),
      conversions:      Number(conversions),
      updated_at:       new Date().toISOString(),
    }, {
      onConflict: "organization_id,client_id,period_date,source,campaign",
    })
    .select("id")
    .single();

  if (error) {
    console.error("KPI upsert error:", error);
    return new Response(JSON.stringify({ error: "Failed to save KPI data" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── 4. Upsert KPIs por atendente (opcional) ──────────────────────────────
  if (Array.isArray(agents) && agents.length > 0) {
    const agentRows = agents
      .filter((a: any) => a?.name)
      .map((a: any) => ({
        organization_id:        keyRow.organization_id,
        client_id:              keyRow.client_id,
        period_date,
        agent_name:             String(a.name),
        conversations_started:  Number(a.conversations_started  ?? 0),
        conversations_finished: Number(a.conversations_finished ?? 0),
        conversions:            Number(a.conversions            ?? 0),
        updated_at:             new Date().toISOString(),
      }));

    if (agentRows.length > 0) {
      const { error: agentError } = await supabase
        .from("client_agent_kpis")
        .upsert(agentRows, { onConflict: "organization_id,client_id,period_date,agent_name" });

      if (agentError) console.error("Agent KPI upsert error:", agentError);
    }
  }

  return new Response(JSON.stringify({ success: true, id: data.id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

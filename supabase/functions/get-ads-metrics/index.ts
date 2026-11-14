/**
 * get-ads-metrics — v2
 *
 * Busca Meta Ads Insights para contas conectadas de uma organização.
 * Resolve tokens via meta-credential-provider.
 * Suporta persistência em campaign_data via persist=true.
 * Suporta backfill por campanha selecionada (mode=backfill + campaign_ids).
 * Suporta listagem de campanhas disponíveis (action=list_campaigns).
 *
 * POST /get-ads-metrics
 * Headers: Authorization: Bearer <service_role_key>
 *          X-Internal-Secret: <INTERNAL_SECRET>
 * Body: {
 *   organization_id: string,
 *   client_id?:      string,       // filtrar por cliente
 *   integration_id?: string,       // atualizar sync_status em client_integrations
 *   date_from?:      string,       // YYYY-MM-DD (prioridade sobre date_preset)
 *   date_to?:        string,       // YYYY-MM-DD
 *   date_preset?:    string,       // ex: "last_30d", "last_3d"
 *   persist?:        boolean,      // gravar em campaign_data
 *   mode?:           "sync" | "backfill",
 *   campaign_ids?:   string[],     // filtrar campanhas (backfill)
 *   action?:         "list_campaigns" | "fetch_insights",
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v19.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function actId(raw: string): string {
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function getAction(
  actions: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  return parseFloat(actions?.find((a) => a.action_type === type)?.value ?? "0");
}

function getActionValue(
  values: Array<{ action_type: string; value: string }> | undefined,
  type: string,
): number {
  return parseFloat(values?.find((a) => a.action_type === type)?.value ?? "0");
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Resolve token via meta-credential-provider ────────────────────────────────

async function resolveToken(
  connectionId: string,
  orgId: string,
  supabaseUrl: string,
  serviceKey: string,
  internalSecret: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/meta-credential-provider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({
        connection_id: connectionId,
        organization_id: orgId,
        action: "get_token",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// ── Listar campanhas de uma conta ─────────────────────────────────────────────

async function listCampaigns(
  accountIdRaw: string,
  token: string,
): Promise<Array<{ id: string; name: string; status: string; created_time: string }>> {
  const accountId = actId(accountIdRaw);
  try {
    const url =
      `${GRAPH}/${accountId}/campaigns` +
      `?fields=id,name,status,created_time` +
      `&limit=100` +
      `&access_token=${encodeURIComponent(token)}`;
    const res  = await fetch(url);
    const body = await res.json() as {
      data?: Array<{ id: string; name: string; status: string; created_time: string }>;
    };
    return body.data ?? [];
  } catch {
    return [];
  }
}

// ── Buscar created_time de campanhas específicas ──────────────────────────────

async function getCampaignCreatedTime(
  campaignId: string,
  token: string,
): Promise<string | null> {
  try {
    const url =
      `${GRAPH}/${campaignId}` +
      `?fields=created_time` +
      `&access_token=${encodeURIComponent(token)}`;
    const res  = await fetch(url);
    const body = await res.json() as { created_time?: string };
    return body.created_time ? body.created_time.slice(0, 10) : null;
  } catch {
    return null;
  }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CampaignDayRow {
  client_id:               string;
  organization_id:         string;
  date:                    string;
  platform:                string;
  campaign_id:             string;
  campaign_name:           string;
  objective:               string | null;
  objective_metric_label:  string | null;
  objective_metric_value:  number | null;
  spend:                   number;
  clicks:                  number;
  impressions:             number;
  reach:                   number;
  leads:                   number;
  sales:                   number;
  revenue:                 number;
}

interface InsightsResult {
  connection_id:   string;
  account_id:      string;
  account_id_raw:  string;
  client_id:       string | null;
  display_name:    string | null;
  error?:          string;
  totals?:         Record<string, unknown>;
  by_campaign?:    unknown[];
  by_day?:         unknown[];
  persisted?:      { inserted: number; updated: number; total: number };
}

// ── Fetch insights para uma conta ─────────────────────────────────────────────

async function fetchInsights(
  connectionId: string,
  accountIdRaw: string,
  clientId: string | null,
  orgId: string,
  displayName: string | null,
  token: string,
  periodParam: string,
  persist: boolean,
  campaignIds: string[] | undefined,
  supabase: ReturnType<typeof createClient>,
): Promise<InsightsResult> {
  const accountId = actId(accountIdRaw);
  const base      = `access_token=${encodeURIComponent(token)}`;

  // Filtro de campanha opcional
  const campaignFilter = campaignIds && campaignIds.length > 0
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]))}`
    : "";

  const result: InsightsResult = {
    connection_id:  connectionId,
    account_id:     accountId,
    account_id_raw: accountIdRaw,
    client_id:      clientId,
    display_name:   displayName,
  };

  try {
    // ── Totais ───────────────────────────────────────────────────────────────
    const totalsRes  = await fetch(
      `${GRAPH}/${accountId}/insights` +
      `?fields=spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values` +
      `&${periodParam}${campaignFilter}&${base}`
    );
    const totalsData = await totalsRes.json() as {
      data?: unknown[];
      error?: { message: string; code: number };
    };
    if (totalsData.error) {
      result.error = `${totalsData.error.code}: ${totalsData.error.message}`;
      return result;
    }

    const t = (totalsData.data?.[0] ?? {}) as {
      spend?: string; impressions?: string; clicks?: string; ctr?: string;
      cpc?: string; cpm?: string; reach?: string;
      actions?: Array<{ action_type: string; value: string }>;
      action_values?: Array<{ action_type: string; value: string }>;
    };
    const spend     = parseFloat(t.spend ?? "0");
    const leads     = getAction(t.actions, "lead") + getAction(t.actions, "onsite_conversion.lead_grouped");
    const purchases = getAction(t.actions, "purchase");
    const revenue   = getActionValue(t.action_values, "purchase");
    result.totals = {
      spend, impressions: parseInt(t.impressions ?? "0"), clicks: parseInt(t.clicks ?? "0"),
      ctr: parseFloat(t.ctr ?? "0"), cpc: parseFloat(t.cpc ?? "0"), cpm: parseFloat(t.cpm ?? "0"),
      reach: parseInt(t.reach ?? "0"), leads, purchases, purchase_value: revenue,
      roas: spend > 0 ? revenue / spend : 0,
    };

    // ── Por campanha (agregado) ───────────────────────────────────────────────
    const campRes  = await fetch(
      `${GRAPH}/${accountId}/insights` +
      `?fields=campaign_id,campaign_name,spend,impressions,clicks,actions,action_values` +
      `&level=campaign&${periodParam}&sort=spend_descending&limit=20${campaignFilter}&${base}`
    );
    const campData = await campRes.json() as { data?: unknown[] };
    result.by_campaign = ((campData.data ?? []) as Array<{
      campaign_id?: string; campaign_name?: string; spend?: string;
      impressions?: string; clicks?: string;
      actions?: Array<{ action_type: string; value: string }>;
      action_values?: Array<{ action_type: string; value: string }>;
    }>).map((c) => {
      const cs = parseFloat(c.spend ?? "0");
      return {
        campaign_id: c.campaign_id, campaign_name: c.campaign_name,
        spend: cs, impressions: parseInt(c.impressions ?? "0"), clicks: parseInt(c.clicks ?? "0"),
        leads: getAction(c.actions, "lead") + getAction(c.actions, "onsite_conversion.lead_grouped"),
        purchases: getAction(c.actions, "purchase"),
        roas: cs > 0 ? getActionValue(c.action_values, "purchase") / cs : 0,
      };
    });

    // ── Por dia (agregado) ────────────────────────────────────────────────────
    const dayRes  = await fetch(
      `${GRAPH}/${accountId}/insights` +
      `?fields=spend,impressions,clicks,actions&time_increment=1&${periodParam}${campaignFilter}&${base}`
    );
    const dayData = await dayRes.json() as { data?: unknown[] };
    result.by_day = ((dayData.data ?? []) as Array<{
      date_start?: string; spend?: string; impressions?: string; clicks?: string;
      actions?: Array<{ action_type: string; value: string }>;
    }>).map((d) => ({
      date:        d.date_start,
      spend:       parseFloat(d.spend ?? "0"),
      impressions: parseInt(d.impressions ?? "0"),
      clicks:      parseInt(d.clicks ?? "0"),
      leads:       getAction(d.actions, "lead") + getAction(d.actions, "onsite_conversion.lead_grouped"),
    }));

    // ── Por campanha × dia (para persistência) ────────────────────────────────
    if (persist && clientId) {
      const cdRes  = await fetch(
        `${GRAPH}/${accountId}/insights` +
        `?fields=campaign_id,campaign_name,objective,spend,impressions,clicks,reach,actions,action_values` +
        `&level=campaign&time_increment=1&limit=500&${periodParam}${campaignFilter}&${base}`
      );
      const cdData = await cdRes.json() as { data?: unknown[] };

      // Mapeamento de objective Meta → label/value da tabela
      // Prioridade: verifica o array de actions para encontrar a conversão real
      // independente do objetivo da campanha
      function resolveObjectiveMetric(
        objective: string | undefined,
        actions: Array<{ action_type: string; value: string }> | undefined,
        impressions: string | undefined,
        clicks: string | undefined,
      ): { label: string; value: number } {

        // Priority order: conversões mais específicas primeiro
        const PRIORITY_ACTIONS: Array<{ action_type: string; label: string }> = [
          // WhatsApp / Messenger conversas
          { action_type: "onsite_conversion.messaging_conversation_started_7d", label: "conversas_iniciadas" },
          { action_type: "onsite_conversion.messaging_first_reply",             label: "primeiras_respostas" },
          // Leads / formulários
          { action_type: "lead",                                                label: "leads" },
          { action_type: "onsite_conversion.lead_grouped",                      label: "leads" },
          { action_type: "onsite_conversion.total_messaging_connection",        label: "conexoes_msg" },
          // Compras
          { action_type: "purchase",                                            label: "compras" },
          { action_type: "omni_purchase",                                       label: "compras" },
          // Checkout / intenção
          { action_type: "omni_initiated_checkout",                             label: "checkouts" },
          { action_type: "initiate_checkout",                                   label: "checkouts" },
          // Cliques em links
          { action_type: "link_click",                                          label: "cliques_link" },
          { action_type: "offsite_conversion.fb_pixel_lead",                    label: "leads_pixel" },
          // Engajamento (menor prioridade)
          { action_type: "post_engagement",                                     label: "engajamento" },
          { action_type: "page_engagement",                                     label: "engajamento" },
        ];

        // Busca a action prioritária com valor > 0
        for (const { action_type, label } of PRIORITY_ACTIONS) {
          const val = getAction(actions, action_type);
          if (val > 0) {
            return { label, value: val };
          }
        }

        // Fallback: usa o mapeamento pelo objetivo da campanha
        const fallbackMap: Record<string, { label: string; value: number }> = {
          OUTCOME_LEADS:         { label: "leads",       value: getAction(actions, "lead") },
          OUTCOME_SALES:         { label: "compras",     value: getAction(actions, "purchase") },
          OUTCOME_TRAFFIC:       { label: "cliques_link", value: parseInt(clicks ?? "0") },
          OUTCOME_AWARENESS:     { label: "impressoes",  value: parseInt(impressions ?? "0") },
          OUTCOME_ENGAGEMENT:    { label: "engajamento", value: getAction(actions, "post_engagement") },
          OUTCOME_APP_PROMOTION: { label: "instalacoes", value: getAction(actions, "app_install") },
        };

        return fallbackMap[objective ?? ""] ?? { label: "", value: 0 };
      }

      const rows: CampaignDayRow[] = ((cdData.data ?? []) as Array<{
        date_start?: string; campaign_id?: string; campaign_name?: string; objective?: string;
        spend?: string; impressions?: string; clicks?: string; reach?: string;
        actions?: Array<{ action_type: string; value: string }>;
        action_values?: Array<{ action_type: string; value: string }>;
      }>).map((r) => {
        const { label, value: objectiveValue } = resolveObjectiveMetric(
          r.objective,
          r.actions,
          r.impressions,
          r.clicks,
        );

        return {
          client_id:               clientId,
          organization_id:         orgId,
          date:                    r.date_start ?? todayStr(),
          platform:                "meta",
          campaign_id:             r.campaign_id ?? "",
          campaign_name:           r.campaign_name ?? "",
          objective:               r.objective ?? null,
          objective_metric_label:  label || null,
          objective_metric_value:  objectiveValue || null,
          spend:                   parseFloat(r.spend ?? "0"),
          clicks:                  parseInt(r.clicks ?? "0"),
          impressions:             parseInt(r.impressions ?? "0"),
          reach:                   parseInt(r.reach ?? "0"),
          leads:                   getAction(r.actions, "lead") + getAction(r.actions, "onsite_conversion.lead_grouped") + getAction(r.actions, "onsite_conversion.messaging_conversation_started_7d"),
          sales:                   getAction(r.actions, "purchase"),
          revenue:                 getActionValue(r.action_values, "purchase"),
        };
      });

      if (rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: upsertResult, error: upsertErr } = await (supabase.rpc as any)(
          "upsert_campaign_data_batch",
          { p_records: rows },
        );
        if (upsertErr) {
          result.error = `persist_failed: ${upsertErr.message}`;
        } else {
          result.persisted = upsertResult as { inserted: number; updated: number; total: number };
        }
      } else {
        result.persisted = { inserted: 0, updated: 0, total: 0 };
      }
    }
  } catch (e: unknown) {
    result.error = e instanceof Error ? e.message : "unknown_error";
  }

  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const internalSecret = Deno.env.get("INTERNAL_SECRET") ?? "";

  // Verificar X-Internal-Secret (apenas chamadas internas via trigger-ads-sync)
  const callerSecret = req.headers.get("X-Internal-Secret");
  if (callerSecret && callerSecret !== internalSecret) {
    return json({ error: "Acesso não autorizado" }, 403);
  }

  let body: {
    organization_id?:  string;
    client_id?:        string;
    integration_id?:   string;
    date_from?:        string;
    date_to?:          string;
    date_preset?:      string;
    persist?:          boolean;
    mode?:             "sync" | "backfill";
    campaign_ids?:     string[];
    action?:           "list_campaigns" | "fetch_insights";
  };
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const {
    organization_id, client_id, integration_id,
    persist = false, mode = "sync", campaign_ids,
    action = "fetch_insights",
  } = body;

  let { date_from, date_to, date_preset } = body;

  if (!organization_id) return json({ error: "organization_id é obrigatório" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Busca conexões ────────────────────────────────────────────────────────
  let query = admin
    .from("meta_connections")
    .select("id, organization_id, client_id, display_name, ad_account_id, status")
    .eq("organization_id", organization_id)
    .not("ad_account_id", "is", null)
    .in("status", ["active", "needs_reauthentication"]);

  if (client_id) query = query.eq("client_id", client_id);

  const { data: connections, error: connErr } = await query;
  if (connErr) return json({ error: connErr.message }, 500);
  if (!connections || connections.length === 0) {
    return json({ results: [], total_accounts: 0 });
  }

  // ── Ação: listar campanhas ────────────────────────────────────────────────
  if (action === "list_campaigns") {
    const campaignResults = await Promise.all(
      connections.map(async (conn) => {
        const token = await resolveToken(conn.id, conn.organization_id, supabaseUrl, serviceKey, internalSecret);
        if (!token) return { connection_id: conn.id, account_id: actId(conn.ad_account_id), campaigns: [], error: "token_resolution_failed" };
        const campaigns = await listCampaigns(conn.ad_account_id, token);
        return { connection_id: conn.id, account_id: actId(conn.ad_account_id), client_id: conn.client_id, campaigns };
      })
    );
    return json({ results: campaignResults });
  }

  // ── Determinar período ────────────────────────────────────────────────────
  if (mode === "backfill" && campaign_ids && campaign_ids.length > 0) {
    // date_from será determinado por campanha — deixar nulo aqui
    // fetchInsights não é chamado neste modo com periodParam fixo
    // em vez disso, fazemos o loop por campanha abaixo
  } else if (!date_from && !date_to && !date_preset) {
    if (integration_id) {
      // Busca created_at / last_sync_at da integração
      const { data: intRow } = await admin
        .from("client_integrations")
        .select("created_at, last_sync_at")
        .eq("id", integration_id)
        .maybeSingle();

      if (intRow?.last_sync_at) {
        date_preset = "last_3d";
      } else if (intRow?.created_at) {
        date_from = intRow.created_at.slice(0, 10);
        date_to   = todayStr();
      } else {
        date_preset = "last_30d";
      }
    } else {
      date_preset = "last_30d";
    }
  }

  // ── Atualizar sync_status para 'syncing' ──────────────────────────────────
  if (persist && integration_id) {
    await admin
      .from("client_integrations")
      .update({ sync_status: "syncing" })
      .eq("id", integration_id);
  }

  // ── Mode backfill: resolve created_time de cada campanha ──────────────────
  if (mode === "backfill" && campaign_ids && campaign_ids.length > 0) {
    const conn = connections[0]; // backfill sempre é por cliente específico
    const token = await resolveToken(conn.id, conn.organization_id, supabaseUrl, serviceKey, internalSecret);
    if (!token) return json({ error: "token_resolution_failed" }, 400);

    // Determina a data mais antiga entre todas as campanhas selecionadas
    const createdDates = await Promise.all(
      campaign_ids.map(id => getCampaignCreatedTime(id, token))
    );
    const validDates = createdDates.filter(Boolean) as string[];
    date_from = validDates.length > 0 ? validDates.sort()[0] : todayStr();
    date_to   = todayStr();
  }

  const periodParam = date_from && date_to
    ? `time_range=${encodeURIComponent(JSON.stringify({ since: date_from, until: date_to }))}`
    : `date_preset=${encodeURIComponent(date_preset ?? "last_30d")}`;

  // ── Fetch insights em paralelo ────────────────────────────────────────────
  const results = await Promise.all(
    connections.map(async (conn) => {
      const token = await resolveToken(conn.id, conn.organization_id, supabaseUrl, serviceKey, internalSecret);
      if (!token) {
        return {
          connection_id: conn.id, account_id: actId(conn.ad_account_id),
          account_id_raw: conn.ad_account_id, client_id: conn.client_id,
          display_name: conn.display_name, error: "token_resolution_failed",
        } as InsightsResult;
      }
      return fetchInsights(
        conn.id, conn.ad_account_id, conn.client_id, conn.organization_id,
        conn.display_name, token, periodParam, persist,
        mode === "backfill" ? campaign_ids : undefined,
        admin,
      );
    })
  );

  // ── Atualizar sync_status final ───────────────────────────────────────────
  if (persist && integration_id) {
    const anyError = results.some(r => r.error);
    const totalRecords = results.reduce((sum, r) => sum + (r.persisted?.total ?? 0), 0);
    const errorMsg = results.find(r => r.error)?.error ?? null;

    await admin
      .from("client_integrations")
      .update({
        sync_status:        anyError ? "error" : "success",
        sync_error:         anyError ? errorMsg : null,
        last_sync_at:       new Date().toISOString(),
        last_sync_records:  totalRecords,
      })
      .eq("id", integration_id);
  }

  const successful = results.filter(r => !r.error);
  const failed     = results.filter(r =>  r.error);

  return json({
    total_accounts: connections.length,
    successful:     successful.length,
    failed:         failed.length,
    results,
  });
});

/**
 * Edge Function: lead-form-submit
 *
 * Processa submissões de formulários de captura de leads.
 *
 * Fluxo:
 *   1. Valida payload (form_id ou client_slug + form_slug)
 *   2. Resolve formulário via get_form_by_slug RPC
 *   3. Valida campos obrigatórios definidos no formulário
 *   4. Upsert em client_crm_contacts (por email ou phone)
 *   5. Se form.auto_create_deal = true → cria client_crm_deals
 *   6. Incrementa form.submission_count
 *   7. Registra em client_lead_form_submissions
 *   8. Chama track-conversion internamente
 *   9. Retorna { success, contact_id, submission_id }
 *
 * Sem autenticação — chamada pelo browser na página pública /form/:slug
 *
 * Secrets necessários:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL  (para chamar track-conversion internamente)
 */

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

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FormField {
  id:           string;
  type:         string;
  label:        string;
  placeholder?: string;
  required?:    boolean;
  options?:     string[];
  logic?:       { show_if?: { field_id: string; operator: string; value: string } };
}

interface FormDefinition {
  form_id:         string;
  client_id:       string;
  organization_id: string;
  title:           string;
  fields:          FormField[];
  trigger_event:   string;
  pipeline_id:     string | null;
  pipeline_stage_id: string | null;
  auto_create_deal: boolean;
  success_message: string;
  redirect_url:    string | null;
  client_slug:     string;
}

// ─── Extrai valor normalizado de um campo ─────────────────────────────────────
function extractContactField(
  fieldType: string,
  value: unknown
): Partial<Record<string, unknown>> {
  const v = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!v) return {};
  switch (fieldType) {
    case "email":  return { email:    v.toLowerCase() };
    case "phone":  return { phone:    v, whatsapp: v };
    case "text":   return {};  // nome é tratado separadamente por label
    default:       return {};
  }
}

// ─── Verifica se um campo condicional deve ser mostrado ───────────────────────
function fieldIsVisible(field: FormField, data: Record<string, unknown>): boolean {
  const logic = field.logic?.show_if;
  if (!logic) return true;
  const dep = String(data[logic.field_id] ?? "");
  switch (logic.operator) {
    case "equals":       return dep === logic.value;
    case "not_equals":   return dep !== logic.value;
    case "contains":     return dep.includes(logic.value);
    case "not_empty":    return dep.length > 0;
    default:             return true;
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appUrl      = Deno.env.get("APP_URL") ?? supabaseUrl.replace(".supabase.co", ".functions.supabase.co");

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json() as {
      // Resolução do formulário
      client_slug: string;
      form_slug:   string;
      // Dados submetidos (mapa campo_id → valor)
      data:        Record<string, unknown>;
      // UTMs e parâmetros de atribuição (capturados pelo browser)
      utm_source?:   string;
      utm_medium?:   string;
      utm_campaign?: string;
      utm_content?:  string;
      utm_term?:     string;
      fbclid?: string;
      gclid?:  string;
      fbc?:    string;
      fbp?:    string;
      ga_client_id?: string;
      landing_page?: string;
      // Contexto técnico
      user_agent?:   string;
    };

    if (!body.client_slug || !body.form_slug || !body.data) {
      return json({ error: "client_slug, form_slug e data são obrigatórios" }, 400);
    }

    // ── Resolve formulário ────────────────────────────────────────────────
    const { data: formResult, error: formErr } = await admin.rpc("get_form_by_slug", {
      p_client_slug: body.client_slug,
      p_form_slug:   body.form_slug,
    });

    if (formErr || !formResult || (formResult as any).error) {
      return json({ error: "Formulário não encontrado ou inativo" }, 404);
    }

    const form = formResult as unknown as FormDefinition;
    const fields: FormField[] = Array.isArray(form.fields) ? form.fields : [];

    // ── Valida campos obrigatórios (respeitando lógica condicional) ───────
    const visibleRequired = fields.filter(
      (f) => f.required && f.type !== "divider" && f.type !== "html" && fieldIsVisible(f, body.data)
    );
    const missing = visibleRequired.filter(
      (f) => !body.data[f.id] || String(body.data[f.id]).trim() === ""
    );
    if (missing.length > 0) {
      return json({
        error: "Campos obrigatórios não preenchidos",
        fields: missing.map((f) => ({ id: f.id, label: f.label })),
      }, 422);
    }

    // ── Extrai dados de contato dos campos ────────────────────────────────
    let contactEmail: string | null = null;
    let contactPhone: string | null = null;
    let contactName:  string | null = null;

    for (const field of fields) {
      const val = String(body.data[field.id] ?? "").trim();
      if (!val) continue;
      if (field.type === "email") contactEmail = val.toLowerCase();
      if (field.type === "phone") contactPhone = val;
      // Campo de texto com label contendo "nome" é o nome do contato
      if (field.type === "text" && /nome|name/i.test(field.label)) {
        contactName = val;
      }
    }

    if (!contactEmail && !contactPhone && !contactName) {
      return json({ error: "Pelo menos um campo de contato (nome, email ou telefone) deve ser preenchido" }, 422);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? req.headers.get("x-real-ip")
            ?? null;
    const userAgent = body.user_agent ?? req.headers.get("user-agent") ?? null;

    // ── Upsert contato ────────────────────────────────────────────────────
    // Tenta encontrar por email primeiro, depois phone
    let contactId: string | null = null;

    const matchConditions: string[] = [];
    if (contactEmail) matchConditions.push(`email.eq.${contactEmail}`);
    if (contactPhone) matchConditions.push(`phone.eq.${contactPhone}`);

    if (matchConditions.length > 0) {
      const { data: existing } = await admin
        .from("client_crm_contacts")
        .select("id")
        .eq("client_id", form.client_id)
        .or(matchConditions.join(","))
        .limit(1)
        .maybeSingle();

      if (existing) contactId = (existing as any).id;
    }

    if (contactId) {
      // Atualiza contato existente com dados mais recentes
      await admin
        .from("client_crm_contacts")
        .update({
          ...(contactName  ? { name: contactName }   : {}),
          ...(contactEmail ? { email: contactEmail } : {}),
          ...(contactPhone ? { phone: contactPhone, whatsapp: contactPhone } : {}),
          origin_recent:   "c8_form",
          ...(body.utm_source   ? { utm_source:   body.utm_source }   : {}),
          ...(body.utm_medium   ? { utm_medium:   body.utm_medium }   : {}),
          ...(body.utm_campaign ? { utm_campaign: body.utm_campaign } : {}),
          ...(body.utm_content  ? { utm_content:  body.utm_content }  : {}),
          ...(body.utm_term     ? { utm_term:     body.utm_term }     : {}),
          last_contact_at: new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        })
        .eq("id", contactId);
    } else {
      // Cria novo contato
      const { data: newContact, error: contactErr } = await admin
        .from("client_crm_contacts")
        .insert({
          client_id:       form.client_id,
          organization_id: form.organization_id,
          name:            contactName ?? contactEmail ?? contactPhone ?? "Lead",
          email:           contactEmail,
          phone:           contactPhone,
          whatsapp:        contactPhone,
          source:          "c8_form",
          origin_original: "c8_form",
          origin_recent:   "c8_form",
          channel:         body.utm_medium   ?? null,
          campaign:        body.utm_campaign ?? null,
          utm_source:      body.utm_source   ?? null,
          utm_medium:      body.utm_medium   ?? null,
          utm_campaign:    body.utm_campaign ?? null,
          utm_content:     body.utm_content  ?? null,
          utm_term:        body.utm_term     ?? null,
          landing_page:    body.landing_page ?? null,
          first_conversion_at: new Date().toISOString(),
          first_contact_at:    new Date().toISOString(),
          metadata: {
            form_slug:   body.form_slug,
            form_fields: body.data,
            fbclid:      body.fbclid,
            gclid:       body.gclid,
          },
        })
        .select("id")
        .single();

      if (contactErr || !newContact) {
        console.error("[lead-form-submit] Erro ao criar contato:", contactErr?.message);
        return json({ error: "Erro ao criar contato" }, 500);
      }
      contactId = (newContact as any).id;
    }

    // ── Cria deal se configurado ──────────────────────────────────────────
    let dealId: string | null = null;
    if (form.auto_create_deal && form.pipeline_stage_id && contactId) {
      const { data: newDeal } = await admin
        .from("client_crm_deals")
        .insert({
          client_id:       form.client_id,
          organization_id: form.organization_id,
          contact_id:      contactId,
          stage_id:        form.pipeline_stage_id,
          pipeline_id:     form.pipeline_id,
          title:           `Lead via ${form.title}`,
          status:          "open",
          notes:           `Origem: formulário C8 "${form.title}"\nUTM: ${body.utm_campaign ?? "—"}`,
        })
        .select("id")
        .single();

      if (newDeal) dealId = (newDeal as any).id;
    }

    // ── Chama track-conversion internamente ───────────────────────────────
    const eventId = crypto.randomUUID();
    let trackingEventId: string | null = null;

    try {
      const trackRes = await fetch(`${supabaseUrl}/functions/v1/track-conversion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          event_name:    form.trigger_event,
          client_slug:   body.client_slug,
          event_id:      eventId,
          source_url:    body.landing_page,
          utm_source:    body.utm_source,
          utm_medium:    body.utm_medium,
          utm_campaign:  body.utm_campaign,
          utm_content:   body.utm_content,
          utm_term:      body.utm_term,
          fbclid:        body.fbclid,
          gclid:         body.gclid,
          email:         contactEmail,
          phone:         contactPhone,
          first_name:    contactName?.split(" ")[0],
          last_name:     contactName?.split(" ").slice(1).join(" ") || undefined,
          fbc:           body.fbc,
          fbp:           body.fbp,
          ga_client_id:  body.ga_client_id,
          user_agent:    userAgent,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (trackRes.ok) {
        const trackData = await trackRes.json() as { tracking_id?: string };
        trackingEventId = trackData.tracking_id ?? null;
      }
    } catch (trackErr) {
      // Não bloqueia — falha silenciosa no tracking não impede o registro do lead
      console.warn("[lead-form-submit] track-conversion falhou:", String(trackErr));
    }

    // ── Registra submissão ────────────────────────────────────────────────
    const { data: submission, error: submissionErr } = await admin
      .from("client_lead_form_submissions")
      .insert({
        client_id:         form.client_id,
        organization_id:   form.organization_id,
        form_id:           form.form_id,
        contact_id:        contactId,
        deal_id:           dealId,
        tracking_event_id: trackingEventId,
        data:              body.data,
        utm_source:        body.utm_source   ?? null,
        utm_medium:        body.utm_medium   ?? null,
        utm_campaign:      body.utm_campaign ?? null,
        utm_content:       body.utm_content  ?? null,
        utm_term:          body.utm_term     ?? null,
        fbclid:            body.fbclid       ?? null,
        gclid:             body.gclid        ?? null,
        landing_page:      body.landing_page ?? null,
        ip_address:        ip,
        user_agent:        userAgent,
      })
      .select("id")
      .single();

    if (submissionErr) {
      console.error("[lead-form-submit] Erro ao inserir submissão:", submissionErr.message);
    }

    // ── Incrementa contador de submissões ─────────────────────────────────
    await admin.rpc("increment_form_submission_count", { p_form_id: form.form_id })
      .then(() => {})
      .catch(() => {});  // silencioso — denormalized counter

    return json({
      success:       true,
      contact_id:    contactId,
      submission_id: (submission as any)?.id ?? null,
      redirect_url:  form.redirect_url ?? null,
      success_message: form.success_message,
    });

  } catch (err) {
    console.error("[lead-form-submit] Erro não tratado:", err);
    return json({ error: "Erro interno", detail: String(err) }, 500);
  }
});

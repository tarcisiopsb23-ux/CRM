/**
 * Edge Function: payment-card
 *
 * Gerencia cartões salvos para cobrança recorrente.
 * Tokeniza o cartão no gateway (Asaas ou Stripe) e salva apenas o token.
 * NUNCA armazena dados sensíveis do cartão.
 *
 * Actions:
 *   save   — tokeniza e salva cartão (requer JWT do tenant)
 *   list   — lista cartões salvos do tenant
 *   delete — remove cartão salvo
 *   charge — dispara cobrança avulsa no cartão salvo
 *
 * Autenticação: JWT do usuário (Authorization: Bearer <token>)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractBearerToken, decodeJwtPayload } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = extractBearerToken(req);
  if (!token) return jsonResponse({ error: "Não autorizado" }, 401);

  const payload = decodeJwtPayload(token);
  const tenantId = payload?.tenant_id as string | null;
  const role = payload?.role as string ?? "member";

  if (!tenantId) return jsonResponse({ error: "tenant_id não encontrado no token" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "JSON inválido" }, 400); }

  const { action } = body;

  // ── list ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const { data, error } = await supabase
      .from("payment_cards")
      .select("id, gateway, last4, brand, holder_name, exp_month, exp_year, is_default, created_at")
      .eq("tenant_id", tenantId)
      .order("is_default", { ascending: false });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ cards: data ?? [] });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (action === "delete") {
    const { card_id } = body;
    if (!card_id) return jsonResponse({ error: "card_id é obrigatório" }, 400);
    const { error } = await supabase
      .from("payment_cards")
      .delete()
      .eq("id", card_id)
      .eq("tenant_id", tenantId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  // ── save — tokeniza cartão no gateway ─────────────────────────────────────
  if (action === "save") {
    const { gateway, card_number, holder_name, exp_month, exp_year, cvv, set_default } = body;

    if (!gateway || !card_number || !holder_name || !exp_month || !exp_year || !cvv) {
      return jsonResponse({ error: "Campos obrigatórios: gateway, card_number, holder_name, exp_month, exp_year, cvv" }, 400);
    }

    const last4 = String(card_number).slice(-4);
    let gatewayToken: string;
    let brand = "unknown";

    if (gateway === "asaas") {
      const asaasKey = Deno.env.get("ASAAS_API_KEY") ?? "";
      const asaasUrl = Deno.env.get("ASAAS_API_URL") ?? "https://api.asaas.com/v3";

      // Buscar ou criar customer no Asaas
      const { data: clientData } = await supabase
        .from("clients")
        .select("name, metadata")
        .eq("tenant_id", tenantId)
        .single();

      const customerRes = await fetch(`${asaasUrl}/customers?externalReference=${tenantId}`, {
        headers: { "access_token": asaasKey },
      });
      const customerData = await customerRes.json();
      let customerId = customerData.data?.[0]?.id;

      if (!customerId) {
        const createRes = await fetch(`${asaasUrl}/customers`, {
          method: "POST",
          headers: { "access_token": asaasKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientData?.name ?? "Cliente",
            externalReference: tenantId,
          }),
        });
        const created = await createRes.json();
        customerId = created.id;
      }

      // Tokenizar cartão no Asaas
      const tokenRes = await fetch(`${asaasUrl}/creditCard/tokenize`, {
        method: "POST",
        headers: { "access_token": asaasKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerId,
          creditCard: {
            holderName: holder_name,
            number: card_number,
            expiryMonth: String(exp_month).padStart(2, "0"),
            expiryYear: String(exp_year),
            ccv: cvv,
          },
          creditCardHolderInfo: { name: holder_name },
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.creditCardToken) {
        return jsonResponse({ error: tokenData.errors?.[0]?.description ?? "Erro ao tokenizar cartão" }, 400);
      }
      gatewayToken = tokenData.creditCardToken;
      brand = tokenData.creditCardBrand?.toLowerCase() ?? "unknown";

    } else if (gateway === "stripe") {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

      const params = new URLSearchParams({
        "card[number]": card_number,
        "card[exp_month]": String(exp_month),
        "card[exp_year]": String(exp_year),
        "card[cvc]": cvv,
        "card[name]": holder_name,
      });

      const tokenRes = await fetch("https://api.stripe.com/v1/tokens", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return jsonResponse({ error: tokenData.error.message }, 400);
      }
      gatewayToken = tokenData.id;
      brand = tokenData.card?.brand?.toLowerCase() ?? "unknown";

    } else {
      return jsonResponse({ error: "Gateway inválido. Use 'asaas' ou 'stripe'" }, 400);
    }

    // Se set_default, desmarcar outros cartões
    if (set_default) {
      await supabase.from("payment_cards")
        .update({ is_default: false })
        .eq("tenant_id", tenantId);
    }

    const { data: saved, error: saveErr } = await supabase
      .from("payment_cards")
      .insert({
        tenant_id:     tenantId,
        gateway,
        gateway_token: gatewayToken,
        last4,
        brand,
        holder_name,
        exp_month:     Number(exp_month),
        exp_year:      Number(exp_year),
        is_default:    set_default ?? false,
      })
      .select("id, last4, brand, is_default")
      .single();

    if (saveErr) return jsonResponse({ error: saveErr.message }, 500);
    return jsonResponse({ success: true, card: saved });
  }

  // ── charge — cobrança avulsa no cartão salvo ──────────────────────────────
  if (action === "charge") {
    const { card_id, amount, description, installments = 1 } = body;
    if (!card_id || !amount || !description) {
      return jsonResponse({ error: "card_id, amount e description são obrigatórios" }, 400);
    }

    const { data: card, error: cardErr } = await supabase
      .from("payment_cards")
      .select("*")
      .eq("id", card_id)
      .eq("tenant_id", tenantId)
      .single();

    if (cardErr || !card) return jsonResponse({ error: "Cartão não encontrado" }, 404);

    let chargeResult: any;

    if (card.gateway === "asaas") {
      const asaasKey = Deno.env.get("ASAAS_API_KEY") ?? "";
      const asaasUrl = Deno.env.get("ASAAS_API_URL") ?? "https://api.asaas.com/v3";

      const { data: clientData } = await supabase
        .from("clients").select("metadata").eq("tenant_id", tenantId).single();

      const customerRes = await fetch(`${asaasUrl}/customers?externalReference=${tenantId}`, {
        headers: { "access_token": asaasKey },
      });
      const customerData = await customerRes.json();
      const customerId = customerData.data?.[0]?.id;

      const chargeRes = await fetch(`${asaasUrl}/payments`, {
        method: "POST",
        headers: { "access_token": asaasKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: amount,
          dueDate: new Date().toISOString().split("T")[0],
          description,
          installmentCount: installments,
          creditCardToken: card.gateway_token,
          externalReference: `${tenantId}:manual`,
        }),
      });
      chargeResult = await chargeRes.json();

    } else if (card.gateway === "stripe") {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
      const params = new URLSearchParams({
        amount: String(Math.round(amount * 100)),
        currency: "brl",
        source: card.gateway_token,
        description,
        "metadata[tenant_id]": tenantId,
      });
      const chargeRes = await fetch("https://api.stripe.com/v1/charges", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      chargeResult = await chargeRes.json();
    }

    return jsonResponse({ success: true, charge: chargeResult });
  }

  return jsonResponse({ error: `action inválida: ${action}` }, 400);
});

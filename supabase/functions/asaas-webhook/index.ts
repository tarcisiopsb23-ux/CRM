/**
 * Asaas Webhook Edge Function
 * 
 * Recebe atualizações de status do Asaas e atualiza o sistema
 * Processa eventos de pagamento, confirmação, cancelamento, etc.
 */

// @ts-nocheck - Ignorar verificação de tipos para compatibilidade Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, x-asaas-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AsaasWebhookEvent {
  event: string;
  payment: {
    id: string;
    dateCreated: string;
    customer: string;
    value: number;
    billingType: string;
    status: string;
    dueDate: string;
    paymentDate?: string;
    confirmedDate?: string;
    invoiceUrl?: string;
    invoiceNumber?: string;
    externalReference?: string;
    description?: string;
    pixQrCode?: {
      encodedImage: string;
      payload: string;
      expirationDate: string;
    };
    bankSlipUrl?: string;
    creditCard?: {
      creditCardNumber: string;
      creditCardBrand: string;
      creditCardToken: string;
    };
  };
}

// Função para validar assinatura do webhook (se implementada pelo Asaas)
function validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureArray = new Uint8Array(
      signature.split('').map(c => c.charCodeAt(0))
    );

    const payloadArray = new TextEncoder().encode(payload);

    return crypto.subtle.verify("HMAC", key, signatureArray, payloadArray);
  } catch (error) {
    console.error("Erro ao validar assinatura webhook:", error);
    return false;
  }
}

// Função para processar evento do webhook
async function processWebhookEvent(
  supabase: any,
  event: AsaasWebhookEvent
): Promise<{ success: boolean; message: string }> {
  try {
    const asaasId = event.payment.id;
    const status = event.payment.status;
    const paymentDate = event.payment.paymentDate ? new Date(event.payment.paymentDate).toISOString() : null;
    const confirmedDate = event.payment.confirmedDate ? new Date(event.payment.confirmedDate).toISOString() : null;

    // Mapear status Asaas para nosso enum
    let mappedStatus: string;
    switch (status) {
      case "PENDING":
        mappedStatus = "pending";
        break;
      case "CONFIRMED":
        mappedStatus = "confirmed";
        break;
      case "RECEIVED":
        mappedStatus = "received";
        break;
      case "OVERDUE":
        mappedStatus = "overdue";
        break;
      case "CANCELED":
        mappedStatus = "canceled";
        break;
      case "REFUNDED":
        mappedStatus = "refunded";
        break;
      default:
        mappedStatus = status.toLowerCase();
    }

    // Chamar RPC para atualizar status
    const { data, error } = await supabase.rpc("handle_asaas_webhook", {
      p_asaas_id: asaasId,
      p_status: mappedStatus,
      p_payment_date: paymentDate,
      p_confirmation_date: confirmedDate,
      p_asaas_response: event
    });

    if (error) {
      console.error("Erro ao atualizar cobrança:", error);
      return { success: false, message: `Erro ao atualizar cobrança: ${error.message}` };
    }

    return { success: true, message: "Webhook processado com sucesso" };
  } catch (error) {
    console.error("Erro ao processar webhook:", error);
    return { success: false, message: `Erro ao processar webhook: ${error.message}` };
  }
}

// Função para enviar notificações
async function sendNotifications(
  supabase: any,
  event: AsaasWebhookEvent,
  chargeData: any
): Promise<void> {
  try {
    const { payment } = event;
    const { customer, billingType, status } = payment;

    // Notificação de pagamento recebido
    if (status === "RECEIVED") {
      // Enviar email para cliente
      await supabase.functions.invoke("send-payment-receipt", {
        body: {
          customerEmail: customer,
          paymentId: payment.id,
          value: payment.value,
          billingType,
          paymentDate: payment.paymentDate
        }
      });

      // Enviar notificação interna
      await supabase.functions.invoke("send-internal-notification", {
        body: {
          type: "payment_received",
          title: "Pagamento Recebido",
          message: `Pagamento de R$ ${payment.value} recebido via ${billingType}`,
          metadata: {
            asaasId: payment.id,
            customerId: customer,
            value: payment.value
          }
        }
      });
    }

    // Notificação de vencimento
    if (status === "OVERDUE") {
      await supabase.functions.invoke("send-overdue-notification", {
        body: {
          customerEmail: customer,
          paymentId: payment.id,
          value: payment.value,
          dueDate: payment.dueDate,
          billingType
        }
      });
    }

  } catch (error) {
    console.error("Erro ao enviar notificações:", error);
    // Não falhar o webhook por erro em notificações
  }
}

// Função principal
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Obter corpo do request
    const payload = await req.text();
    
    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Empty payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar assinatura (se implementada)
    const signature = req.headers.get("x-asaas-signature");
    const webhookSecret = globalThis.Deno?.env.get("ASAAS_WEBHOOK_SECRET");
    
    if (webhookSecret && signature) {
      const isValid = validateWebhookSignature(payload, signature, webhookSecret);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Parse do evento
    let event: AsaasWebhookEvent;
    try {
      event = JSON.parse(payload);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar estrutura do evento
    if (!event.event || !event.payment || !event.payment.id) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook event structure" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Conectar ao Supabase
    const supabase = createClient(
      globalThis.Deno?.env.get("SUPABASE_URL") || "",
      globalThis.Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    // Processar evento
    const result = await processWebhookEvent(supabase, event);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar notificações (async, não bloquear)
    sendNotifications(supabase, event, null).catch(console.error);

    // Log do evento para auditoria
    await supabase.rpc("log_enhanced_audit", {
      p_table_name: "asaas_charges",
      p_record_id: event.payment.id,
      p_action: "WEBHOOK_UPDATE",
      p_changes: {
        event: event.event,
        status: event.payment.status,
        paymentDate: event.payment.paymentDate,
        billingType: event.payment.billingType
      },
      p_category: "integration",
      p_severity: "medium",
      p_additional_context: {
        source: "asaas_webhook",
        event: event.event,
        asaasId: event.payment.id
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Webhook processed successfully",
        processed_at: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Asaas webhook error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        details: "Failed to process Asaas webhook"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

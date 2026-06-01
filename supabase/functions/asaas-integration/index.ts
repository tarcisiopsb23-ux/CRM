/**
 * Asaas Integration Edge Function
 * 
 * Integração com N8N para geração de cobranças Asaas
 * Processa requisições da RPC e envia para workflow N8N
 */

// @ts-nocheck - Ignorar verificação de tipos para compatibilidade Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface N8NWorkflowData {
  charge_id: string;
  asaas_id: string;
  payment_data: {
    id: string;
    description: string;
    value: number;
    due_date: string;
  };
  customer_data: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
  };
  billing_type: 'pix' | 'boleto' | 'credit_card';
  due_date: string;
  webhook_url: string;
  card_data?: any;
}

interface AsaasChargeResponse {
  success: boolean;
  charge_id: string;
  asaas_id: string;
  payment_url?: string;
  pix_qr_code?: string;
  pix_expiration_date?: string;
  boleto_url?: string;
  boleto_barcode?: string;
  boleto_expiration_date?: string;
  card_token?: string;
  error?: string;
}

// Função para chamar workflow N8N
async function callN8NWorkflow(workflowData: N8NWorkflowData): Promise<AsaasChargeResponse> {
  const n8nUrl = globalThis.Deno?.env.get("N8N_ASAAS_WORKFLOW_URL");
  const n8nApiKey = globalThis.Deno?.env.get("N8N_API_KEY");
  
  if (!n8nUrl || !n8nApiKey) {
    throw new Error("Configurações N8N não encontradas");
  }

  try {
    const response = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-API-KEY": n8nApiKey,
      },
      body: JSON.stringify({
        action: "create_charge",
        data: workflowData
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro N8N: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    // Validar resposta do N8N
    if (!result.success) {
      throw new Error(result.error || "Erro ao processar cobrança no N8N");
    }

    return result;
  } catch (error) {
    console.error("Erro ao chamar N8N:", error);
    throw error;
  }
}

// Função para atualizar cobrança no Supabase
async function updateAsaasCharge(
  supabase: any,
  chargeId: string,
  asaasResponse: AsaasChargeResponse
): Promise<void> {
  try {
    const updateData: any = {
      asaas_response: asaasResponse,
      updated_at: new Date().toISOString()
    };

    // Atualizar campos específicos por tipo de cobrança
    if (asaasResponse.payment_url) {
      updateData.payment_url = asaasResponse.payment_url;
    }
    if (asaasResponse.pix_qr_code) {
      updateData.pix_qr_code = asaasResponse.pix_qr_code;
    }
    if (asaasResponse.pix_expiration_date) {
      updateData.pix_expiration_date = asaasResponse.pix_expiration_date;
    }
    if (asaasResponse.boleto_url) {
      updateData.boleto_url = asaasResponse.boleto_url;
    }
    if (asaasResponse.boleto_barcode) {
      updateData.boleto_barcode = asaasResponse.boleto_barcode;
    }
    if (asaasResponse.boleto_expiration_date) {
      updateData.boleto_expiration_date = asaasResponse.boleto_expiration_date;
    }
    if (asaasResponse.card_token) {
      updateData.card_token = asaasResponse.card_token;
    }

    const { error } = await supabase
      .from("asaas_charges")
      .update(updateData)
      .eq("id", chargeId);

    if (error) {
      throw new Error(`Erro ao atualizar cobrança: ${error.message}`);
    }
  } catch (error) {
    console.error("Erro ao atualizar cobrança:", error);
    throw error;
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
    // Verificar autenticação
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      globalThis.Deno?.env.get("SUPABASE_URL") || "",
      globalThis.Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false } }
    );

    // Validar token JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obter dados do request
    const requestData = await req.json();
    const { action, data } = requestData;

    if (action !== "create_charge") {
      return new Response(
        JSON.stringify({ error: "Action not supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const workflowData: N8NWorkflowData = data;

    // Validar dados obrigatórios
    if (!workflowData.charge_id || !workflowData.asaas_id || !workflowData.payment_data || !workflowData.customer_data) {
      return new Response(
        JSON.stringify({ error: "Dados incompletos para geração de cobrança" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chamar workflow N8N
    const asaasResponse = await callN8NWorkflow(workflowData);

    // Atualizar cobrança no Supabase
    await updateAsaasCharge(supabase, workflowData.charge_id, asaasResponse);

    // Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        charge_id: workflowData.charge_id,
        asaas_id: workflowData.asaas_id,
        billing_type: workflowData.billing_type,
        payment_url: asaasResponse.payment_url,
        pix_qr_code: asaasResponse.pix_qr_code,
        boleto_url: asaasResponse.boleto_url,
        boleto_barcode: asaasResponse.boleto_barcode,
        card_last_digits: workflowData.card_data?.lastDigits,
        created_at: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Asaas integration error:", error);
    
    // Tentar atualizar cobrança com erro
    try {
      const supabase = createClient(
        globalThis.Deno?.env.get("SUPABASE_URL") || "",
        globalThis.Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        { auth: { persistSession: false } }
      );

      if (requestData?.data?.charge_id) {
        await supabase
          .from("asaas_charges")
          .update({
            error_message: error.message,
            retry_count: supabase.rpc('increment_retry_count', { p_charge_id: requestData.data.charge_id }),
            updated_at: new Date().toISOString()
          })
          .eq("id", requestData.data.charge_id);
      }
    } catch (updateError) {
      console.error("Erro ao atualizar cobrança com falha:", updateError);
    }

    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        details: "Falha ao processar cobrança Asaas"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

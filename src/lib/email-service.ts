import { supabase } from "@/lib/supabase";
import type { ResendConfig } from "@/types/settings";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(organizationId: string, options: SendEmailOptions) {
  // 1. Busca as configurações do Resend e n8n para a organização via RPC (Bypass RLS)
  const { data: integrations, error } = await supabase
    .rpc('get_organization_integrations_v2', { p_org_id: organizationId });

  if (error) {
    console.error("[EmailService] Erro ao buscar configurações de integração via RPC:", error);
    throw new Error("Erro ao carregar configurações de e-mail.");
  }

  const resendInteg = integrations?.find(i => i.integration_type === "resend");
  const n8nInteg = integrations?.find(i => i.integration_type === "n8n");
  
  const resendConfig = (resendInteg?.config as ResendConfig) || {};
  const n8nConfig = (n8nInteg?.config as any) || {};

  // Se não tiver Resend configurado, não podemos enviar
  if (!resendConfig.apiKey) {
    const errorMsg = `API Key do Resend não configurada para a organização: ${organizationId}. Acesse Configurações > Integrações para resolver.`;
    console.error(`[EmailService] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const fromEmail = resendConfig.fromEmail || "onboarding@resend.dev";
  const fromName = resendConfig.fromName || "Agência C8";

  try {
    // 2. Envio via Webhook do n8n (Obrigatório para evitar CORS do navegador)
    const n8nWebhookUrl = n8nConfig.notificationsWebhookUrl || n8nConfig.leadWebhookUrl;

    if (!n8nWebhookUrl) {
      console.error("[EmailService] n8n Webhook URL not configured.");
      return { 
        success: false, 
        error: "Webhook do n8n não configurado. O envio de e-mails via navegador exige um proxy n8n para evitar bloqueios de segurança (CORS)." 
      };
    }

    console.log("[EmailService] Sending via n8n proxy...");
    const response = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email_notification",
        organization_id: organizationId,
        resend_key: resendConfig.apiKey,
        from: `${fromName} <${fromEmail}>`,
        to: [options.to], // O Resend exige que o campo 'to' seja um array
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro no n8n proxy: ${response.status} - ${errText}`);
    }

    return { success: true };
  } catch (err) {
    console.error("[EmailService] Error sending email via n8n:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erro de conexão com o n8n." };
  }
}

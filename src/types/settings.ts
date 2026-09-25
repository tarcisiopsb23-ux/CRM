export type IntegrationType =
  | "api_keys"
  | "webhooks"
  | "n8n"
  | "whatsapp"
  | "google_calendar"
  | "resend"
  | "c8control"
  | "notaas"
  | "recruitment";

export interface ResendConfig {
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  value: string;
}

export interface ApiKeysConfig {
  keys?: ApiKeyItem[];
}

export interface WebhookConfig {
  url?: string;
  secret?: string;
  events?: string[];
  enabled?: boolean;
}

export interface N8nConfig {
  baseUrl?: string;
  apiKey?: string;
  webhookPath?: string;
  leadWebhookUrl?: string;
  clientWebhookUrl?: string;
  financialWebhookUrl?: string;
  asaasWebhookUrl?: string;       // Asaas → n8n (receber eventos de pagamento)
  // Cobranças por forma de pagamento — cada URL habilita a opção no cadastro de contratos
  // Para ser considerado configurado, AMBOS os webhooks (envio + retorno) devem estar preenchidos
  pixWebhookUrl?: string;          // Webhook n8n → gerar cobrança PIX (QR Code)
  pixReturnWebhookUrl?: string;    // Webhook Asaas → n8n → CRM para confirmar/atualizar status do PIX
  boletoWebhookUrl?: string;       // Webhook n8n → gerar boleto bancário
  boletoReturnWebhookUrl?: string; // Webhook Asaas → n8n → CRM para confirmar/atualizar status do boleto
  cartaoWebhookUrl?: string;       // Webhook n8n → gerar link de pagamento cartão
  cartaoReturnWebhookUrl?: string; // Webhook Asaas → n8n → CRM para confirmar/atualizar status do cartão
  marketingWebhookUrl?: string;
  notificationsWebhookUrl?: string;
  calendarWebhookUrl?: string;
  // Google Drive — criação automática de pastas
  driveFolderClientWebhookUrl?: string;
  driveFolderSupplierWebhookUrl?: string;
  driveFolderProjectWebhookUrl?: string;
  driveFolderEmployeeWebhookUrl?: string;
  // Google Drive — ações manuais (renomear, excluir, criar subpasta) e documentos (listar, upload)
  driveFolderManualWebhookUrl?: string;
  // ClickUp — integração com terceirizados
  clickupWebhookUrl?: string;       // Maestria → ClickUp (criar/atualizar/deletar tasks)
  clickupSyncWebhookUrl?: string;   // ClickUp → Maestria (polling manual — dispara o workflow de sync)
  clickupMembersWebhookUrl?: string; // Participantes ClickUp (convidar/remover)
  // Ads — sincronização de campanhas (Meta Ads + Google Ads)
  adsWebhookUrl?: string;           // Webhook n8n para sync de campanhas de todos os clientes
  adsClientId?: string;             // client_id da agência no CRM (usado para filtrar campanhas próprias no Dashboard e módulo Campanhas)
  clickupCommentsWebhookUrl?: string; // Webhook n8n para comentários ClickUp (Maestr.ia → ClickUp)
  // C8 Control — provisionamento e operações no Banco B dos clientes
  // IMPORTANTE: lidos via useN8nConfig (integration_type='n8n').
  //             Não duplicar em C8ControlConfig — o código de negócio só lê daqui.
  c8ProvisionWebhookUrl?: string;     // Webhook n8n: provisionar novo cliente (aplicar bank_b_full_schema)
  c8UpdateSchemaWebhookUrl?: string;  // Webhook n8n: atualizar schema em todos os clientes ou um específico
  c8ClientOpsWebhookUrl?: string;     // Webhook n8n: operações no banco do cliente (test, reset_password, apply_schema)
  c8SchemaRawUrl?: string;            // URL raw do bank_b_full_schema.sql no GitHub (API, não browser)
  githubToken?: string;               // GitHub Personal Access Token (read:repo) — apenas repositórios privados
}

export interface C8ControlConfig {
  // ── Aplicação (documentação / referência para variáveis de ambiente) ───────
  /** Referência visual para VITE_C8_CONTROL_URL — o código lê do env, não do banco */
  appUrl?: string;
  /** E-mail exibido no painel de suporte */
  supportEmail?: string;
  /** Referência visual para VITE_CRM_API_KEY — o código lê do env */
  crmApiKey?: string;

  // Webhooks de Agenda configurados globalmente no Maestria (Configurações → C8 Control).
  // Valem para todos os clientes — cliente configura apenas OAuth2 Google Calendar.
  /** Webhook de saída: C8 Control → n8n → Google Calendar (criar/editar/cancelar agendamentos) */
  agendaWebhookUrl?: string;
  /** Token de autenticação compartilhado (header X-Webhook-Token) */
  agendaWebhookToken?: string;
  /** Webhook: agenda-manager (editar horário, atualizar status, renovar watch channel) */
  agendaManagerWebhookUrl?: string;
  /** URL da Edge Function agenda-n8n-receiver — configure esta URL no workflow n8n de entrada */
  agendaReceiverUrl?: string;
  /** URL do workflow n8n que recebe notificações push do Google Calendar (watch channel) */
  agendaN8nGoogleWebhookUrl?: string;
  /** Webhook n8n para envio de notificações de agenda por e-mail (Resend on-behalf-of) */
  agendaEmailWebhookUrl?: string;
}

export interface WhatsAppConfig {
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
}

export interface GoogleCalendarConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  calendarId?: string;
}

export type IntegrationConfig =
  | ApiKeysConfig
  | WebhookConfig
  | N8nConfig
  | WhatsAppConfig
  | GoogleCalendarConfig
  | ResendConfig
  | C8ControlConfig
  | import("@/types/fiscal").NotaasConfig
  | import("@/types/recruitment").RecruitmentConfig;

export interface OrganizationIntegration {
  id: string;
  organization_id: string;
  integration_type: IntegrationType;
  config: IntegrationConfig;
  created_at: string;
  updated_at: string;
}

/** Masks a secret value for display (e.g. sk_****xyz9) */
export function maskSecret(value: string | undefined, visibleChars = 4): string {
  if (!value || value.length <= visibleChars) return "••••••••";
  return value.slice(0, 3) + "****" + value.slice(-visibleChars);
}

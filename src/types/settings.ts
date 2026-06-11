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
  // C8 Control — provisionamento automático do Banco B
  c8ProvisionWebhookUrl?: string;     // Webhook n8n para provisionar novo cliente C8 Control
  c8UpdateSchemaWebhookUrl?: string;  // Webhook n8n para atualizar schema (todos ou por cliente)
  c8ClientOpsWebhookUrl?: string;     // Webhook n8n para operações no banco do cliente (test, reset_password, create_user, etc.)
  c8SchemaRawUrl?: string;            // URL raw do bank_b_full_schema.sql no repositório (GitHub/GitLab)
  githubToken?: string;               // GitHub Personal Access Token para repositórios privados (read:repo)
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

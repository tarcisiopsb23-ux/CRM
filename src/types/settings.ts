export type IntegrationType =
  | "api_keys"
  | "webhooks"
  | "n8n"
  | "whatsapp"
  | "google_calendar"
  | "resend";

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
  marketingWebhookUrl?: string;
  notificationsWebhookUrl?: string;
  calendarWebhookUrl?: string;
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
  | ResendConfig;

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

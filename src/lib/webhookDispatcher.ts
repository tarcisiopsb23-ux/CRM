/**
 * webhookDispatcher.ts
 *
 * Utilitário para disparar webhooks genéricos com assinatura HMAC-SHA256.
 * Lê a configuração de webhooks da organização e envia eventos para a URL configurada.
 *
 * Assinatura: header `X-Webhook-Signature: sha256=<hex>`
 * Payload:    { event, timestamp, organization_id, data }
 */

import { supabase } from "@/lib/supabase";
import type { WebhookConfig } from "@/types/settings";

// ── Tipos de eventos suportados ──────────────────────────────────────────────

export type WebhookEventType =
  | "lead.created"
  | "lead.updated"
  | "lead.stage_changed"
  | "client.created"
  | "client.updated"
  | "client.deactivated"
  | "payment.created"
  | "payment.paid"
  | "payment.status_changed"
  | "contract.created"
  | "contract.updated"
  | "contract.suspended"
  | "contract.reactivated"
  | "contract.ended"
  | "contract.generated";

export interface WebhookEvent<T = unknown> {
  event: WebhookEventType;
  timestamp: string;
  organization_id: string;
  data: T;
}

// ── Cache em memória da config de webhook por organização ────────────────────

const configCache = new Map<string, { config: WebhookConfig; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minuto

async function getWebhookConfig(organizationId: string): Promise<WebhookConfig | null> {
  const cached = configCache.get(organizationId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const { data, error } = await supabase
    .from("organization_integrations")
    .select("config")
    .eq("organization_id", organizationId)
    .eq("integration_type", "webhooks")
    .maybeSingle();

  if (error || !data) return null;

  const config = data.config as WebhookConfig;
  configCache.set(organizationId, { config, fetchedAt: Date.now() });
  return config;
}

/** Invalida o cache de uma organização (chamar após salvar configuração) */
export function invalidateWebhookConfigCache(organizationId: string) {
  configCache.delete(organizationId);
}

// ── Geração de assinatura HMAC-SHA256 via Web Crypto API ────────────────────

async function signPayload(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(body);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hexSignature = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `sha256=${hexSignature}`;
}

// ── Dispatcher principal ─────────────────────────────────────────────────────

/**
 * Dispara um evento de webhook via Edge Function (server-side).
 * O secret HMAC nunca sai do servidor — mais seguro que assinar no browser.
 *
 * Fire-and-forget: erros são logados mas não propagados para não quebrar o fluxo principal.
 */
export async function dispatchWebhook<T = unknown>(
  organizationId: string,
  event: WebhookEventType,
  data: T
): Promise<void> {
  try {
    // Verifica rapidamente se há config antes de chamar a Edge Function
    const config = await getWebhookConfig(organizationId);
    if (!config?.url || !config.enabled) return;
    if (config.events && config.events.length > 0 && !config.events.includes(event)) return;

    // Delega o disparo (com HMAC) para a Edge Function server-side
    const { error } = await supabase.functions.invoke("dispatch-webhook", {
      body: { organization_id: organizationId, event, data },
    });

    if (error) {
      console.warn(`[Webhook] Falha ao disparar evento '${event}':`, error.message);
    }
  } catch (err) {
    // Nunca propaga erro — webhook é best-effort
    console.warn(`[Webhook] Erro ao disparar evento '${event}':`, err);
  }
}

/**
 * Versão direta (browser-side) — usa quando a Edge Function não está disponível.
 * O secret fica exposto no bundle; prefira dispatchWebhook() em produção.
 */
export async function dispatchWebhookDirect<T = unknown>(
  organizationId: string,
  event: WebhookEventType,
  data: T
): Promise<void> {
  try {
    const config = await getWebhookConfig(organizationId);
    if (!config?.url || !config.enabled) return;
    if (config.events && config.events.length > 0 && !config.events.includes(event)) return;

    const payload: WebhookEvent<T> = {
      event,
      timestamp: new Date().toISOString(),
      organization_id: organizationId,
      data,
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": event,
      "X-Webhook-Timestamp": payload.timestamp,
    };

    if (config.secret) {
      headers["X-Webhook-Signature"] = await signPayload(config.secret, body);
    }

    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[Webhook] Falha ao disparar evento '${event}': HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Webhook] Erro ao disparar evento '${event}':`, err);
  }
}

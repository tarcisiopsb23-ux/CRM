/**
 * n8nWebhook.ts
 *
 * Utilitário centralizado para disparar webhooks do n8n.
 * Fire-and-forget — nunca bloqueia o fluxo principal.
 *
 * Envia o registro completo + action + table para a URL configurada.
 */

import { supabase } from "@/lib/supabase";
import type { N8nConfig } from "@/types/settings";

// Cache simples em memória para evitar buscar a config a cada disparo
const configCache = new Map<string, { config: N8nConfig; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getN8nConfig(organizationId: string): Promise<N8nConfig | null> {
  const cached = configCache.get(organizationId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.config;
  try {
    const { data } = await supabase
      .from("organization_integrations")
      .select("config")
      .eq("organization_id", organizationId)
      .eq("integration_type", "n8n")
      .maybeSingle();
    const config = (data?.config ?? null) as N8nConfig | null;
    if (config) configCache.set(organizationId, { config, fetchedAt: Date.now() });
    return config;
  } catch {
    return null;
  }
}

export type N8nWebhookTable = "clients" | "suppliers" | "projects" | "tasks";
export type N8nWebhookAction = "create" | "update" | "delete";

/**
 * Dispara um webhook n8n com o registro completo.
 * Usa a URL configurada por tabela nas settings da organização.
 *
 * Mapeamento de URLs por tabela:
 *   clients   → clientWebhookUrl
 *   suppliers → (financialWebhookUrl como fallback, ou leadWebhookUrl — configurável)
 *   projects  → clickupWebhookUrl (projetos vão para ClickUp/n8n)
 *   tasks     → clickupWebhookUrl
 */
export async function fireN8nWebhook(
  organizationId: string,
  table: N8nWebhookTable,
  action: N8nWebhookAction,
  record: Record<string, unknown>
): Promise<void> {
  const config = await getN8nConfig(organizationId);
  if (!config) return;

  // Resolve a URL correta por tabela
  const urlMap: Record<N8nWebhookTable, string | undefined> = {
    clients:   config.clientWebhookUrl,
    suppliers: config.financialWebhookUrl, // reutiliza financeiro ou configure um dedicado
    projects:  config.clickupWebhookUrl,
    tasks:     config.clickupWebhookUrl,
  };

  const url = urlMap[table]?.trim();
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        table,
        organization_id: organizationId,
        record,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // fire-and-forget
  }
}

/** Invalida o cache de config de uma organização */
export function invalidateN8nConfigCache(organizationId: string): void {
  configCache.delete(organizationId);
}

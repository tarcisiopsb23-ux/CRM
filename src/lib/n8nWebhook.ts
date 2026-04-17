/**
 * n8nWebhook.ts
 *
 * Dispara eventos do C8 Control para o workflow n8n configurado pelo tenant.
 * Chamado quando um lead muda de status (drag-and-drop ou edição manual).
 *
 * O webhook URL e a chave de API são lidos do metadata do tenant (clients.metadata).
 * A chave é enviada no header x-api-key para autenticação no n8n.
 *
 * Falhas são silenciosas — não interrompem o fluxo do CRM.
 */

export interface N8nLeadEvent {
  event:      "lead.status_changed" | "lead.created" | "lead.closed" | "lead.deleted";
  lead_id:    string;
  lead_name:  string;
  status:     string;
  prev_status?: string;
  phone?:     string | null;
  origin?:    string | null;
  tenant_id:  string;
  timestamp:  string;
}

/**
 * Dispara um evento para o webhook n8n do tenant.
 * Fire-and-forget — erros são logados mas não propagados.
 */
export async function fireN8nWebhook(
  webhookUrl: string,
  apiKey: string,
  event: N8nLeadEvent
): Promise<void> {
  if (!webhookUrl?.trim()) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey?.trim()) {
      headers["x-api-key"] = apiKey.trim();
    }

    await fetch(webhookUrl.trim(), {
      method:  "POST",
      headers,
      body:    JSON.stringify(event),
    });
  } catch (err) {
    // Falha silenciosa — não interrompe o CRM
    console.warn("[n8n] Falha ao disparar webhook:", err);
  }
}

/** Gera uma chave de API aleatória segura (32 bytes hex) */
export function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

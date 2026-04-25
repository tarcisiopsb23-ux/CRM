import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { invalidateWebhookConfigCache } from "@/lib/webhookDispatcher";
import type { WebhookConfig } from "@/types/settings";
import type { WebhookEventType } from "@/lib/webhookDispatcher";
import { Webhook } from "lucide-react";
import { toast } from "sonner";

const ALL_EVENTS: { value: WebhookEventType; label: string }[] = [
  { value: "lead.created",           label: "Lead criado" },
  { value: "lead.updated",           label: "Lead atualizado" },
  { value: "lead.stage_changed",     label: "Lead mudou de etapa" },
  { value: "client.created",         label: "Cliente criado" },
  { value: "client.updated",         label: "Cliente atualizado" },
  { value: "client.deactivated",     label: "Cliente desativado" },
  { value: "payment.created",        label: "Pagamento criado" },
  { value: "payment.paid",           label: "Pagamento registrado como pago" },
  { value: "payment.status_changed", label: "Status de pagamento alterado" },
  { value: "contract.created",       label: "Contrato criado" },
  { value: "contract.updated",       label: "Contrato atualizado" },
  { value: "contract.suspended",     label: "Contrato suspenso" },
  { value: "contract.reactivated",   label: "Contrato reativado" },
  { value: "contract.ended",         label: "Contrato encerrado" },
];

export function WebhooksSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "webhooks");
  const raw = data as { config?: WebhookConfig } | null;
  const config = raw?.config ?? {};

  const [url, setUrl] = useState(config.url ?? "");
  const [secret, setSecret] = useState(config.secret ?? "");
  const [enabled, setEnabled] = useState(config.enabled ?? true);
  const [events, setEvents] = useState<WebhookEventType[]>(
    (config.events as WebhookEventType[]) ?? []
  );

  useEffect(() => {
    setUrl(config.url ?? "");
    setSecret(config.secret ?? "");
    setEnabled(config.enabled ?? true);
    setEvents((config.events as WebhookEventType[]) ?? []);
  }, [config.url, config.secret, config.enabled, config.events]);

  const toggleEvent = (event: WebhookEventType) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const toggleAll = () => {
    setEvents((prev) =>
      prev.length === ALL_EVENTS.length ? [] : ALL_EVENTS.map((e) => e.value)
    );
  };

  const handleSave = async () => {
    const updated: WebhookConfig = {
      ...config,
      url: url.trim() || undefined,
      secret: secret.trim() || undefined,
      enabled,
      events: events.length > 0 ? events : undefined,
    };
    await upsert.mutateAsync(updated);
    // Invalida o cache em memória do dispatcher para usar a nova config imediatamente
    if (orgId) invalidateWebhookConfigCache(orgId);
    toast.success("Configurações de webhook salvas!");
  };

  if (isLoading) {
    return (
      <SettingsSection title="Webhooks" icon={<Webhook className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Webhooks"
      description="Notifique sistemas externos quando eventos ocorrerem no CRM. A requisição é assinada com HMAC-SHA256 para validação."
      icon={<Webhook className="h-5 w-5" />}
    >
      <div className="space-y-5">
        <SettingsInput
          label="URL do Webhook"
          value={url}
          onChange={setUrl}
          placeholder="https://seu-servidor.com/webhook"
        />
        <SettingsInput
          label="Secret (para validação HMAC-SHA256)"
          value={secret}
          onChange={setSecret}
          mask
          placeholder="••••••••"
        />

        {/* Seleção de eventos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Eventos a notificar</p>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
            >
              {events.length === ALL_EVENTS.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 italic">
            Deixe vazio para receber todos os eventos.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/50">
            {ALL_EVENTS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.includes(value)}
                  onChange={() => toggleEvent(value)}
                  className="rounded border-gray-300"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Webhook ativo</span>
        </label>

        {/* Dica de validação HMAC */}
        {secret && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
            <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>Como validar no receptor:</strong> compare o header{" "}
              <code className="font-mono">X-Webhook-Signature</code> com{" "}
              <code className="font-mono">sha256=HMAC_SHA256(secret, body)</code>.
              O body é o JSON bruto da requisição.
            </p>
          </div>
        )}

        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </SettingsSection>
  );
}

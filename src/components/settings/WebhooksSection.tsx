import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import type { WebhookConfig } from "@/types/settings";

import { Webhook } from "lucide-react";

export function WebhooksSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "webhooks");
  const raw = data as { config?: WebhookConfig } | null;
  const config = raw?.config ?? {};
  const [url, setUrl] = useState(config.url ?? "");
  const [secret, setSecret] = useState(config.secret ?? "");
  const [enabled, setEnabled] = useState(config.enabled ?? true);

  useEffect(() => {
    setUrl(config.url ?? "");
    setSecret(config.secret ?? "");
    setEnabled(config.enabled ?? true);
  }, [config.url, config.secret, config.enabled]);

  const handleSave = async () => {
    const updated: WebhookConfig = {
      ...config,
      url: url.trim() || undefined,
      secret: secret.trim() || undefined,
      enabled,
    };
    await upsert.mutateAsync(updated);
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
      description="Configure URLs de webhook para receber eventos do Maestr.IA."
      icon={<Webhook className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <SettingsInput
          label="URL do Webhook"
          value={url}
          onChange={setUrl}
          placeholder="https://seu-servidor.com/webhook"
        />
        <SettingsInput
          label="Secret (para validação HMAC)"
          value={secret}
          onChange={setSecret}
          mask
          placeholder="••••••••"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Webhook ativo</span>
        </label>
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </SettingsSection>
  );
}

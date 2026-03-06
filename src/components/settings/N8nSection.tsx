import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import type { N8nConfig } from "@/types/settings";

export function N8nSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "n8n");
  const raw = data as { config?: N8nConfig } | null;
  const config = raw?.config ?? {};
  const [baseUrl, setBaseUrl] = useState(config.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(config.apiKey ?? "");
  const [webhookPath, setWebhookPath] = useState(config.webhookPath ?? "");

  useEffect(() => {
    setBaseUrl(config.baseUrl ?? "");
    setApiKey(config.apiKey ?? "");
    setWebhookPath(config.webhookPath ?? "");
  }, [config.baseUrl, config.apiKey, config.webhookPath]);

  const handleSave = async () => {
    const updated: N8nConfig = {
      baseUrl: baseUrl.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      webhookPath: webhookPath.trim() || undefined,
    };
    await upsert.mutateAsync(updated);
  };

  if (isLoading) {
    return (
      <SettingsSection title="n8n">
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="n8n"
      description="Endpoints e credenciais para integração com workflows n8n."
    >
      <div className="space-y-4">
        <SettingsInput
          label="URL Base"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://n8n.seudominio.com"
        />
        <SettingsInput
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          mask
          placeholder="••••••••"
        />
        <SettingsInput
          label="Caminho do Webhook"
          value={webhookPath}
          onChange={setWebhookPath}
          placeholder="/webhook/maestr-events"
        />
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </SettingsSection>
  );
}

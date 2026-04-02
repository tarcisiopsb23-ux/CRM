import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import type { N8nConfig } from "@/types/settings";

import { Share2, Copy, Check } from "lucide-react";

export function N8nSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "n8n");
  const raw = data as { config?: N8nConfig } | null;
  const config = raw?.config ?? {};
  
  const [baseUrl, setBaseUrl] = useState(config.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(config.apiKey ?? "");
  const [webhookPath, setWebhookPath] = useState(config.webhookPath ?? "");
  
  // Webhooks para o n8n receber dados do CRM
  const [leadWebhookUrl, setLeadWebhookUrl] = useState(config.leadWebhookUrl ?? "");
  const [clientWebhookUrl, setClientWebhookUrl] = useState(config.clientWebhookUrl ?? "");
  const [financialWebhookUrl, setFinancialWebhookUrl] = useState(config.financialWebhookUrl ?? "");
  const [marketingWebhookUrl, setMarketingWebhookUrl] = useState(config.marketingWebhookUrl ?? "");
  const [notificationsWebhookUrl, setNotificationsWebhookUrl] = useState(config.notificationsWebhookUrl ?? "");
  const [calendarWebhookUrl, setCalendarWebhookUrl] = useState(config.calendarWebhookUrl ?? "");

  const [isInitialized, setIsInitialized] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (raw && !isInitialized) {
      setBaseUrl(config.baseUrl ?? "");
      setApiKey(config.apiKey ?? "");
      setWebhookPath(config.webhookPath ?? "");
      setLeadWebhookUrl(config.leadWebhookUrl ?? "");
      setClientWebhookUrl(config.clientWebhookUrl ?? "");
      setFinancialWebhookUrl(config.financialWebhookUrl ?? "");
      setMarketingWebhookUrl(config.marketingWebhookUrl ?? "");
      setNotificationsWebhookUrl(config.notificationsWebhookUrl ?? "");
      setCalendarWebhookUrl(config.calendarWebhookUrl ?? "");
      setIsInitialized(true);
    }
  }, [config, raw, isInitialized]);

  const handleSave = async () => {
    const updated: N8nConfig = {
      baseUrl: baseUrl.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      webhookPath: webhookPath.trim() || undefined,
      leadWebhookUrl: leadWebhookUrl.trim() || undefined,
      clientWebhookUrl: clientWebhookUrl.trim() || undefined,
      financialWebhookUrl: financialWebhookUrl.trim() || undefined,
      marketingWebhookUrl: marketingWebhookUrl.trim() || undefined,
      notificationsWebhookUrl: notificationsWebhookUrl.trim() || undefined,
      calendarWebhookUrl: calendarWebhookUrl.trim() || undefined,
    };
    await upsert.mutateAsync(updated);
    toast.success("Configurações do n8n atualizadas!");
  };

  const copyOrgId = () => {
    if (!orgId) return;
    navigator.clipboard.writeText(orgId);
    setCopied(true);
    toast.success("ID da Organização copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <SettingsSection title="n8n" icon={<Share2 className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="n8n Integration"
      description="Configure as URLs de Webhook do n8n para que o CRM envie eventos e receba dados de marketing/leads."
      icon={<Share2 className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {/* Credenciais para o n8n usar */}
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Credenciais para n8n</h4>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400">ORGANIZATION ID</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border text-xs font-mono truncate">
                {orgId}
              </code>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyOrgId}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 italic">
            Use este ID no n8n para identificar sua organização ao enviar dados via API.
          </p>
        </div>

        {/* Webhooks (CRM -> n8n) */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Webhooks de Saída (CRM → n8n)</h4>
          <SettingsInput
            label="Webhook URL: Novos Leads"
            value={leadWebhookUrl}
            onChange={setLeadWebhookUrl}
            placeholder="https://n8n.dominio.com/webhook/leads"
          />
          <SettingsInput
            label="Webhook URL: Novos Clientes"
            value={clientWebhookUrl}
            onChange={setClientWebhookUrl}
            placeholder="https://n8n.dominio.com/webhook/clients"
          />
          <SettingsInput
            label="Webhook URL: Financeiro (Pagamentos)"
            value={financialWebhookUrl}
            onChange={setFinancialWebhookUrl}
            placeholder="https://n8n.dominio.com/webhook/payments"
          />
          <SettingsInput
            label="Webhook URL: Notificações de Sistema (E-mail)"
            value={notificationsWebhookUrl}
            onChange={setNotificationsWebhookUrl}
            placeholder="https://n8n.dominio.com/webhook/notifications"
          />
          <SettingsInput
            label="Webhook URL: Google Calendar (Eventos)"
            value={calendarWebhookUrl}
            onChange={setCalendarWebhookUrl}
            placeholder="https://n8n.dominio.com/webhook/calendar"
          />
        </div>

        {/* Ingestão de Dados (n8n -> CRM) */}
        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Ingestão de Dados (n8n → CRM)</h4>
          <SettingsInput
            label="Webhook URL para Métricas de Marketing"
            value={marketingWebhookUrl}
            onChange={setMarketingWebhookUrl}
            placeholder="https://n8n.dominio.com/webhook/marketing-data"
          />
          <p className="text-[10px] text-slate-400 italic">
            URL onde o n8n deve postar os resultados das campanhas para atualização automática do dashboard.
          </p>
        </div>

        <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
          {upsert.isPending ? "Salvando..." : "Salvar Configurações n8n"}
        </Button>
      </div>
    </SettingsSection>
  );
}

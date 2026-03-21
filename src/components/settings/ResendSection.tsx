import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import type { ResendConfig } from "@/types/settings";
import { Mail, ShieldCheck } from "lucide-react";

export function ResendSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "resend");
  const raw = data as { config?: ResendConfig } | null;
  const config = raw?.config ?? {};
  
  const [apiKey, setApiKey] = useState(config.apiKey ?? "");
  const [fromEmail, setFromEmail] = useState(config.fromEmail ?? "");
  const [fromName, setFromName] = useState(config.fromName ?? "");

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (raw && !isInitialized) {
      setApiKey(config.apiKey ?? "");
      setFromEmail(config.fromEmail ?? "");
      setFromName(config.fromName ?? "");
      setIsInitialized(true);
    }
  }, [config, raw, isInitialized]);

  const handleSave = async () => {
    const updated: ResendConfig = {
      apiKey: apiKey.trim() || undefined,
      fromEmail: fromEmail.trim() || undefined,
      fromName: fromName.trim() || undefined,
    };
    await upsert.mutateAsync(updated);
    toast.success("Configurações do Resend atualizadas!");
  };

  if (isLoading) {
    return (
      <SettingsSection title="Resend" icon={<Mail className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="E-mail (Resend)"
      description="Configure sua chave de API do Resend para enviar senhas temporárias e notificações para seus clientes."
      icon={<Mail className="h-5 w-5" />}
    >
      <div className="space-y-6">
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-lg flex gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            <strong>Importante:</strong> Se você estiver usando o domínio padrão do Resend (onboarding@resend.dev), você só poderá enviar e-mails para o seu próprio e-mail de cadastro. Para enviar para clientes, configure um domínio próprio no Resend.
          </p>
        </div>

        <div className="space-y-4">
          <SettingsInput
            label="API Key (re_...)"
            value={apiKey}
            onChange={setApiKey}
            placeholder="re_123456789"
            mask
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingsInput
              label="E-mail de Envio (From)"
              value={fromEmail}
              onChange={setFromEmail}
              placeholder="sua-agencia@dominio.com"
            />
            <SettingsInput
              label="Nome de Exibição"
              value={fromName}
              onChange={setFromName}
              placeholder="Sua Agência Performance"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={upsert.isPending} className="w-full">
          {upsert.isPending ? "Salvando..." : "Salvar Configurações de E-mail"}
        </Button>
      </div>
    </SettingsSection>
  );
}

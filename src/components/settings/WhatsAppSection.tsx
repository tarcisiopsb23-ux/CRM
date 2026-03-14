import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import type { WhatsAppConfig } from "@/types/settings";

import { MessageSquare } from "lucide-react";

export function WhatsAppSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "whatsapp");
  const raw = data as { config?: WhatsAppConfig } | null;
  const config = raw?.config ?? {};
  const [phoneNumberId, setPhoneNumberId] = useState(config.phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(config.wabaId ?? "");
  const [accessToken, setAccessToken] = useState(config.accessToken ?? "");

  useEffect(() => {
    setPhoneNumberId(config.phoneNumberId ?? "");
    setWabaId(config.wabaId ?? "");
    setAccessToken(config.accessToken ?? "");
  }, [config.phoneNumberId, config.wabaId, config.accessToken]);

  const handleSave = async () => {
    const updated: WhatsAppConfig = {
      phoneNumberId: phoneNumberId.trim() || undefined,
      wabaId: wabaId.trim() || undefined,
      accessToken: accessToken.trim() || undefined,
    };
    await upsert.mutateAsync(updated);
  };

  if (isLoading) {
    return (
      <SettingsSection title="WhatsApp Cloud API" icon={<MessageSquare className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="WhatsApp Cloud API"
      description="Credenciais da Meta para WhatsApp Business API."
      icon={<MessageSquare className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <SettingsInput
          label="Phone Number ID"
          value={phoneNumberId}
          onChange={setPhoneNumberId}
          placeholder="ID do número de telefone"
        />
        <SettingsInput
          label="WABA ID (WhatsApp Business Account)"
          value={wabaId}
          onChange={setWabaId}
          placeholder="ID da conta business"
        />
        <SettingsInput
          label="Access Token"
          value={accessToken}
          onChange={setAccessToken}
          mask
          placeholder="••••••••"
        />
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </SettingsSection>
  );
}

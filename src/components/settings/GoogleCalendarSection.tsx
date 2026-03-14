import { useState, useEffect } from "react";
import { SettingsSection, SettingsInput } from "./SettingsSection";
import { Button } from "@/components/ui/button";
import { useIntegration } from "@/hooks/useSettings";
import { useOrganization } from "@/hooks/useOrganization";
import type { GoogleCalendarConfig } from "@/types/settings";

import { Calendar } from "lucide-react";

export function GoogleCalendarSection() {
  const orgId = useOrganization();
  const { data, isLoading, upsert } = useIntegration(orgId, "google_calendar");
  const raw = data as { config?: GoogleCalendarConfig } | null;
  const config = raw?.config ?? {};
  const [clientId, setClientId] = useState(config.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(config.clientSecret ?? "");
  const [refreshToken, setRefreshToken] = useState(config.refreshToken ?? "");
  const [calendarId, setCalendarId] = useState(config.calendarId ?? "");

  useEffect(() => {
    setClientId(config.clientId ?? "");
    setClientSecret(config.clientSecret ?? "");
    setRefreshToken(config.refreshToken ?? "");
    setCalendarId(config.calendarId ?? "");
  }, [
    config.clientId,
    config.clientSecret,
    config.refreshToken,
    config.calendarId,
  ]);

  const handleSave = async () => {
    const updated: GoogleCalendarConfig = {
      clientId: clientId.trim() || undefined,
      clientSecret: clientSecret.trim() || undefined,
      refreshToken: refreshToken.trim() || undefined,
      calendarId: calendarId.trim() || undefined,
    };
    await upsert.mutateAsync(updated);
  };

  if (isLoading) {
    return (
      <SettingsSection title="Google Calendar" icon={<Calendar className="h-5 w-5" />}>
        <p className="text-sm text-gray-400">Carregando...</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Google Calendar"
      description="OAuth e calendário para sincronizar eventos e reuniões."
      icon={<Calendar className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <SettingsInput
          label="Client ID"
          value={clientId}
          onChange={setClientId}
          placeholder="xxx.apps.googleusercontent.com"
        />
        <SettingsInput
          label="Client Secret"
          value={clientSecret}
          onChange={setClientSecret}
          mask
          placeholder="••••••••"
        />
        <SettingsInput
          label="Refresh Token"
          value={refreshToken}
          onChange={setRefreshToken}
          mask
          placeholder="••••••••"
        />
        <SettingsInput
          label="Calendar ID"
          value={calendarId}
          onChange={setCalendarId}
          placeholder="primary ou id do calendário"
        />
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </SettingsSection>
  );
}

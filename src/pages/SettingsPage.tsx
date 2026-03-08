import {
  ApiKeysSection,
  InviteByEmailSection,
  WebhooksSection,
  N8nSection,
  WhatsAppSection,
  GoogleCalendarSection,
  PermissionsSection,
} from "@/components/settings";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Dados sensíveis são armazenados no Supabase. Apenas owner e admin podem visualizar e editar.
        </p>
      </div>
      <div className="space-y-6">
        <PermissionsSection />
        <InviteByEmailSection />
        <ApiKeysSection />
        <WebhooksSection />
        <N8nSection />
        <WhatsAppSection />
        <GoogleCalendarSection />
      </div>
    </div>
  );
}

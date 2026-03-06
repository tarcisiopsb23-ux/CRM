import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  ApiKeysSection,
  InviteByEmailSection,
  WebhooksSection,
  N8nSection,
  WhatsAppSection,
  GoogleCalendarSection,
} from "@/components/settings";
import { Settings as SettingsIcon, LogOut, ArrowLeft } from "lucide-react";

export function SettingsPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild>
                <a href="/">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </a>
              </Button>
              <SettingsIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">
                Configurações
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {profile && (
                <span className="text-sm text-muted-foreground">
                  {profile.full_name} ({profile.role})
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-1" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-muted-foreground mb-6">
          Dados sensíveis são armazenados no Supabase. Apenas owner e admin podem
          visualizar e editar.
        </p>
        <div className="space-y-6">
          <InviteByEmailSection />
          <ApiKeysSection />
          <WebhooksSection />
          <N8nSection />
          <WhatsAppSection />
          <GoogleCalendarSection />
        </div>
      </main>
    </div>
  );
}

import {
  ApiKeysSection,
  SettingsInput,
  SettingsSection,
  WebhooksSection,
  N8nSection,
  WhatsAppSection,
  GoogleCalendarSection,
  PermissionsSection,
} from "@/components/settings";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Link as LinkIcon, UserPlus, Sun, Moon, Monitor, Type, Palette } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import {
  getDriveApiFromOrganizationSettings,
  getDriveFoldersFromOrganizationSettings,
  setDriveApiInOrganizationSettings,
  setDriveFoldersInOrganizationSettings,
  useOrganizationSettings,
} from "@/hooks/useSettings";

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, setTheme, fontSize, setFontSize, sidebarColor, setSidebarColor } = useUserPreferences();
  const validTabs = useMemo(() => new Set(["permissions", "integrations", "general", "preferences"]), []);
  const tabParamRaw = searchParams.get("tab");
  const tabParam = tabParamRaw === "api" ? "integrations" : tabParamRaw;
  const tab = (tabParam && validTabs.has(tabParam) ? tabParam : "permissions") as "permissions" | "integrations" | "general" | "preferences";

  const organizationId = useOrganization();
  const orgSettings = useOrganizationSettings(organizationId);
  const driveFolders = useMemo(
    () => getDriveFoldersFromOrganizationSettings(orgSettings.data),
    [orgSettings.data]
  );
  const driveApi = useMemo(() => getDriveApiFromOrganizationSettings(orgSettings.data), [orgSettings.data]);
  const [clientsFolder, setClientsFolder] = useState(driveFolders.clients ?? "");
  const [projectsFolder, setProjectsFolder] = useState(driveFolders.projects ?? "");
  const [teamFolder, setTeamFolder] = useState(driveFolders.team ?? "");
  const [driveClientId, setDriveClientId] = useState(driveApi.clientId ?? "");
  const [driveClientSecret, setDriveClientSecret] = useState(driveApi.clientSecret ?? "");
  const [driveRefreshToken, setDriveRefreshToken] = useState(driveApi.refreshToken ?? "");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"email" | "link">("email");

  useEffect(() => {
    setClientsFolder(driveFolders.clients ?? "");
    setProjectsFolder(driveFolders.projects ?? "");
    setTeamFolder(driveFolders.team ?? "");
  }, [driveFolders.clients, driveFolders.projects, driveFolders.team]);

  useEffect(() => {
    setDriveClientId(driveApi.clientId ?? "");
    setDriveClientSecret(driveApi.clientSecret ?? "");
    setDriveRefreshToken(driveApi.refreshToken ?? "");
  }, [driveApi.clientId, driveApi.clientSecret, driveApi.refreshToken]);

  const setTab = (next: typeof tab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Dados sensíveis são armazenados no Supabase. Apenas owner e admin podem visualizar e editar.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-6">
        <TabsList className="w-full flex flex-wrap justify-start">
          <TabsTrigger value="permissions">Cargos e Permissões</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="general">Configurações gerais</TabsTrigger>
          <TabsTrigger value="preferences">Preferências e Tema</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="space-y-6">
          <PermissionsSection />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <ApiKeysSection />
          <SettingsSection
            title="Google Drive (API)"
            description="Credenciais para uso da API do Google Drive (OAuth2)."
          >
            {orgSettings.isLoading ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="space-y-4">
                <SettingsInput
                  label="Client ID"
                  value={driveClientId}
                  onChange={setDriveClientId}
                  placeholder="xxxx.apps.googleusercontent.com"
                />
                <SettingsInput
                  label="Client Secret"
                  value={driveClientSecret}
                  onChange={setDriveClientSecret}
                  mask
                  placeholder="••••••••"
                />
                <SettingsInput
                  label="Refresh Token"
                  value={driveRefreshToken}
                  onChange={setDriveRefreshToken}
                  mask
                  placeholder="••••••••"
                />
                <Button
                  onClick={async () => {
                    const nextSettings = setDriveApiInOrganizationSettings(orgSettings.data, {
                      clientId: driveClientId.trim() || null,
                      clientSecret: driveClientSecret.trim() || null,
                      refreshToken: driveRefreshToken.trim() || null,
                    });
                    await orgSettings.update.mutateAsync(nextSettings);
                  }}
                  disabled={orgSettings.update.isPending || !organizationId}
                >
                  {orgSettings.update.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            )}
          </SettingsSection>

          <WebhooksSection />
          <N8nSection />
          <WhatsAppSection />
          <GoogleCalendarSection />
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <SettingsSection
            title="Convites de Equipe"
            description="Convide novos colaboradores para sua organização."
          >
            <div className="flex flex-wrap gap-4">
              <Button 
                onClick={() => { setInviteMode("email"); setInviteOpen(true); }}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Enviar convite por e-mail
              </Button>
              <Button 
                variant="outline"
                onClick={() => { setInviteMode("link"); setInviteOpen(true); }}
                className="flex items-center gap-2"
              >
                <LinkIcon className="h-4 w-4" />
                Gerar link manualmente
              </Button>
            </div>
          </SettingsSection>
          <SettingsSection
            title="Google Drive"
            description="Defina as pastas de destino por módulo para listar e enviar documentos."
          >
            {orgSettings.isLoading ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="space-y-4">
                <SettingsInput
                  label="Clientes (link ou ID da pasta)"
                  value={clientsFolder}
                  onChange={setClientsFolder}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
                <SettingsInput
                  label="Projetos (link ou ID da pasta)"
                  value={projectsFolder}
                  onChange={setProjectsFolder}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
                <SettingsInput
                  label="Equipe (link ou ID da pasta)"
                  value={teamFolder}
                  onChange={setTeamFolder}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
                <Button
                  onClick={async () => {
                    const nextSettings = setDriveFoldersInOrganizationSettings(orgSettings.data, {
                      clients: clientsFolder.trim() || null,
                      projects: projectsFolder.trim() || null,
                      team: teamFolder.trim() || null,
                    });
                    await orgSettings.update.mutateAsync(nextSettings);
                  }}
                  disabled={orgSettings.update.isPending || !organizationId}
                >
                  {orgSettings.update.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            )}
          </SettingsSection>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <SettingsSection
            title="Aparência e Tema"
            description="Escolha como o sistema deve ser exibido."
            icon={<Palette className="h-5 w-5" />}
          >
            <div className="flex flex-wrap gap-4">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="gap-2"
              >
                <Sun className="h-4 w-4" /> Claro
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="gap-2"
              >
                <Moon className="h-4 w-4" /> Escuro
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                className="gap-2"
              >
                <Monitor className="h-4 w-4" /> Sistema
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Tamanho da Fonte"
            description="Ajuste o tamanho do texto para melhor leitura."
            icon={<Type className="h-5 w-5" />}
          >
            <div className="flex flex-wrap gap-4">
              {[
                { label: "Pequeno", value: "sm" },
                { label: "Padrão", value: "base" },
                { label: "Grande", value: "lg" },
                { label: "Extra Grande", value: "xl" },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  variant={fontSize === opt.value ? "default" : "outline"}
                  onClick={() => setFontSize(opt.value as any)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            title="Cor do Menu Lateral"
            description="Personalize a cor da barra de navegação."
            icon={<Palette className="h-5 w-5" />}
          >
            <div className="flex flex-wrap gap-4">
              {[
                { label: "Roxo (Padrão)", value: "default", color: "bg-[#2d1a4d]" },
                { label: "Índigo", value: "indigo", color: "bg-[#1e2a4d]" },
                { label: "Azul", value: "blue", color: "bg-[#1a2d4d]" },
                { label: "Ardósia", value: "slate", color: "bg-[#1e293b]" },
                { label: "Zinco", value: "zinc", color: "bg-[#27272a]" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSidebarColor(opt.value as any)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 rounded-lg border-2 transition-all",
                    sidebarColor === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted"
                  )}
                >
                  <div className={cn("w-6 h-6 rounded-full shadow-inner", opt.color)} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </SettingsSection>
        </TabsContent>
      </Tabs>
      <InviteMemberDialog 
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        initialMode={inviteMode}
      />
    </div>
  );
}

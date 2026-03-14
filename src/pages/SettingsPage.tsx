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
import { Mail, Link as LinkIcon, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import {
  getDriveApiFromOrganizationSettings,
  getDriveFoldersFromOrganizationSettings,
  setDriveApiInOrganizationSettings,
  setDriveFoldersInOrganizationSettings,
  useOrganizationSettings,
} from "@/hooks/useSettings";

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = useMemo(() => new Set(["permissions", "integrations", "general"]), []);
  const tabParamRaw = searchParams.get("tab");
  const tabParam = tabParamRaw === "api" ? "integrations" : tabParamRaw;
  const tab = (tabParam && validTabs.has(tabParam) ? tabParam : "permissions") as "permissions" | "integrations" | "general";

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
      </Tabs>
      <InviteMemberDialog 
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        initialMode={inviteMode}
      />
    </div>
  );
}

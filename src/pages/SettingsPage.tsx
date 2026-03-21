import {
  ApiKeysSection,
  SettingsInput,
  SettingsSection,
  WebhooksSection,
  N8nSection,
  WhatsAppSection,
  GoogleCalendarSection,
  ResendSection,
  PermissionsSection,
} from "@/components/settings";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Link as LinkIcon, Sun, Moon, Monitor, Type, Palette, Cloud, UserPlus, FolderOpen, ImagePlus, Loader2, Megaphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganization, useOrganizationData } from "@/hooks/useOrganization";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { usePermissionForScope } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  getDriveApiFromOrganizationSettings,
  getDriveFoldersFromOrganizationSettings,
  setDriveApiInOrganizationSettings,
  setDriveFoldersInOrganizationSettings,
  useOrganizationSettings,
} from "@/hooks/useSettings";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, setTheme, fontSize, setFontSize, sidebarColor, setSidebarColor } = useUserPreferences();
  const validTabs = useMemo(() => new Set(["permissions", "integrations", "general"]), []);
  const tabParamRaw = searchParams.get("tab");
  const tabParam = tabParamRaw === "api" ? "integrations" : tabParamRaw;
  const tab = (tabParam && validTabs.has(tabParam) ? tabParam : "permissions") as "permissions" | "integrations" | "general";

  const { canView: canViewBranding } = usePermissionForScope("settings", "general");
  const organizationId = useOrganization();
  const orgData = useOrganizationData(organizationId);
  const orgSettings = useOrganizationSettings(organizationId);
  const driveFolders = useMemo(
    () => getDriveFoldersFromOrganizationSettings(orgSettings.data),
    [orgSettings.data]
  );
  const driveApi = useMemo(() => getDriveApiFromOrganizationSettings(orgSettings.data), [orgSettings.data]);
  const [clientsFolder, setClientsFolder] = useState(driveFolders.clients ?? "");
  const [projectsFolder, setProjectsFolder] = useState(driveFolders.projects ?? "");
  const [teamFolder, setTeamFolder] = useState(driveFolders.team ?? "");
  const [suppliersFolder, setSuppliersFolder] = useState(driveFolders.suppliers ?? "");
  const [driveClientId, setDriveClientId] = useState(driveApi.clientId ?? "");
  const [driveClientSecret, setDriveClientSecret] = useState(driveApi.clientSecret ?? "");
  const [driveRefreshToken, setDriveRefreshToken] = useState(driveApi.refreshToken ?? "");

  const marketingSettings = useMemo(() => {
    const s = (orgData.data as any)?.marketing_settings as any;
    return {
      meta_ads: s?.meta_ads || { enabled: false, account_id: "" },
      google_ads: s?.google_ads || { enabled: false, account_id: "" }
    };
  }, [orgData.data]);

  const [metaEnabled, setMetaEnabled] = useState(false);
  const [metaAccountId, setMetaAccountId] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleAccountId, setGoogleAccountId] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (orgData.data && !isInitialized) {
      setMetaEnabled(marketingSettings.meta_ads.enabled);
      setMetaAccountId(marketingSettings.meta_ads.account_id || "");
      setGoogleEnabled(marketingSettings.google_ads.enabled);
      setGoogleAccountId(marketingSettings.google_ads.account_id || "");
      setIsInitialized(true);
    }
  }, [marketingSettings, orgData.data, isInitialized]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"email" | "link">("email");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const handleFileUpload = async (file: File, type: "logo" | "favicon") => {
    if (!organizationId) return;
    
    const isLogo = type === "logo";
    const setter = isLogo ? setUploadingLogo : setUploadingFavicon;
    setter(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${organizationId}/${type}-${Math.random()}.${fileExt}`;
      const filePath = `branding/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath);

      if (isLogo) {
        await orgData.update.mutateAsync({ logo_url: publicUrl });
      } else {
        const currentSettings = (orgData.data?.settings as any) || {};
        await orgData.update.mutateAsync({ 
          settings: { ...currentSettings, favicon_url: publicUrl } 
        });
      }
      toast.success(`${isLogo ? 'Logo' : 'Favicon'} atualizado com sucesso!`);
    } catch (error: any) {
      toast.error(`Erro ao fazer upload: ${error.message}`);
    } finally {
      setter(false);
    }
  };

  useEffect(() => {
    setClientsFolder(driveFolders.clients ?? "");
    setProjectsFolder(driveFolders.projects ?? "");
    setTeamFolder(driveFolders.team ?? "");
    setSuppliersFolder(driveFolders.suppliers ?? "");
  }, [driveFolders.clients, driveFolders.projects, driveFolders.team, driveFolders.suppliers]);

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
            icon={<Cloud className="h-5 w-5" />}
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

          <SettingsSection
            title="Performance de Marketing (Agência via n8n)"
            description="Configure os IDs das contas para que o n8n possa sincronizar os resultados de marketing da sua agência."
            icon={<Megaphone className="h-5 w-5" />}
          >
            {orgData.isLoading ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    <strong>Como funciona:</strong> O CRM não se conecta diretamente às APIs de anúncios. 
                    Você deve configurar um workflow no <strong>n8n</strong> que extraia os dados do Google/Meta e os envie para este CRM usando o <strong>Organization ID</strong> e os <strong>Account IDs</strong> abaixo.
                  </p>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">M</div>
                      <div>
                        <Label className="text-sm font-bold">Meta Ads</Label>
                        <p className="text-[10px] text-muted-foreground">ID da conta para o n8n filtrar</p>
                      </div>
                    </div>
                    <Switch checked={metaEnabled} onCheckedChange={setMetaEnabled} />
                  </div>
                  {metaEnabled && (
                    <SettingsInput
                      label="ID da Conta de Anúncios (act_...)"
                      value={metaAccountId}
                      onChange={setMetaAccountId}
                      placeholder="act_xxxxxxxxxxxxxxx"
                    />
                  )}
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-white font-bold text-xs">G</div>
                      <div>
                        <Label className="text-sm font-bold">Google Ads</Label>
                        <p className="text-[10px] text-muted-foreground">ID da conta para o n8n filtrar</p>
                      </div>
                    </div>
                    <Switch checked={googleEnabled} onCheckedChange={setGoogleEnabled} />
                  </div>
                  {googleEnabled && (
                    <SettingsInput
                      label="ID do Cliente (xxx-xxx-xxxx)"
                      value={googleAccountId}
                      onChange={setGoogleAccountId}
                      placeholder="xxx-xxx-xxxx"
                    />
                  )}
                </div>

                <Button
                  onClick={async () => {
                    await orgData.update.mutateAsync({
                      marketing_settings: {
                        meta_ads: { enabled: metaEnabled, account_id: metaAccountId.trim() || null },
                        google_ads: { enabled: googleEnabled, account_id: googleAccountId.trim() || null }
                      }
                    });
                    toast.success("Configurações de performance via n8n atualizadas!");
                  }}
                  disabled={orgData.update.isPending || !organizationId}
                  className="w-full"
                >
                  {orgData.update.isPending ? "Salvando..." : "Salvar Configurações de Performance"}
                </Button>
              </div>
            )}
          </SettingsSection>

          <WebhooksSection />
          <N8nSection />
          <ResendSection />
          <WhatsAppSection />
          <GoogleCalendarSection />
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          {/* Aparência (Acessível a todos) */}
          <SettingsSection
            title="Preferências de Aparência"
            description="Personalize o tema, tamanho da fonte e cor do menu."
            icon={<Palette className="h-5 w-5" />}
          >
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Sun className="h-4 w-4" /> Tema Visual
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={theme === "light" ? "default" : "outline"}
                    onClick={() => setTheme("light")}
                    size="sm"
                  >
                    Claro
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "outline"}
                    onClick={() => setTheme("dark")}
                    size="sm"
                  >
                    Escuro
                  </Button>
                  <Button
                    variant={theme === "system" ? "default" : "outline"}
                    onClick={() => setTheme("system")}
                    size="sm"
                  >
                    Sistema
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Type className="h-4 w-4" /> Tamanho da Fonte
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Pequeno", value: "sm" },
                    { label: "Padrão", value: "base" },
                    { label: "Grande", value: "lg" },
                    { label: "Extra", value: "xl" },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      variant={fontSize === opt.value ? "default" : "outline"}
                      onClick={() => setFontSize(opt.value as any)}
                      size="sm"
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Cor do Menu Lateral
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Roxo", value: "default", color: "bg-[#2d1a4d]" },
                    { label: "Índigo", value: "indigo", color: "bg-[#1e2a4d]" },
                    { label: "Azul", value: "blue", color: "bg-[#1a2d4d]" },
                    { label: "Ardósia", value: "slate", color: "bg-[#1e293b]" },
                    { label: "Zinco", value: "zinc", color: "bg-[#27272a]" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSidebarColor(opt.value as any)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all",
                        sidebarColor === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted"
                      )}
                    >
                      <div className={cn("w-4 h-4 rounded-full", opt.color)} />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Identidade Visual (Apenas Owner) */}
          {canViewBranding && (
            <SettingsSection
              title="Identidade Visual (Branding)"
              description="Personalize o logotipo e o favicon da sua organização."
              icon={<ImagePlus className="h-5 w-5" />}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Logo Upload */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Logotipo do Menu</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Exibido no topo do menu lateral.<br />
                      Formatos: **PNG, JPG, SVG**.<br />
                      Tamanho máx: **2MB**. Recomendado: **200x50px**.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center overflow-hidden">
                      {orgData.data?.logo_url ? (
                        <img src={orgData.data.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="file"
                        id="logo-upload"
                        className="hidden"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "logo");
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => document.getElementById('logo-upload')?.click()}
                      >
                        {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Cloud className="h-4 w-4 mr-2" />}
                        Alterar Logo
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Favicon Upload */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold">Favicon</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ícone exibido na aba do navegador.<br />
                      Formatos: **ICO, PNG**. <br />
                      Tamanho: **32x32px** ou **16x16px**.
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center overflow-hidden">
                      {(orgData.data?.settings as any)?.favicon_url ? (
                        <img src={(orgData.data?.settings as any).favicon_url} alt="Favicon" className="w-6 h-6 object-contain" />
                      ) : (
                        <div className="w-6 h-6 border-2 border-dashed rounded-sm" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="file"
                        id="favicon-upload"
                        className="hidden"
                        accept="image/png,image/x-icon"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, "favicon");
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadingFavicon}
                        onClick={() => document.getElementById('favicon-upload')?.click()}
                      >
                        {uploadingFavicon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Cloud className="h-4 w-4 mr-2" />}
                        Alterar Favicon
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          <SettingsSection
            title="Convites de Equipe"
            description="Convide novos colaboradores para sua organização."
            icon={<UserPlus className="h-5 w-5" />}
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
            icon={<FolderOpen className="h-5 w-5" />}
          >
            {orgSettings.isLoading ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="space-y-4">
                <SettingsInput
                  label="Pasta de Clientes (ID)"
                  value={clientsFolder}
                  onChange={setClientsFolder}
                  placeholder="ID da pasta no Google Drive"
                />
                <SettingsInput
                  label="Pasta de Projetos (ID)"
                  value={projectsFolder}
                  onChange={setProjectsFolder}
                  placeholder="ID da pasta no Google Drive"
                />
                <SettingsInput
                  label="Pasta da Equipe (ID)"
                  value={teamFolder}
                  onChange={setTeamFolder}
                  placeholder="ID da pasta no Google Drive"
                />
                <SettingsInput
                  label="Pasta de Fornecedores (ID)"
                  value={suppliersFolder}
                  onChange={setSuppliersFolder}
                  placeholder="ID da pasta no Google Drive"
                />
                <Button
                  onClick={async () => {
                    const nextSettings = setDriveFoldersInOrganizationSettings(orgSettings.data, {
                      clients: clientsFolder.trim() || null,
                      projects: projectsFolder.trim() || null,
                      team: teamFolder.trim() || null,
                      suppliers: suppliersFolder.trim() || null,
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

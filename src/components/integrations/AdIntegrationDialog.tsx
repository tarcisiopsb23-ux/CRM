import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useClientIntegrations } from "@/hooks/useHubPerformance";
import type { ClientIntegration } from "@/types/hub_performance";

interface AdIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  clientId: string;
  platform: 'meta' | 'google' | null;
  existingIntegration?: ClientIntegration;
}

export function AdIntegrationDialog({ 
  open, 
  onOpenChange, 
  organizationId, 
  clientId, 
  platform,
  existingIntegration 
}: AdIntegrationDialogProps) {
  const { upsert } = useClientIntegrations(organizationId, clientId);
  
  // Common
  const [accountId, setAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  // Meta Specific
  const [pixelId, setPixelId] = useState("");

  // Google Specific
  const [developerToken, setDeveloperToken] = useState("");
  const [clientIdOAuth, setClientIdOAuth] = useState("");
  const [clientSecretOAuth, setClientSecretOAuth] = useState("");
  const [managerId, setManagerId] = useState("");

  useEffect(() => {
    if (open && platform) {
      setAccountId(existingIntegration?.account_id || "");
      setAccessToken(existingIntegration?.access_token || "");
      setRefreshToken(existingIntegration?.refresh_token || "");
      
      // Settings
      setPixelId(existingIntegration?.settings?.pixel_id || "");
      setDeveloperToken(existingIntegration?.settings?.developer_token || "");
      setClientIdOAuth(existingIntegration?.settings?.client_id || "");
      setClientSecretOAuth(existingIntegration?.settings?.client_secret || "");
      setManagerId(existingIntegration?.settings?.manager_id || "");
    }
  }, [open, platform, existingIntegration]);

  const handleSave = async () => {
    if (!platform || !accountId.trim()) {
      toast.error("Por favor, informe o ID da conta");
      return;
    }

    if (platform === 'google' && refreshToken.trim().startsWith('ya29.')) {
      toast.error("O campo Refresh Token contém um access token (ya29...). Use o refresh token que começa com '1//'.");
      return;
    }

    try {
      const settings: Record<string, any> = { ...existingIntegration?.settings };
      
      if (platform === 'meta') {
        if (pixelId.trim()) settings.pixel_id = pixelId.trim();
      } else {
        if (developerToken.trim()) settings.developer_token = developerToken.trim();
        if (clientIdOAuth.trim()) settings.client_id = clientIdOAuth.trim();
        if (clientSecretOAuth.trim()) settings.client_secret = clientSecretOAuth.trim();
        // manager_id: salva o novo valor, preserva o existente se vazio, remove se explicitamente apagado
        settings.manager_id = managerId.trim() || (existingIntegration?.settings?.manager_id ?? null);
      }

      await upsert.mutateAsync({
        id: existingIntegration?.id,
        platform,
        account_id: accountId.trim(),
        // Google: access_token é gerado automaticamente pelo n8n via refresh_token
        access_token: platform === 'google'
          ? (existingIntegration?.access_token ?? null)
          : (accessToken.trim() || null),
        // Sempre envia refresh_token: novo valor se preenchido, existente se não preenchido, null se novo cadastro sem valor
        refresh_token: refreshToken.trim()
          ? refreshToken.trim()
          : (existingIntegration?.refresh_token ?? null),
        settings
      });
      toast.success(`Integração com ${platform === 'meta' ? 'Meta' : 'Google'} Ads salva com sucesso!`);
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao salvar integração");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            Conectar {platform === 'meta' ? 'Meta' : 'Google'} Ads
          </DialogTitle>
          <DialogDescription>
            Configure os parâmetros necessários para a sincronização de dados via API.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="account_id">
                {platform === 'meta' ? 'ID da Conta de Anúncios (act_...)' : 'ID do Cliente (Customer ID)'}
              </Label>
              <Input
                id="account_id"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder={platform === 'meta' ? "act_123456789" : "123-456-7890"}
              />
            </div>

            {platform === 'meta' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="access_token">Token de Acesso (System User)</Label>
                  <Input
                    id="access_token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAA..."
                  />
                  <p className="text-[10px] text-muted-foreground italic">Gerado no Gerenciador de Negócios da Meta.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pixel_id">ID do Pixel (Opcional)</Label>
                  <Input
                    id="pixel_id"
                    value={pixelId}
                    onChange={(e) => setPixelId(e.target.value)}
                    placeholder="123456789"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dev_token">Developer Token</Label>
                  <Input
                    id="dev_token"
                    value={developerToken}
                    onChange={(e) => setDeveloperToken(e.target.value)}
                    placeholder="Token do Google Ads API"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="client_id">OAuth Client ID</Label>
                    <Input
                      id="client_id"
                      value={clientIdOAuth}
                      onChange={(e) => setClientIdOAuth(e.target.value)}
                      placeholder="..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client_secret">OAuth Client Secret</Label>
                    <Input
                      id="client_secret"
                      type="password"
                      value={clientSecretOAuth}
                      onChange={(e) => setClientSecretOAuth(e.target.value)}
                      placeholder="..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refresh_token">Refresh Token</Label>
                  <Input
                    id="refresh_token"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="1//..."
                  />
                  {refreshToken.startsWith('ya29.') && (
                    <p className="text-[10px] text-red-500 font-bold">
                      ⚠️ Isso parece um access token (ya29...), não um refresh token. Refresh tokens começam com "1//".
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground italic">
                    Necessário para renovar o acesso automaticamente. O access token é gerado automaticamente pelo sistema a cada sincronização.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manager_id">Manager ID / MCC (Opcional)</Label>
                  <Input
                    id="manager_id"
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    placeholder="123-456-7890"
                  />
                  <p className="text-[10px] text-muted-foreground italic">
                    Preencha apenas se a conta estiver vinculada a uma conta de gerenciamento (MCC). Deixe vazio para contas diretas.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existingIntegration ? "Atualizar" : "Salvar Conexão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * OAuthIntegrations
 *
 * Cards simples de conexao OAuth para Meta Ads e Google Ads.
 * O cliente so ve botoes "Conectar" / "Desconectar" e, apos conectar,
 * campos simples para informar a conta de anuncios e o ID de propriedade GA4.
 *
 * Os App IDs e Secrets ficam EXCLUSIVAMENTE nos Secrets das Edge Functions
 * (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, META_APP_ID, META_APP_SECRET).
 * O cliente nunca precisa configurar nada tecnico.
 */

import { useState } from "react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseCrm } from "@/lib/supabase";
import { initiateGoogleOAuth, initiateMetaOAuth } from "@/lib/oauth";
import { useOAuthTokens } from "@/hooks/useOAuthTokens";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Unlink, ExternalLink } from "lucide-react";

interface Props {
  /** client_id (tenant_id) do cliente logado */
  clientId:  string | null;
  /** slug do cliente — para o redirect pos-OAuth voltar para a pagina certa */
  slug:      string;
  /** Cliente Supabase autenticado (dc). Usa supabaseCrm como fallback. */
  dbClient?: SupabaseClient | null;
}

export function OAuthIntegrations({ clientId, slug, dbClient }: Props) {
  const db = dbClient ?? supabaseCrm;
  const { googleToken, metaToken, updateConfig, disconnect } = useOAuthTokens(clientId ?? undefined, db);

  // Campos pos-conexao: ID de conta de anuncios e propriedade GA4
  const [ga4Id,          setGa4Id]          = useState(googleToken?.ga4_property_id   ?? "");
  const [gadsId,         setGadsId]         = useState(googleToken?.gads_customer_id  ?? "");
  const [metaAccountId,  setMetaAccountId]  = useState(metaToken?.meta_ad_account_id  ?? "");
  const [savingGoogle,   setSavingGoogle]   = useState(false);
  const [savingMeta,     setSavingMeta]     = useState(false);

  // Sincroniza campos quando tokens chegam
  const ga4Current   = googleToken?.ga4_property_id   ?? "";
  const gadsIdCurrent = googleToken?.gads_customer_id  ?? "";
  const metaAccCurrent = metaToken?.meta_ad_account_id ?? "";

  const googleConnected = !!googleToken;
  const metaConnected   = !!metaToken;

  // -- Handlers de conexao ----------------------------------------------------

  const handleConnectGoogle = () => {
    try {
      initiateGoogleOAuth(clientId ?? "", slug);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao iniciar conexao com Google.");
    }
  };

  const handleConnectMeta = () => {
    try {
      initiateMetaOAuth(clientId ?? "", slug);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao iniciar conexao com Meta.");
    }
  };

  const handleDisconnect = async (provider: "google" | "meta") => {
    try {
      await disconnect.mutateAsync(provider);
      toast.success(`${provider === "google" ? "Google" : "Meta"} desconectado.`);
    } catch {
      toast.error("Erro ao desconectar. Tente novamente.");
    }
  };

  // -- Handlers de configuracao pos-conexao -----------------------------------

  const handleSaveGoogle = async () => {
    setSavingGoogle(true);
    try {
      await updateConfig.mutateAsync({
        provider:         "google",
        ga4_property_id:  ga4Id.trim()   || undefined,
        gads_customer_id: gadsId.trim()  || undefined,
      });
      toast.success("Configuracao do Google salva!");
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSavingGoogle(false);
    }
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    try {
      await updateConfig.mutateAsync({
        provider:           "meta",
        meta_ad_account_id: metaAccountId.trim() || undefined,
      });
      toast.success("Configuracao do Meta salva!");
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSavingMeta(false);
    }
  };

  // -- Render -----------------------------------------------------------------

  return (
    <div className="space-y-4">

      {/* ── Meta Ads ── */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {/* Meta icon */}
              <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Meta Ads
            </CardTitle>
            {metaConnected ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" /> Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Nao conectado
              </Badge>
            )}
          </div>
          <CardDescription>
            Importa metricas de campanhas do Facebook e Instagram Ads —
            gastos, impressoes, leads e ROAS — direto no painel de Performance.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!metaConnected ? (
            /* Nao conectado: botao simples */
            <Button onClick={handleConnectMeta} className="gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Conectar com Meta
            </Button>
          ) : (
            /* Conectado: campo de conta de anuncios + desconectar */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  ID da Conta de Anuncios
                  <span className="ml-1 text-[10px] text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  value={metaAccountId}
                  onChange={(e) => setMetaAccountId(e.target.value)}
                  placeholder="act_123456789"
                  className="font-mono text-sm max-w-xs"
                  defaultValue={metaAccCurrent}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre em{" "}
                  <a
                    href="https://business.facebook.com/adsmanager"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Gerenciador de Anuncios <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {" "}→ canto superior esquerdo, formato <code className="text-xs bg-muted px-1 rounded">act_XXXXXXXXX</code>.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveMeta}
                  disabled={savingMeta}
                  className="gap-2"
                >
                  {savingMeta && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleDisconnect("meta")}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Unlink className="h-3.5 w-3.5" />
                  }
                  Desconectar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Google Ads + Analytics ── */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {/* Google icon */}
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google Ads &amp; Analytics
            </CardTitle>
            {googleConnected ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" /> Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Nao conectado
              </Badge>
            )}
          </div>
          <CardDescription>
            Importa metricas do Google Ads (cliques, gastos, conversoes) e Google Analytics 4
            (sessoes, usuarios) direto no painel de Performance.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!googleConnected ? (
            /* Nao conectado: botao simples */
            <Button
              onClick={handleConnectGoogle}
              className="bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 gap-2.5 font-medium"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Conectar com Google
            </Button>
          ) : (
            /* Conectado: campos de conta GA4 + Google Ads + desconectar */
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    ID da Propriedade GA4
                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    value={ga4Id}
                    onChange={(e) => setGa4Id(e.target.value)}
                    placeholder="properties/123456789"
                    className="font-mono text-sm"
                    defaultValue={ga4Current}
                  />
                  <p className="text-xs text-muted-foreground">
                    <a
                      href="https://analytics.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Google Analytics <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    {" "}→ Admin → Configuracoes da Propriedade → ID da Propriedade.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>
                    ID do Cliente Google Ads
                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    value={gadsId}
                    onChange={(e) => setGadsId(e.target.value)}
                    placeholder="123-456-7890"
                    className="font-mono text-sm"
                    defaultValue={gadsIdCurrent}
                  />
                  <p className="text-xs text-muted-foreground">
                    <a
                      href="https://ads.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Google Ads <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    {" "}→ numero no canto superior direito da tela.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveGoogle}
                  disabled={savingGoogle}
                  className="gap-2"
                >
                  {savingGoogle && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleDisconnect("google")}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Unlink className="h-3.5 w-3.5" />
                  }
                  Desconectar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

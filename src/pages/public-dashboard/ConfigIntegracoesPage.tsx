/**
 * ConfigIntegracoesPage — Integrações do dashboard público do cliente
 *
 * O cliente APENAS autoriza credenciais OAuth2 aqui.
 * Toda a configuração de webhooks n8n é feita no Maestria (CRM da agência).
 *
 * Seções:
 *   - Google Calendar: conectar/desconectar conta Google via OAuth2
 *   - UTM Builder: gerar links rastreáveis
 */

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Link2, Copy, ExternalLink, Calendar, CheckCircle2, Loader2,
  Unlink, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

export function ConfigIntegracoesPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const agendaEnabled = auth?.modules_config?.agenda_enabled === true;

  // ── Google Calendar OAuth2 ───────────────────────────────────────────────────
  const {
    status: gcStatus,
    isLoading: gcLoading,
    oauthPending,
    connect,
    disconnect,
  } = useGoogleCalendar();

  // ── UTM Builder ─────────────────────────────────────────────────────────────
  const [utmBase, setUtmBase]         = useState("");
  const [utmSource, setUtmSource]     = useState("");
  const [utmMedium, setUtmMedium]     = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent]   = useState("");
  const [utmCopied, setUtmCopied]     = useState(false);

  if (!dc) return <CredentialsErrorState />;

  const utmUrl = (() => {
    if (!utmBase.trim()) return "";
    try {
      const base = utmBase.trim().startsWith("http")
        ? utmBase.trim()
        : `https://${utmBase.trim()}`;
      const url = new URL(base);
      if (utmSource)   url.searchParams.set("utm_source",   utmSource);
      if (utmMedium)   url.searchParams.set("utm_medium",   utmMedium);
      if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);
      if (utmContent)  url.searchParams.set("utm_content",  utmContent);
      return url.toString();
    } catch { return ""; }
  })();

  const copyUtm = () => {
    if (!utmUrl) return;
    navigator.clipboard.writeText(utmUrl);
    setUtmCopied(true);
    toast.success("Link UTM copiado!");
    setTimeout(() => setUtmCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Integrações"
        description="Autorize o acesso às suas ferramentas externas."
      />

      {/* ── Google Calendar ── */}
      {agendaEnabled && (
        <Card className="card-surface">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Google Calendar
            </CardTitle>
            <CardDescription>
              Autorize o acesso à sua conta Google para sincronizar agendamentos
              automaticamente com o Google Calendar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gcLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão...
              </div>
            ) : gcStatus.connected ? (
              /* ── Conectado ── */
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      Conta Google autorizada
                    </p>
                    {gcStatus.calendar_name && (
                      <p className="text-xs text-muted-foreground truncate">
                        Calendário: <strong className="text-foreground">
                          {gcStatus.calendar_name}
                        </strong>
                      </p>
                    )}
                    {gcStatus.connected_at && (
                      <p className="text-xs text-muted-foreground">
                        Autorizado em{" "}
                        {format(parseISO(gcStatus.connected_at), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className="text-emerald-400 border-emerald-500/30 text-[10px] shrink-0"
                  >
                    Ativo
                  </Badge>
                </div>

                {/* Aviso de expiração do watch channel */}
                {gcStatus.watch_expiry && (() => {
                  const expiresAt  = new Date(gcStatus.watch_expiry);
                  const hoursLeft  = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
                  if (hoursLeft > 24) return null;
                  return (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-400">
                        A sincronização automática expira em breve. A renovação é feita
                        automaticamente pela agência — nenhuma ação necessária.
                      </p>
                    </div>
                  );
                })()}

                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-2"
                  disabled={disconnect.isPending}
                  onClick={async () => {
                    try {
                      await disconnect.mutateAsync();
                      toast.success("Google Calendar desconectado.");
                    } catch {
                      toast.error("Erro ao desconectar. Tente novamente.");
                    }
                  }}
                >
                  {disconnect.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Unlink className="h-4 w-4" />
                  }
                  Revogar autorização
                </Button>
              </div>
            ) : (
              /* ── Não conectado ── */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Nenhuma conta Google autorizada. Clique em conectar e faça login
                  com a conta Google do calendário que deseja sincronizar.
                </p>

                <Button
                  onClick={connect}
                  disabled={oauthPending}
                  className="bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 gap-2.5 font-medium"
                >
                  {oauthPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Aguardando autorização...
                    </>
                  ) : (
                    <>
                      {/* Ícone Google */}
                      <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Conectar com Google
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground">
                  Uma janela de autorização será aberta. Permita popups para este site
                  se necessário. A sincronização é gerenciada pela agência — você só
                  precisa autorizar o acesso uma vez.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── UTM Builder ── */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> UTM Builder
          </CardTitle>
          <CardDescription>
            Gere links com parâmetros UTM para rastrear origens de tráfego.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>URL Base <span className="text-destructive">*</span></Label>
            <Input
              value={utmBase}
              onChange={e => setUtmBase(e.target.value)}
              placeholder="https://seusite.com/pagina"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Source (utm_source)",     value: utmSource,   set: setUtmSource,   placeholder: "google, instagram, email" },
              { label: "Medium (utm_medium)",     value: utmMedium,   set: setUtmMedium,   placeholder: "cpc, organic, email" },
              { label: "Campaign (utm_campaign)", value: utmCampaign, set: setUtmCampaign, placeholder: "nome-da-campanha" },
              { label: "Content (utm_content)",   value: utmContent,  set: setUtmContent,  placeholder: "banner-topo" },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="grid gap-2">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder={placeholder}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
          {utmUrl && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Link gerado</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 min-w-0 overflow-hidden">
                <span className="text-xs font-mono flex-1 break-all text-foreground">
                  {utmUrl}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={copyUtm}
                  className="border-border gap-2"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {utmCopied ? "Copiado!" : "Copiar"}
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => window.open(utmUrl, "_blank", "noopener")}
                  className="border-border gap-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Testar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ConfigIntegracoesPage
import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Link2, Copy, ExternalLink, Calendar, CheckCircle2, Loader2,
  Unlink, AlertCircle, Radio, Tag, Save, Eye, FlaskConical, Zap,
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
import { supabase } from "@/lib/supabase";
import { OAuthIntegrations } from "@/components/integrations/OAuthIntegrations";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

// ─── Subcomponente: StatusBadge ────────────────────────────────────────────────
function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
      <CheckCircle2 className="h-2.5 w-2.5" /> Configurado
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground text-[10px]">
      Não configurado
    </Badge>
  );
}

// UUID all-zeros é inválido — nunca deve ser usado em queries reais
const PLACEHOLDER_UUIDS = [
  "00000000-0000-0000-0000-000000000000",
];
const isValidClientId = (id?: string) => !!id && !PLACEHOLDER_UUIDS.includes(id);

export function ConfigIntegracoesPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const agendaEnabled = auth?.modules_config?.agenda_enabled === true;
  const clientId = (auth?.user as any)?.client_id as string | undefined;

  // ── Google Calendar OAuth2 ───────────────────────────────────────────────────
  const {
    status: gcStatus,
    isLoading: gcLoading,
    oauthPending,
    connect,
    disconnect,
  } = useGoogleCalendar();

  // ── Pixels de rastreamento — estado local dos campos ────────────────────────
  const [metaPixelId,    setMetaPixelId]    = useState("");
  const [gtmContainerId, setGtmContainerId] = useState("");
  const [ga4MeasId,      setGa4MeasId]      = useState("");
  const [ga4ApiSecret,   setGa4ApiSecret]   = useState("");
  const [savingMeta,     setSavingMeta]     = useState(false);
  const [savingGtm,      setSavingGtm]      = useState(false);
  const [savingGa4,      setSavingGa4]      = useState(false);

  // Carrega configurações atuais de pixel
  // Usa dc (autenticado) — as views têm security_invoker e bloqueiam anon
  const { data: aiSettingsData } = useQuery({
    queryKey: ["client_ai_settings_safe", clientId],
    queryFn: async () => {
      if (!isValidClientId(clientId) || !dc) return null;
      const { data } = await dc
        .from("client_ai_settings_safe")
        .select("meta_pixel_id, google_tag_id")
        .eq("client_id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: isValidClientId(clientId) && !!dc,
    staleTime: 60_000,
  });

  const { data: gtmSettingsData } = useQuery({
    queryKey: ["client_gtm_settings_safe", clientId],
    queryFn: async () => {
      if (!isValidClientId(clientId) || !dc) return null;
      const { data } = await dc
        .from("client_gtm_settings_safe")
        .select("gtm_container_id, ga4_measurement_id, ga4_api_secret_set, meta_capi_token_set")
        .eq("client_id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: isValidClientId(clientId) && !!dc,
    staleTime: 60_000,
  });

  // Preenche campos quando dados chegam
  useEffect(() => {
    if (aiSettingsData) {
      setMetaPixelId((aiSettingsData as any).meta_pixel_id ?? "");
    }
  }, [aiSettingsData]);

  useEffect(() => {
    if (gtmSettingsData) {
      setGtmContainerId((gtmSettingsData as any).gtm_container_id ?? "");
      setGa4MeasId((gtmSettingsData as any).ga4_measurement_id ?? "");
    }
  }, [gtmSettingsData]);

  // Salva Meta Pixel ID em client_ai_settings via RPC (requer auth)
  const saveMetaPixel = async () => {
    if (!isValidClientId(clientId)) {
      console.warn("[saveMetaPixel] clientId inválido:", clientId);
      toast.error("ID do cliente não identificado. Recarregue a página.");
      return;
    }
    if (!dc) {
      console.warn("[saveMetaPixel] dc é null — sessão não disponível");
      toast.error("Sessão não iniciada. Aguarde ou recarregue a página.");
      return;
    }
    console.log("[saveMetaPixel] iniciando — clientId:", clientId, "dc disponível:", !!dc);
    const organizationId = auth?.organization_id as string | undefined;
    setSavingMeta(true);
    try {
      // Verifica se já existe registro para este cliente
      const { data: existing } = await dc
        .from("client_ai_settings")
        .select("id")
        .eq("client_id", clientId)
        .maybeSingle();

      let error;
      if (existing?.id) {
        // Atualiza registro existente
        ({ error } = await dc
          .from("client_ai_settings")
          .update({ meta_pixel_id: metaPixelId.trim() || null })
          .eq("id", existing.id));
      } else {
        // Cria novo registro com os campos mínimos necessários
        ({ error } = await dc
          .from("client_ai_settings")
          .insert({
            client_id: clientId,
            organization_id: organizationId,
            meta_pixel_id: metaPixelId.trim() || null,
          }));
      }
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client_ai_settings_safe", clientId] });
      toast.success("Meta Pixel ID salvo!");
    } catch (e: any) {
      console.error("[saveMetaPixel]", e);
      toast.error(e?.message ?? "Erro ao salvar. Tente novamente.");
    } finally {
      setSavingMeta(false);
    }
  };

  // Salva apenas GTM container ID
  const saveGtmOnly = async () => {
    if (!isValidClientId(clientId)) {
      console.warn("[saveGtmOnly] clientId inválido:", clientId);
      toast.error("ID do cliente não identificado. Recarregue a página.");
      return;
    }
    if (!dc) {
      console.warn("[saveGtmOnly] dc é null — sessão não disponível");
      toast.error("Sessão não iniciada. Aguarde ou recarregue a página.");
      return;
    }
    console.log("[saveGtmOnly] iniciando — clientId:", clientId);
    const organizationId = auth?.organization_id as string | undefined;
    setSavingGtm(true);
    try {
      const { error } = await dc.rpc("save_gtm_settings", {
        p_client_id:           clientId,
        p_organization_id:     organizationId ?? null,
        p_gtm_container_id:    gtmContainerId.trim() || null,
        p_ga4_measurement_id:  null,
        p_ga4_api_secret:      null,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client_gtm_settings_safe", clientId] });
      toast.success("Google Tag Manager salvo!");
    } catch (e: any) {
      console.error("[saveGtmOnly]", e);
      toast.error(e?.message ?? "Erro ao salvar. Tente novamente.");
    } finally {
      setSavingGtm(false);
    }
  };
  const saveGtmSettings = async () => {
    if (!isValidClientId(clientId)) return;
    if (!dc) { toast.error("Sessão não iniciada. Aguarde ou recarregue a página."); return; }
    const organizationId = auth?.organization_id as string | undefined;
    setSavingGa4(true);
    try {
      const { error } = await dc.rpc("save_gtm_settings", {
        p_client_id:           clientId,
        p_organization_id:     organizationId ?? null,
        p_gtm_container_id:    null,
        p_ga4_measurement_id:  ga4MeasId.trim()    || null,
        p_ga4_api_secret:      ga4ApiSecret.trim() || null,
      });
      if (error) throw error;
      setGa4ApiSecret("");
      queryClient.invalidateQueries({ queryKey: ["client_gtm_settings_safe", clientId] });
      toast.success("Google Analytics 4 salvo!");
    } catch (e: any) {
      console.error("[saveGtmSettings]", e);
      toast.error(e?.message ?? "Erro ao salvar. Tente novamente.");
    } finally {
      setSavingGa4(false);
    }
  };

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

  const metaConfigured = !!((aiSettingsData as any)?.meta_pixel_id);
  const gtmConfigured  = !!((gtmSettingsData as any)?.gtm_container_id);
  const ga4Configured  = !!((gtmSettingsData as any)?.ga4_measurement_id);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Integrações"
        description="Configure rastreamento, conecte ferramentas e gere links UTM."
      />

      {/* ══════════════════════════════════════════════════════════════════════
          SEÇÃO: RASTREAMENTO
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          Rastreamento e Conversões
        </h2>
        <p className="text-xs text-muted-foreground">
          Configure os pixels de rastreamento. Os eventos capturados são enviados automaticamente
          tanto via browser-side quanto via API server-side para maior precisão.
        </p>
      </div>

      {/* ── Meta Pixel ── */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {/* Meta icon */}
              <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
              </svg>
              Meta Pixel
            </CardTitle>
            <StatusBadge configured={metaConfigured} />
          </div>
          <CardDescription>
            Rastreia conversões e otimiza campanhas no Meta Ads (Facebook/Instagram).
            Cole o ID numérico do seu pixel (ex: <code className="text-xs bg-muted px-1 rounded">1234567890123456</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pixel ID</Label>
            <div className="flex gap-2">
              <Input
                value={metaPixelId}
                onChange={(e) => setMetaPixelId(e.target.value)}
                placeholder="1234567890123456"
                className="font-mono text-sm max-w-xs"
              />
              <Button
                onClick={saveMetaPixel}
                disabled={savingMeta || !isValidClientId(clientId)}
                size="sm"
                className="gap-2 shrink-0"
                title={!isValidClientId(clientId) ? "Recarregue a pagina" : undefined}
              >
                {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre em Meta Business Suite → Gerenciador de Eventos → seu Pixel → Configurações.
            </p>
          </div>
          {metaConfigured && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm" variant="outline"
                className="gap-2 text-xs border-border"
                onClick={() => window.open("https://business.facebook.com/events_manager", "_blank", "noopener")}
              >
                <ExternalLink className="h-3 w-3" /> Verificar no Events Manager
              </Button>
              <Button
                size="sm" variant="outline"
                className="gap-2 text-xs border-border"
                onClick={() => navigate(`/${slug}/configuracoes/integracoes/testes`)}
              >
                <FlaskConical className="h-3 w-3" /> Testar eventos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Google Tag Manager ── */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-orange-400" />
              Google Tag Manager
            </CardTitle>
            <StatusBadge configured={gtmConfigured} />
          </div>
          <CardDescription>
            Gerencia todas as suas tags Google (GA4, Ads, etc.) a partir de um container central.
            Cole o ID do container GTM (ex: <code className="text-xs bg-muted px-1 rounded">GTM-XXXXXXX</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Container ID</Label>
            <div className="flex gap-2">
              <Input
                value={gtmContainerId}
                onChange={(e) => setGtmContainerId(e.target.value)}
                placeholder="GTM-XXXXXXX"
                className="font-mono text-sm max-w-xs"
              />
              <Button
                onClick={saveGtmOnly}
                disabled={savingGtm || !isValidClientId(clientId)}
                size="sm"
                className="gap-2 shrink-0"
                title={!isValidClientId(clientId) ? "Recarregue a pagina" : undefined}
              >
                {savingGtm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre em tagmanager.google.com → seu container → Admin → ID do container.
            </p>
          </div>
          {gtmConfigured && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm" variant="outline"
                className="gap-2 text-xs border-border"
                onClick={() => window.open("https://tagassistant.google.com/", "_blank", "noopener")}
              >
                <ExternalLink className="h-3 w-3" /> Google Tag Assistant
              </Button>
              <Button
                size="sm" variant="outline"
                className="gap-2 text-xs border-border"
                onClick={() => navigate(`/${slug}/configuracoes/integracoes/testes`)}
              >
                <FlaskConical className="h-3 w-3" /> Testar eventos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Google Analytics 4 ── */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <svg className="h-4 w-4 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.5 18.75a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1 0-1.5H20V5.25a.75.75 0 0 1 1.5 0v13.5Z"/>
                <path d="M3.5 3.75A.75.75 0 0 0 2.75 3 .75.75 0 0 0 2 3.75v16.5a.75.75 0 0 0 1.5 0V3.75ZM7.75 10.5a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6ZM12.5 8.25a.75.75 0 0 0-1.5 0v8.25a.75.75 0 0 0 1.5 0V8.25ZM17.25 6a.75.75 0 0 0-1.5 0v10.5a.75.75 0 0 0 1.5 0V6Z"/>
              </svg>
              Google Analytics 4
            </CardTitle>
            <StatusBadge configured={ga4Configured} />
          </div>
          <CardDescription>
            Rastreia visitas e eventos diretamente via GA4. Use quando <strong>não</strong> tiver GTM
            — ou preencha apenas o API Secret para ativar o envio server-side de conversões.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Measurement ID</Label>
              <Input
                value={ga4MeasId}
                onChange={(e) => setGa4MeasId(e.target.value)}
                placeholder="G-XXXXXXXXXX"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                GA4 → Admin → Data Streams → seu stream → Measurement ID.
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                API Secret
                <span className="ml-1 text-[10px] text-muted-foreground font-normal">(Measurement Protocol)</span>
              </Label>
              <Input
                value={ga4ApiSecret}
                onChange={(e) => setGa4ApiSecret(e.target.value)}
                placeholder={
                  (gtmSettingsData as any)?.ga4_api_secret_set
                    ? "••••••••••••••• (salvo)"
                    : "Cole o API Secret aqui"
                }
                type="password"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                GA4 → Admin → Data Streams → seu stream → Measurement Protocol API secrets.
              </p>
            </div>
          </div>
          {gtmContainerId.trim() && ga4MeasId.trim() && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">
                Com o GTM ativo, o GA4 browser-side já é gerenciado por lá.
                O Measurement ID aqui é usado apenas para o envio server-side (API Secret).
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={saveGtmSettings}
              disabled={savingGa4}
              size="sm"
              className="gap-2"
            >
              {savingGa4 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar GA4
            </Button>
            {ga4Configured && (
              <Button
                size="sm" variant="outline"
                className="gap-2 text-xs border-border"
                onClick={() => navigate(`/${slug}/configuracoes/integracoes/testes`)}
              >
                <FlaskConical className="h-3 w-3" /> Testar eventos
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Atalho: Página de Teste ── */}
      {(metaConfigured || gtmConfigured || ga4Configured) && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/10 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              Testar pixels configurados
            </p>
            <p className="text-xs text-muted-foreground">
              Dispare eventos de teste e veja o log em tempo real.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate(`/${slug}/configuracoes/integracoes/testes`)}
            className="gap-2 shrink-0"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Abrir testes
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SEÇÃO: AUTOMAÇÕES — CONEXÕES OAUTH PARA MÉTRICAS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Automações e Métricas de Campanhas
        </h2>
        <p className="text-xs text-muted-foreground">
          Conecte suas contas de anúncios para importar métricas de campanhas automaticamente
          na aba Performance.
        </p>
      </div>
      <OAuthIntegrations
        clientId={isValidClientId(clientId) ? clientId! : null}
        slug={slug!}
        dbClient={dc}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          SEÇÃO: GOOGLE CALENDAR
      ══════════════════════════════════════════════════════════════════════ */}
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
                  se necessário.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SEÇÃO: UTM BUILDER
      ══════════════════════════════════════════════════════════════════════ */}
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


// TrackingTestPage - /:slug/configuracoes/integracoes/testes
//
// Permite testar os pixels configurados (Meta Pixel + GTM + GA4) disparando
// eventos manualmente via browser-side e server-side.

import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FlaskConical, CheckCircle2, XCircle, Clock, ExternalLink,
  ChevronLeft, Loader2, RefreshCw, Zap, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { trackServerSide, type TrackEventName } from "@/hooks/useTrackingPixel";
import { PageHeader } from "./components/PageHeader";

// --- Tipos ------------------------------------------------------------------

interface TrackingEvent {
  id:              string;
  event_name:      string;
  meta_status:     "sent" | "error" | "skipped" | "pending";
  google_status:   "sent" | "error" | "skipped" | "pending";
  meta_response:   unknown;
  google_response: unknown;
  utm_campaign:    string | null;
  device:          string | null;
  browser:         string | null;
  city:            string | null;
  source_url:      string | null;
  created_at:      string;
}

// --- Subcomponentes ---------------------------------------------------------

function PlatformStatusBadge({ status }: { status: string | null }) {
  if (!status || status === "skipped") {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground">-</Badge>;
  }
  if (status === "sent") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
        <CheckCircle2 className="h-2.5 w-2.5" /> Enviado
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30 gap-1">
        <Clock className="h-2.5 w-2.5" /> Pendente
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 gap-1">
      <XCircle className="h-2.5 w-2.5" /> Erro
    </Badge>
  );
}

function PixelStatusCard({
  icon,
  title,
  value,
  configured,
  externalUrl,
  externalLabel,
}: {
  icon:          React.ReactNode;
  title:         string;
  value?:        string | null;
  configured:    boolean;
  externalUrl?:  string;
  externalLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/10 px-4 py-3">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {configured && value ? (
          <p className="text-xs font-mono text-muted-foreground truncate">{value}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Nao configurado</p>
        )}
      </div>
      {configured ? (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] shrink-0">
          <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Ativo
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
          Inativo
        </Badge>
      )}
      {configured && externalUrl && (
        <Button
          size="sm" variant="ghost"
          className="h-7 px-2 text-xs gap-1 shrink-0"
          onClick={() => window.open(externalUrl, "_blank", "noopener")}
        >
          <ExternalLink className="h-3 w-3" />
          {externalLabel}
        </Button>
      )}
    </div>
  );
}

// --- Eventos de teste disponiveis -------------------------------------------

const TEST_EVENTS: { name: TrackEventName; label: string; color: string }[] = [
  { name: "PageView",             label: "PageView",              color: "text-blue-400" },
  { name: "Lead",                 label: "Lead",                  color: "text-emerald-400" },
  { name: "Contact",              label: "Contact",               color: "text-violet-400" },
  { name: "Schedule",             label: "Schedule",              color: "text-amber-400" },
  { name: "Purchase",             label: "Purchase",              color: "text-pink-400" },
  { name: "CompleteRegistration", label: "CompleteRegistration",  color: "text-cyan-400" },
  { name: "ViewContent",          label: "ViewContent",           color: "text-orange-400" },
];

// --- Pagina principal --------------------------------------------------------

export function TrackingTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { auth } = useClientAuth();
  const dc = useDynamicClient();
  const clientId = (auth?.user as any)?.client_id as string | undefined;

  // Guard: só bloqueia UUID all-zeros (genuinamente inválido)
  const validClientId = !!clientId && clientId !== "00000000-0000-0000-0000-000000000000";

  const [firing, setFiring] = useState<string | null>(null);

  // Carrega config de pixels — usa dc (autenticado) pois views têm security_invoker
  const { data: aiSettings } = useQuery({
    queryKey: ["client_ai_settings_safe", clientId],
    queryFn: async () => {
      if (!validClientId || !dc) return null;
      const { data } = await dc
        .from("client_ai_settings_safe")
        .select("meta_pixel_id, google_tag_id")
        .eq("client_id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: validClientId && !!dc,
    staleTime: 60_000,
  });

  const { data: gtmSettings } = useQuery({
    queryKey: ["client_gtm_settings_safe", clientId],
    queryFn: async () => {
      if (!validClientId || !dc) return null;
      const { data } = await dc
        .from("client_gtm_settings_safe")
        .select("gtm_container_id, ga4_measurement_id, ga4_api_secret_set")
        .eq("client_id", clientId)
        .maybeSingle();
      return data;
    },
    enabled: validClientId && !!dc,
    staleTime: 60_000,
  });

  // Carrega historico de eventos
  const { data: events, isLoading: eventsLoading, refetch } = useQuery({
    queryKey: ["tracking_events", clientId],
    queryFn: async () => {
      if (!validClientId || !dc) return [];
      const { data, error } = await dc
        .from("client_tracking_events")
        .select(
          "id, event_name, meta_status, google_status, meta_response, google_response, " +
          "utm_campaign, device, browser, city, source_url, created_at"
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return [];
      return (data ?? []) as TrackingEvent[];
    },
    enabled: validClientId && !!dc,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // Dispara evento de teste
  const fireTestEvent = useCallback(async (eventName: TrackEventName) => {
    if (!slug) return;
    setFiring(eventName);
    try {
      await trackServerSide(slug, eventName, {
        email:           "teste@c8control.com.br",
        phone:           "11999999999",
        first_name:      "Teste",
        last_name:       "C8",
        test_event_code: "TEST",
        custom_data:     { test: true, fired_from: "tracking_test_page" },
      });
      toast.success(`Evento "${eventName}" disparado!`, {
        description: "Verifique o log abaixo e o Meta Events Manager.",
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["tracking_events", clientId] });
      }, 2000);
    } catch {
      toast.error(`Falha ao disparar "${eventName}"`);
    } finally {
      setFiring(null);
    }
  }, [slug, clientId, queryClient]);

  const metaPixelId    = (aiSettings  as any)?.meta_pixel_id     ?? null;
  const gtmContainerId = (gtmSettings as any)?.gtm_container_id  ?? null;
  const ga4MeasId      = (gtmSettings as any)?.ga4_measurement_id ?? null;
  const ga4SecretSet   = (gtmSettings as any)?.ga4_api_secret_set ?? false;
  const anyConfigured  = !!(metaPixelId || gtmContainerId || ga4MeasId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
        >
          <ChevronLeft className="h-4 w-4" /> Integracoes
        </Button>
      </div>

      <PageHeader
        title="Teste de Eventos"
        description="Dispare eventos de teste para validar a configuracao do seu pixel e tags."
        action={
          slug ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-border"
              onClick={() => window.open(`/pixel-test/${slug}`, "_blank", "noopener")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir página pública de teste
            </Button>
          ) : undefined
        }
      />

      {/* Status dos pixels */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Status dos Pixels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <PixelStatusCard
            icon={
              <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
              </svg>
            }
            title="Meta Pixel"
            value={metaPixelId}
            configured={!!metaPixelId}
            externalUrl="https://business.facebook.com/events_manager"
            externalLabel="Events Manager"
          />
          <PixelStatusCard
            icon={<span className="text-sm font-bold text-orange-400">G</span>}
            title="Google Tag Manager"
            value={gtmContainerId}
            configured={!!gtmContainerId}
            externalUrl="https://tagassistant.google.com/"
            externalLabel="Tag Assistant"
          />
          <PixelStatusCard
            icon={<span className="text-sm font-bold text-yellow-400">GA</span>}
            title={`Google Analytics 4${ga4SecretSet ? " (API Secret configurado)" : ""}`}
            value={ga4MeasId}
            configured={!!ga4MeasId}
            externalUrl={ga4MeasId ? "https://analytics.google.com/" : undefined}
            externalLabel="Google Analytics"
          />
        </CardContent>
      </Card>

      {/* Botoes de teste */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Disparar Evento de Teste
          </CardTitle>
          <CardDescription>
            Cada botao dispara o evento via browser-side (fbq/gtag) e server-side (Conversions API).
            Os dados sao ficticios e marcados com <code className="text-xs bg-muted px-1 rounded">test_event_code: TEST</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!anyConfigured ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <FlaskConical className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Nenhum pixel configurado. Configure o Meta Pixel ou Google Tags primeiro.
              </p>
              <Button
                size="sm" variant="outline"
                onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
              >
                Configurar pixels
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {TEST_EVENTS.map(({ name, label, color }) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  disabled={!!firing}
                  className={`gap-2 border-border ${color}`}
                  onClick={() => fireTestEvent(name)}
                >
                  {firing === name ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log de eventos */}
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Log de Eventos
              <Badge variant="outline" className="text-[10px] ml-1">
                Ultimos 30 &middot; atualiza a cada 15s
              </Badge>
            </CardTitle>
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => refetch()}
              disabled={eventsLoading}
            >
              <RefreshCw className={`h-3 w-3 ${eventsLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !events || events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
              <p className="text-xs text-muted-foreground">
                Dispare um evento de teste acima para comecar.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="text-xs">Evento</TableHead>
                    <TableHead className="text-xs">Meta</TableHead>
                    <TableHead className="text-xs">Google</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Campanha</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Cidade / Dispositivo</TableHead>
                    <TableHead className="text-xs text-right">Data/hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => (
                    <TableRow
                      key={ev.id}
                      className={`border-border/40 text-xs ${
                        ev.meta_status === "error" || ev.google_status === "error"
                          ? "bg-destructive/5"
                          : ""
                      }`}
                    >
                      <TableCell className="font-medium font-mono text-foreground py-2">
                        {ev.event_name}
                      </TableCell>
                      <TableCell className="py-2">
                        {ev.meta_status === "error" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                <PlatformStatusBadge status={ev.meta_status} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <pre className="whitespace-pre-wrap text-destructive">
                                {JSON.stringify(ev.meta_response, null, 2)}
                              </pre>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <PlatformStatusBadge status={ev.meta_status} />
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        {ev.google_status === "error" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                <PlatformStatusBadge status={ev.google_status} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <pre className="whitespace-pre-wrap text-destructive">
                                {JSON.stringify(ev.google_response, null, 2)}
                              </pre>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <PlatformStatusBadge status={ev.google_status} />
                        )}
                      </TableCell>
                      <TableCell className="py-2 hidden md:table-cell text-muted-foreground">
                        {ev.utm_campaign ?? "-"}
                      </TableCell>
                      <TableCell className="py-2 hidden lg:table-cell text-muted-foreground">
                        {[ev.city, ev.device, ev.browser].filter(Boolean).join(" · ") || "-"}
                      </TableCell>
                      <TableCell className="py-2 text-right text-muted-foreground tabular-nums">
                        {format(parseISO(ev.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links externos de validacao */}
      <div className="flex flex-wrap gap-2 pb-4">
        {metaPixelId && (
          <Button
            variant="outline" size="sm"
            className="gap-2 text-xs border-border"
            onClick={() => window.open("https://business.facebook.com/events_manager", "_blank", "noopener")}
          >
            <ExternalLink className="h-3 w-3" />
            Meta Events Manager
          </Button>
        )}
        {(gtmContainerId || ga4MeasId) && (
          <Button
            variant="outline" size="sm"
            className="gap-2 text-xs border-border"
            onClick={() => window.open("https://tagassistant.google.com/", "_blank", "noopener")}
          >
            <ExternalLink className="h-3 w-3" />
            Google Tag Assistant
          </Button>
        )}
        {ga4MeasId && (
          <Button
            variant="outline" size="sm"
            className="gap-2 text-xs border-border"
            onClick={() => window.open("https://analytics.google.com/", "_blank", "noopener")}
          >
            <ExternalLink className="h-3 w-3" />
            Google Analytics
          </Button>
        )}
      </div>
    </div>
  );
}

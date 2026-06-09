import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, Loader2, QrCode, RefreshCcw,
  MessageCircle, Bot, Users, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useDynamicClient } from "@/hooks/useDynamicClient";
import { PageHeader } from "./components/PageHeader";
import { CredentialsErrorState } from "./components/CredentialsErrorState";

interface WhatsAppSession {
  id: string;
  phone_number: string | null;
  session_status: "connected" | "disconnected" | "connecting" | "qr_pending";
  connected_at: string | null;
}

const STATUS_CONFIG = {
  connected:    { label: "Conectado",     color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Wifi },
  disconnected: { label: "Desconectado",  color: "text-muted-foreground", bg: "bg-muted/20", icon: WifiOff },
  connecting:   { label: "Conectando...", color: "text-amber-400", bg: "bg-amber-500/10", icon: Loader2 },
  qr_pending:   { label: "QR Code",       color: "text-blue-400", bg: "bg-blue-500/10", icon: QrCode },
};

export function WhatsAppPage() {
  const dc = useDynamicClient();
  const { auth } = useClientAuth();
  const clientId = auth?.user?.client_id ?? "";
  const qc = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrExpiry, setQrExpiry] = useState(0);
  const [botActive, setBotActive] = useState<boolean | null>(null);

  if (!dc) return <CredentialsErrorState />;

  // ── Sessão WA ───────────────────────────────────────────────────────────────
  const { data: session, isLoading } = useQuery<WhatsAppSession | null>({
    queryKey: ["crm_whatsapp_session", clientId],
    queryFn: async () => {
      const { data } = await dc.from("crm_whatsapp_sessions")
        .select("*").limit(1).maybeSingle();
      return data as WhatsAppSession | null;
    },
    enabled: !!dc && !!clientId,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const data = query.state.data as WhatsAppSession | null;
      return data?.session_status === "connecting" ||
        data?.session_status === "qr_pending" ? 5_000 : false;
    },
  });

  // ── Estado do Bot ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dc) return;
    dc.from("ai_settings").select("bot_active").limit(1).maybeSingle().then(({ data }) => {
      setBotActive(data?.bot_active ?? true);
    });
  }, [dc]);

  const toggleBotMutation = useMutation({
    mutationFn: async (active: boolean) => {
      if (!dc) throw new Error("Banco não conectado");
      const { data: existing } = await dc.from("ai_settings").select("id").limit(1).maybeSingle();
      if (existing?.id) {
        await dc.from("ai_settings").update({ bot_active: active }).eq("id", existing.id);
      } else {
        await dc.from("ai_settings").insert({ bot_active: active });
      }
    },
    onSuccess: (_, active) => {
      setBotActive(active);
      toast.success(active ? "Bot ativado — atendimento automático" : "Bot offline — todos os atendimentos vão para o Chatwoot");
    },
    onError: () => toast.error("Erro ao alterar estado do bot."),
  });

  // ── Solicitar QR Code (chama backend Evolution API via Edge Function) ──────
  const requestQrMutation = useMutation({
    mutationFn: async () => {
      // Atualiza status para qr_pending no Banco B
      const { data: existing } = await dc.from("crm_whatsapp_sessions")
        .select("id").limit(1).maybeSingle();
      const payload = { client_id: clientId, session_status: "qr_pending" as const };
      if (existing?.id) {
        await dc.from("crm_whatsapp_sessions").update(payload).eq("id", existing.id);
      } else {
        await dc.from("crm_whatsapp_sessions").insert(payload);
      }
      qc.invalidateQueries({ queryKey: ["crm_whatsapp_session", clientId] });

      // Nota: O QR code real vem do webhook da Evolution API → n8n → Banco B
      // Aqui apenas simulamos a solicitação; o QR chegará via polling
      toast.info("Solicitação enviada. Aguarde o QR Code...");
    },
  });

  const status = session?.session_status ?? "disconnected";
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;
  const StatusIcon = cfg.icon;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="WhatsApp"
        description="Gerencie a conexão do WhatsApp e configure o atendimento automático."
      />

      {/* Status Card */}
      <Card className="card-surface">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            Status da Conexão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Verificando conexão...
            </div>
          ) : (
            <div className={cn("flex items-center gap-3 rounded-xl p-4", cfg.bg)}>
              <StatusIcon className={cn("h-6 w-6 shrink-0", cfg.color,
                status === "connecting" && "animate-spin")} />
              <div>
                <p className={cn("font-bold text-lg", cfg.color)}>{cfg.label}</p>
                {session?.phone_number && (
                  <p className="text-sm text-muted-foreground">{session.phone_number}</p>
                )}
                {session?.connected_at && status === "connected" && (
                  <p className="text-xs text-muted-foreground">
                    Conectado desde {new Date(session.connected_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-wrap gap-2">
            {(status === "disconnected") && (
              <Button
                onClick={() => requestQrMutation.mutate()}
                disabled={requestQrMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                {requestQrMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <QrCode className="h-4 w-4" />}
                Conectar WhatsApp
              </Button>
            )}
            {(status === "qr_pending") && (
              <div className="space-y-3 w-full">
                <div className="flex items-center gap-2 rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-400">
                  <QrCode className="h-4 w-4 shrink-0" />
                  Abra o WhatsApp no celular → Dispositivos Vinculados → Vincular Dispositivo e escaneie o QR Code.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => requestQrMutation.mutate()}
                    disabled={requestQrMutation.isPending} className="gap-2 border-border">
                    <RefreshCcw className="h-3.5 w-3.5" /> Solicitar novo QR
                  </Button>
                </div>
              </div>
            )}
            {status === "connected" && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={async () => {
                  if (!session?.id) return;
                  await dc.from("crm_whatsapp_sessions").update({ session_status: "disconnected" }).eq("id", session.id);
                  qc.invalidateQueries({ queryKey: ["crm_whatsapp_session", clientId] });
                  toast.success("Desconectado.");
                }}
              >
                <WifiOff className="h-3.5 w-3.5 mr-1.5" /> Desconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bot toggle (apenas se show_ia_content) */}
      {auth?.show_ia_content && (
        <Card className="card-surface">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Agente de IA
            </CardTitle>
            <CardDescription>
              Controle se o bot responde automaticamente ou transfere tudo para o Chatwoot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-4 py-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">
                  {botActive ? "Bot Ativo" : "Bot Offline (Handoff total)"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {botActive
                    ? "O bot responde automaticamente. Mensagens fora do padrão são transferidas."
                    : "Todas as conversas são transferidas para atendimento humano no Chatwoot."}
                </p>
              </div>
              <Switch
                checked={botActive ?? true}
                onCheckedChange={v => toggleBotMutation.mutate(v)}
                disabled={toggleBotMutation.isPending || botActive === null}
              />
            </div>

            {/* Indicadores visuais */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className={cn("rounded-xl p-4 space-y-1",
                botActive ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-muted/20 border border-border")}>
                <p className={cn("text-[10px] uppercase tracking-widest font-bold",
                  botActive ? "text-emerald-400" : "text-muted-foreground")}>
                  Automático
                </p>
                <div className="flex items-center gap-1.5">
                  {botActive
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                  <p className={cn("text-sm font-bold", botActive ? "text-emerald-400" : "text-muted-foreground")}>
                    {botActive ? "Ativo" : "Pausado"}
                  </p>
                </div>
              </div>
              <div className={cn("rounded-xl p-4 space-y-1",
                !botActive ? "bg-amber-500/10 border border-amber-500/20" : "bg-muted/20 border border-border")}>
                <p className={cn("text-[10px] uppercase tracking-widest font-bold",
                  !botActive ? "text-amber-400" : "text-muted-foreground")}>
                  Handoff Chatwoot
                </p>
                <div className="flex items-center gap-1.5">
                  <Users className={cn("h-4 w-4", !botActive ? "text-amber-400" : "text-muted-foreground")} />
                  <p className={cn("text-sm font-bold", !botActive ? "text-amber-400" : "text-muted-foreground")}>
                    {!botActive ? "Total" : "Seletivo"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info sobre importação */}
      {status === "connected" && (
        <Card className="card-surface">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              Importação de Contatos
            </CardTitle>
            <CardDescription>
              Os contatos do WhatsApp são importados automaticamente via n8n quando ocorrem novas conversas.
              Acesse <strong>CRM → Clientes</strong> para visualizar os contatos importados.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

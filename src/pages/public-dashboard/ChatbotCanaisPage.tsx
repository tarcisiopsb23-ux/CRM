/**
 * ChatbotCanaisPage
 *
 * Exibe o status das conexões Meta (WhatsApp, Instagram) do cliente.
 * A conexão é configurada pela agência no Maestr.IA (C8 Control → conta do cliente).
 * O cliente visualiza o estado e pode conectar Meta Ads / Google Ads para métricas.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Instagram, MessageCircle, Plus, ShieldCheck,
  CheckCircle2, AlertCircle, Loader2, ExternalLink,
} from "lucide-react";
import { Button }      from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { PageHeader }  from "./components/PageHeader";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase }    from "@/lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MetaConn {
  id:                           string;
  provider:                     string;
  status:                       string;
  display_name:                 string | null;
  whatsapp_display_phone_number:string | null;
  instagram_username:           string | null;
  waba_id:                      string | null;
  client_id:                    string | null;
  health_status:                string;
  last_error:                   string | null;
  created_at:                   string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:                  { label: "Conectado",        color: "text-emerald-400 border-emerald-500/30" },
  inactive:                { label: "Inativo",          color: "text-slate-400 border-slate-500/30" },
  expired:                 { label: "Token expirado",   color: "text-amber-400 border-amber-500/30" },
  error:                   { label: "Erro",             color: "text-red-400 border-red-500/30" },
  needs_reauthentication:  { label: "Reautenticação",   color: "text-amber-400 border-amber-500/30" },
  disconnected:            { label: "Desconectado",     color: "text-slate-400 border-slate-500/30" },
};

// ── Componente ────────────────────────────────────────────────────────────────

export function ChatbotCanaisPage() {
  const { auth }       = useClientAuth();
  const organizationId = auth?.organization_id as string | undefined;
  const clientId       = (auth?.user as Record<string,unknown>)?.client_id as string | undefined;
  const navigate       = useNavigate();
  const slug           = auth?.slug ?? "";

  const [conns,   setConns]   = useState<MetaConn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Busca conexões deste cliente + conexões globais da organização
      let query = supabase
        .from("meta_connections_safe")
        .select("id, provider, status, display_name, whatsapp_display_phone_number, instagram_username, waba_id, client_id, health_status, last_error, created_at")
        .eq("organization_id", organizationId)
        .not("status", "in", '("disconnected","revoked")')
        .order("created_at", { ascending: false });

      if (clientId) {
        // Conexões específicas deste cliente OU globais (client_id IS NULL)
        query = query.or(`client_id.eq.${clientId},client_id.is.null`);
      } else {
        query = query.is("client_id", null);
      }

      const { data } = await query;
      setConns((data ?? []) as MetaConn[]);
    } catch (e) {
      console.error("[ChatbotCanaisPage] load:", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, clientId]);

  useEffect(() => { load(); }, [load]);

  const waConn = conns.find(c => c.provider === "whatsapp" || c.provider === "meta_multi");
  const igConn = conns.find(c => c.provider === "instagram");

  function ChannelStatus({ conn, name, description, icon: Icon, iconBg, iconColor, comingSoon }: {
    conn?: MetaConn; name: string; description: string;
    icon: React.ElementType; iconBg: string; iconColor: string; comingSoon?: boolean;
  }) {
    const cfg = conn ? (STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.disconnected) : null;
    const isConnected = conn?.status === "active";

    return (
      <Card className="card-surface">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <div>
                <CardTitle className="text-base">{name}</CardTitle>
                <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
              </div>
            </div>
            {comingSoon ? (
              <Badge variant="outline" className="text-xs text-muted-foreground border-border">Em breve</Badge>
            ) : conn ? (
              <Badge variant="outline" className={`text-xs ${cfg?.color}`}>{cfg?.label}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-400 border-slate-500/30">Desconectado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isConnected ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-sm font-medium text-emerald-400">
                  {conn?.display_name ?? name}
                </p>
              </div>
              {conn?.whatsapp_display_phone_number && (
                <p className="text-xs text-muted-foreground pl-6">
                  Número: <strong>{conn.whatsapp_display_phone_number}</strong>
                </p>
              )}
              {conn?.instagram_username && (
                <p className="text-xs text-muted-foreground pl-6">
                  Conta: <strong>@{conn.instagram_username}</strong>
                </p>
              )}
              {conn?.waba_id && (
                <p className="text-xs text-muted-foreground pl-6">
                  WABA ID: <code className="text-[10px] bg-muted px-1 rounded">{conn.waba_id}</code>
                </p>
              )}
              <p className="text-xs text-muted-foreground pl-6">
                Conexão gerenciada pela agência.
                Para alterar, entre em contato com o suporte.
              </p>
            </div>
          ) : conn && conn.status !== "active" ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-sm font-medium text-amber-400">{cfg?.label}</p>
              </div>
              {conn.last_error && (
                <p className="text-xs text-muted-foreground pl-6">{conn.last_error}</p>
              )}
              <p className="text-xs text-muted-foreground pl-6">
                Entre em contato com a agência para reestabelecer a conexão.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-secondary/10 p-4 text-center space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {comingSoon
                  ? "Canal em preparação. Disponível em breve após aprovação do App Review da Meta."
                  : "Nenhuma conta conectada. A agência configura a conexão no painel administrativo."}
              </p>
              {!comingSoon && (
                <Button size="sm" variant="outline" className="gap-2 border-border" disabled>
                  <Plus className="h-3.5 w-3.5" /> Aguardando conexão
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Canais"
        description="Status das conexões Meta para atendimento e automações."
      />

      {/* Aviso de segurança */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-400">Conexão 100% oficial Meta</p>
          <p className="text-xs text-muted-foreground">
            Todos os canais são conectados exclusivamente via APIs oficiais da Meta (Instagram Login e WhatsApp Business Platform).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <ChannelStatus
            conn={waConn}
            name="WhatsApp Business"
            description="Conecte seu número via WhatsApp Business Platform (API oficial)"
            icon={MessageCircle}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-500"
          />
          <ChannelStatus
            conn={igConn}
            name="Instagram"
            description="Conecte sua conta profissional para receber DMs e responder comentários"
            icon={Instagram}
            iconBg="bg-pink-500/10"
            iconColor="text-pink-500"
            comingSoon
          />
        </div>
      )}

      {/* Link para documentação */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api"
          target="_blank" rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Documentação WhatsApp Business API
        </a>
      </div>
    </div>
  );
}

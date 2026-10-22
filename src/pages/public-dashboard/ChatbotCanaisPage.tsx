/**
 * ChatbotCanaisPage
 *
 * Exibe 3 cards fixos independentes (WhatsApp, Instagram, Facebook Page)
 * derivados das conexões Meta do cliente.
 * Usa a EF get-meta-connections (service_role) para contornar RLS.
 *
 * Fase 3: Adiciona toggles Bot IA / Atendimento Humano por canal.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, Instagram, ShieldCheck, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Facebook,
  Bot, Users, AlertTriangle, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { Button }      from "@/components/ui/button";
import { Switch }      from "@/components/ui/switch";
import { PageHeader }  from "./components/PageHeader";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase }    from "@/lib/supabase";
import { toast }       from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface MetaConn {
  id:                            string;
  provider:                      string;
  status:                        string;
  display_name:                  string | null;
  whatsapp_display_phone_number: string | null;
  whatsapp_phone_number_id:      string | null;
  instagram_username:            string | null;
  facebook_page_name:            string | null;
  waba_id:                       string | null;
  facebook_page_id:              string | null;
  instagram_account_id:          string | null;
  ad_account_id:                 string | null;
  health_status:                 string;
  last_error:                    string | null;
}

interface ChannelConfig {
  botWhatsapp: boolean;
  botInstagram: boolean;
  botFacebook: boolean;
  humanWhatsapp: boolean;
  humanInstagram: boolean;
  humanFacebook: boolean;
  configLoading: boolean;
  configSaving: boolean;
}

const DEFAULT_CONFIG: ChannelConfig = {
  botWhatsapp:   true,
  botInstagram:  true,
  botFacebook:   true,
  humanWhatsapp: false,
  humanInstagram: false,
  humanFacebook: false,
  configLoading: false,
  configSaving:  false,
};

export function ChatbotCanaisPage() {
  const navigate       = useNavigate();
  const { auth, slug } = useClientAuth();
  const organizationId = auth?.organization_id as string | undefined;
  const clientId       = auth?.id as string | undefined;

  const [conns,   setConns]   = useState<MetaConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [config,  setConfig]  = useState<ChannelConfig>(DEFAULT_CONFIG);

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const raw = sessionStorage.getItem(`client_auth_v2_${slug}`);
      const clientSession = raw ? JSON.parse(raw) : null;
      const token = clientSession?.session?.access_token ?? ANON_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-meta-connections`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey":        ANON_KEY,
        },
        body: JSON.stringify({ organization_id: organizationId, client_id: clientId }),
      });
      const data = await res.json() as { connections?: MetaConn[]; error?: string };
      setConns(data.connections ?? []);
    } catch (e) {
      console.error("[ChatbotCanaisPage] load:", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, clientId, slug]);

  useEffect(() => { load(); }, [load]);

  // ── Carregar configuração de canais ──────────────────────────────────────

  useEffect(() => {
    if (!clientId) return;
    setConfig(prev => ({ ...prev, configLoading: true }));
    supabase
      .rpc('get_agent_channel_config', { p_client_id: clientId })
      .then(({ data, error }) => {
        if (error || !data || (data as unknown[]).length === 0) return;
        // RPC retorna array de rows; pegamos o primeiro
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        setConfig(prev => ({
          ...prev,
          botWhatsapp:   row.handles_whatsapp  ?? true,
          botInstagram:  row.handles_instagram ?? true,
          botFacebook:   row.handles_facebook  ?? true,
          humanWhatsapp:  row.auto_assign ?? false,
          humanInstagram: row.auto_assign ?? false,
          humanFacebook:  row.auto_assign ?? false,
        }));
      })
      .finally(() => {
        setConfig(prev => ({ ...prev, configLoading: false }));
      });
  }, [clientId]);

  // ── Salvar configuração de canal ─────────────────────────────────────────

  const saveChannelConfig = useCallback(
    async (channel: 'whatsapp' | 'instagram' | 'facebook', field: 'bot' | 'human', value: boolean) => {
      if (!clientId || !organizationId) return;

      // Atualização otimista do estado
      const prevConfig = { ...config };
      const updated: ChannelConfig = { ...config, configSaving: true };

      if (channel === 'whatsapp' && field === 'bot')     updated.botWhatsapp    = value;
      if (channel === 'instagram' && field === 'bot')    updated.botInstagram   = value;
      if (channel === 'facebook' && field === 'bot')     updated.botFacebook    = value;
      if (channel === 'whatsapp' && field === 'human')   updated.humanWhatsapp  = value;
      if (channel === 'instagram' && field === 'human')  updated.humanInstagram = value;
      if (channel === 'facebook' && field === 'human')   updated.humanFacebook  = value;

      setConfig(updated);

      try {
        const autoAssign = updated.humanWhatsapp || updated.humanInstagram || updated.humanFacebook;
        const { error } = await supabase.rpc('upsert_agent_channel_config', {
          p_client_id:          clientId,
          p_organization_id:    organizationId,
          p_handles_whatsapp:   updated.botWhatsapp,
          p_handles_instagram:  updated.botInstagram,
          p_handles_facebook:   updated.botFacebook,
          p_auto_assign:        autoAssign,
        });
        if (error) throw error;
      } catch (err) {
        console.error("[ChatbotCanaisPage] saveChannelConfig:", err);
        toast.error("Erro ao salvar configuração do canal.");
        // Reverter estado em caso de erro
        setConfig({ ...prevConfig, configSaving: false });
        return;
      }

      setConfig(prev => ({ ...prev, configSaving: false }));
    },
    [clientId, organizationId, config]
  );

  // ── Channel detection ───────────────────────────────────────────────────

  const waConn = conns.find(c =>
    c.status === "active" &&
    (c.whatsapp_phone_number_id || c.waba_id ||
     c.provider === "whatsapp" || c.provider === "meta_multi")
  ) ?? null;

  const igConn = conns.find(c =>
    c.status === "active" &&
    (c.instagram_account_id ||
     c.provider === "instagram" || c.provider === "meta_multi")
  ) ?? null;

  const fbConn = conns.find(c =>
    c.status === "active" &&
    (c.facebook_page_id ||
     c.provider === "facebook" || c.provider === "meta_multi")
  ) ?? null;

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
            Todos os canais são conectados exclusivamente via APIs oficiais da Meta.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── WhatsApp Business ── */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <MessageCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">WhatsApp Business</CardTitle>
                    <CardDescription className="text-xs mt-0.5">API oficial WhatsApp Business</CardDescription>
                  </div>
                </div>
                {waConn ? (
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {waConn ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
                  </div>
                  {waConn.whatsapp_display_phone_number && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {waConn.whatsapp_display_phone_number}
                    </p>
                  )}

                  {/* Toggles Bot IA / Atendimento humano */}
                  <div className="mt-3 border border-border/40 rounded-lg divide-y divide-border/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-xs font-medium">Bot IA</p>
                          <p className="text-[10px] text-muted-foreground">Responde automaticamente via IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.botWhatsapp}
                        onCheckedChange={(v) => saveChannelConfig('whatsapp', 'bot', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-xs font-medium">Atendimento humano</p>
                          <p className="text-[10px] text-muted-foreground">Encaminhar para agentes no C8</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.humanWhatsapp}
                        onCheckedChange={(v) => saveChannelConfig('whatsapp', 'human', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                  </div>

                  {/* Avisos condicionais */}
                  {!config.botWhatsapp && !config.humanWhatsapp && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sem automação — mensagens não serão respondidas automaticamente.
                    </div>
                  )}
                  {config.botWhatsapp && config.humanWhatsapp && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      O bot responde primeiro. Se não resolver, transfere para um agente.
                    </div>
                  )}

                  <div className="pl-0 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => navigate("/mensagens/templates")}
                    >
                      Gerenciar Templates
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo.{" "}
                      <button
                        onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
                        className="text-primary underline hover:no-underline"
                      >
                        Ver Integrações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Instagram ── */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                    <Instagram className="h-5 w-5 text-pink-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Instagram</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Conta profissional Instagram</CardDescription>
                  </div>
                </div>
                {igConn ? (
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {igConn ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
                  </div>
                  {igConn.instagram_username && (
                    <p className="text-xs text-muted-foreground pl-6">
                      @{igConn.instagram_username}
                    </p>
                  )}

                  {/* Toggles Bot IA / Atendimento humano */}
                  <div className="mt-3 border border-border/40 rounded-lg divide-y divide-border/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-xs font-medium">Bot IA</p>
                          <p className="text-[10px] text-muted-foreground">Responde automaticamente via IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.botInstagram}
                        onCheckedChange={(v) => saveChannelConfig('instagram', 'bot', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-xs font-medium">Atendimento humano</p>
                          <p className="text-[10px] text-muted-foreground">Encaminhar para agentes no C8</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.humanInstagram}
                        onCheckedChange={(v) => saveChannelConfig('instagram', 'human', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                  </div>

                  {/* Avisos condicionais */}
                  {!config.botInstagram && !config.humanInstagram && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sem automação — mensagens não serão respondidas automaticamente.
                    </div>
                  )}
                  {config.botInstagram && config.humanInstagram && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      O bot responde primeiro. Se não resolver, transfere para um agente.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo.{" "}
                      <button
                        onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
                        className="text-primary underline hover:no-underline"
                      >
                        Ver Integrações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Facebook Page ── */}
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <Facebook className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Facebook Page</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Página do Facebook</CardDescription>
                  </div>
                </div>
                {fbConn ? (
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                    Não configurado
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {fbConn ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
                  </div>
                  {(fbConn.facebook_page_name || fbConn.facebook_page_id) && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {fbConn.facebook_page_name ?? fbConn.facebook_page_id}
                    </p>
                  )}

                  {/* Toggles Bot IA / Atendimento humano */}
                  <div className="mt-3 border border-border/40 rounded-lg divide-y divide-border/30">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-violet-400" />
                        <div>
                          <p className="text-xs font-medium">Bot IA</p>
                          <p className="text-[10px] text-muted-foreground">Responde automaticamente via IA</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.botFacebook}
                        onCheckedChange={(v) => saveChannelConfig('facebook', 'bot', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <div>
                          <p className="text-xs font-medium">Atendimento humano</p>
                          <p className="text-[10px] text-muted-foreground">Encaminhar para agentes no C8</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.humanFacebook}
                        onCheckedChange={(v) => saveChannelConfig('facebook', 'human', v)}
                        disabled={config.configSaving || config.configLoading}
                      />
                    </div>
                  </div>

                  {/* Avisos condicionais */}
                  {!config.botFacebook && !config.humanFacebook && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Sem automação — mensagens não serão respondidas automaticamente.
                    </div>
                  )}
                  {config.botFacebook && config.humanFacebook && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      O bot responde primeiro. Se não resolver, transfere para um agente.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo.{" "}
                      <button
                        onClick={() => navigate(`/${slug}/configuracoes/integracoes`)}
                        className="text-primary underline hover:no-underline"
                      >
                        Ver Integrações
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Documentação WhatsApp Business API
        </a>
      </div>
    </div>
  );
}

/**
 * ChatbotCanaisPage
 *
 * Exibe 3 cards fixos independentes (WhatsApp, Instagram, Facebook Page)
 * derivados das conexões Meta do cliente.
 * Usa a EF get-meta-connections (service_role) para contornar RLS.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, Instagram, ShieldCheck, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Facebook,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { Button }      from "@/components/ui/button";
import { PageHeader }  from "./components/PageHeader";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase }    from "@/lib/supabase";

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

export function ChatbotCanaisPage() {
  const navigate       = useNavigate();
  const { auth }       = useClientAuth();
  const organizationId = auth?.organization_id as string | undefined;
  const clientId       = auth?.id as string | undefined;

  const [conns,   setConns]   = useState<MetaConn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setLoading(false); return; }

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
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  // ── Channel detection ───────────────────────────────────────────────────

  // WhatsApp: any active connection with whatsapp_phone_number_id OR waba_id OR provider in ('whatsapp','meta_multi')
  const waConn = conns.find(c =>
    c.status === "active" &&
    (c.whatsapp_phone_number_id || c.waba_id ||
     c.provider === "whatsapp" || c.provider === "meta_multi")
  ) ?? null;

  // Instagram: any active connection with instagram_account_id OR provider in ('instagram','meta_multi')
  const igConn = conns.find(c =>
    c.status === "active" &&
    (c.instagram_account_id ||
     c.provider === "instagram" || c.provider === "meta_multi")
  ) ?? null;

  // Facebook Page: any active connection with facebook_page_id OR provider in ('facebook','meta_multi')
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
                  <div className="pl-6 pt-1">
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
                      A agência configura a conexão no painel administrativo
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
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo
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
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A agência configura a conexão no painel administrativo
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

/**
 * ChatbotCanaisPage
 *
 * Exibe o status das conexões Meta do cliente (WhatsApp, Instagram, Facebook).
 * Usa a EF get-meta-connections (service_role) para contornar RLS.
 * Uma conexão meta_multi contém WhatsApp + Instagram + Facebook Ads juntos.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, Instagram, ShieldCheck, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Facebook,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge }       from "@/components/ui/badge";
import { PageHeader }  from "./components/PageHeader";
import { useClientAuth } from "@/hooks/useClientAuth";
import { supabase }    from "@/lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface MetaConn {
  id:                           string;
  provider:                     string;
  status:                       string;
  display_name:                 string | null;
  whatsapp_display_phone_number:string | null;
  instagram_username:           string | null;
  facebook_page_name:           string | null;
  waba_id:                      string | null;
  facebook_page_id:             string | null;
  instagram_account_id:         string | null;
  ad_account_id:                string | null;
  health_status:                string;
  last_error:                   string | null;
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  active:                 { label: "Conectado",      color: "text-emerald-400 border-emerald-500/30" },
  inactive:               { label: "Inativo",        color: "text-slate-400 border-slate-500/30" },
  expired:                { label: "Token expirado", color: "text-amber-400 border-amber-500/30" },
  error:                  { label: "Erro",           color: "text-red-400 border-red-500/30" },
  needs_reauthentication: { label: "Reautenticação", color: "text-amber-400 border-amber-500/30" },
};

function ChannelRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs pl-6">
      {icon && <span>{icon}</span>}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function ConnectionCard({ conn }: { conn: MetaConn }) {
  const cfg = STATUS_CFG[conn.status] ?? { label: conn.status, color: "text-slate-400 border-slate-500/30" };
  const isActive = conn.status === "active";

  // Determina ícone pelo provider
  const hasWA = !!(conn.whatsapp_display_phone_number || conn.waba_id);
  const hasIG = !!conn.instagram_username;
  const hasFB = !!conn.facebook_page_id;
  const hasAds = !!conn.ad_account_id;

  return (
    <Card className="card-surface">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Facebook className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">{conn.display_name ?? "Meta"}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Conexão {conn.provider === "meta_multi" ? "multi-plataforma" : conn.provider}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isActive ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-sm font-medium text-emerald-400">Conexão ativa</p>
            </div>
            {hasWA && conn.whatsapp_display_phone_number && (
              <ChannelRow icon="💬" label="WhatsApp" value={conn.whatsapp_display_phone_number} />
            )}
            {hasWA && conn.waba_id && (
              <ChannelRow icon="💬" label="WABA" value={conn.waba_id} />
            )}
            {hasIG && (
              <ChannelRow icon="📷" label="Instagram" value={`@${conn.instagram_username}`} />
            )}
            {hasFB && (
              <ChannelRow icon="👥" label="Facebook" value={conn.facebook_page_name ?? conn.facebook_page_id!} />
            )}
            {hasAds && (
              <ChannelRow icon="📊" label="Ads" value={conn.ad_account_id!} />
            )}
            <p className="text-xs text-muted-foreground pl-6 pt-1">
              Conexão gerenciada pela agência.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-sm font-medium text-amber-400">{cfg.label}</p>
            </div>
            {conn.last_error && (
              <p className="text-xs text-muted-foreground pl-6">{conn.last_error}</p>
            )}
            <p className="text-xs text-muted-foreground pl-6">
              Entre em contato com a agência para reestabelecer a conexão.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ChatbotCanaisPage() {
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

  // Filtra Instagram separado (conexão dedicada) para exibição futura
  const metaConns = conns.filter(c =>
    c.provider === "meta_multi" || c.provider === "whatsapp" || c.provider === "facebook"
  );
  const igOnlyConns = conns.filter(c => c.provider === "instagram");

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
          {metaConns.length === 0 && igOnlyConns.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
              <MessageCircle className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nenhuma conta Meta conectada. A agência configura a conexão no painel administrativo.
              </p>
            </div>
          ) : (
            <>
              {metaConns.map(c => <ConnectionCard key={c.id} conn={c} />)}
              {igOnlyConns.map(c => (
                <Card key={c.id} className="card-surface">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                          <Instagram className="h-5 w-5 text-pink-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Instagram</CardTitle>
                          <CardDescription className="text-xs mt-0.5">Conta profissional</CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-xs ${STATUS_CFG[c.status]?.color ?? ""}`}>
                        {STATUS_CFG[c.status]?.label ?? c.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {c.status === "active" && c.instagram_username && (
                      <p className="text-xs text-emerald-400">@{c.instagram_username}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}

          {/* Instagram em breve (se não há conexão dedicada) */}
          {igOnlyConns.length === 0 && (
            <Card className="card-surface opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10">
                      <Instagram className="h-5 w-5 text-pink-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Instagram (separado)</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Conexão dedicada Instagram — em breve
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border">Em breve</Badge>
                </div>
              </CardHeader>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api" target="_blank" rel="noopener noreferrer"
          className="hover:text-foreground transition-colors">
          Documentação WhatsApp Business API
        </a>
      </div>
    </div>
  );
}

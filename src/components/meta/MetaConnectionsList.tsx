/**
 * MetaConnectionsList
 *
 * Listagem de todas as conexões Meta da organização.
 * Mostra cards com badges de método (OAuth / Manual / Embedded Signup),
 * status, ativos conectados e botão Gerenciar.
 *
 * Inclui os botões de entrada:
 *   [ + Conectar automaticamente ]  → fluxo OAuth existente (não alterado)
 *   [ + Configuração manual ]       → visível apenas para owner/admin
 */

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertCircle, Clock, XCircle, Loader2,
  Settings2, Plus, Zap, Wrench, RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, canManageRole } from "@/hooks/useAuth";
import { initiateMetaOAuth } from "@/lib/oauth";
import {
  useMetaConnections,
  type MetaConnectionSafe,
  type ConnectionMethod,
  type ConnectionStatus,
  type HealthStatus,
} from "@/hooks/useMetaConnections";
import { MetaManualConnectModal } from "./MetaManualConnectModal";
import { MetaManageConnectionSheet } from "./MetaManageConnectionSheet";

// ── Helpers visuais ───────────────────────────────────────────────────────────

const METHOD_BADGE: Record<ConnectionMethod, { label: string; className: string }> = {
  oauth:            { label: "OAuth",            className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  manual:           { label: "Manual",           className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  embedded_signup:  { label: "Embedded Signup",  className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
};

const STATUS_CONFIG: Record<ConnectionStatus, { icon: React.ReactNode; label: string; dot: string }> = {
  active:                  { icon: <CheckCircle2 className="h-3 w-3" />, label: "Ativo",               dot: "bg-emerald-400" },
  inactive:                { icon: <Clock        className="h-3 w-3" />, label: "Inativo",             dot: "bg-slate-400" },
  expired:                 { icon: <AlertCircle  className="h-3 w-3" />, label: "Expirado",            dot: "bg-amber-400" },
  error:                   { icon: <XCircle      className="h-3 w-3" />, label: "Erro",                dot: "bg-red-400" },
  revoked:                 { icon: <XCircle      className="h-3 w-3" />, label: "Revogado",            dot: "bg-red-400" },
  needs_reauthentication:  { icon: <AlertCircle  className="h-3 w-3" />, label: "Requer atualização",  dot: "bg-amber-400" },
  disconnected:            { icon: <XCircle      className="h-3 w-3" />, label: "Desconectado",        dot: "bg-slate-500" },
};

const HEALTH_COLOR: Record<HealthStatus, string> = {
  healthy: "text-emerald-400",
  warning: "text-amber-400",
  failed:  "text-red-400",
  unknown: "text-slate-400",
};

const PROVIDER_LABEL: Record<string, string> = {
  facebook:   "Facebook",
  instagram:  "Instagram",
  whatsapp:   "WhatsApp Business",
  meta_multi: "Meta completo",
};

// ── Ícone Meta SVG ────────────────────────────────────────────────────────────
function MetaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 14.59L6.17 12l1.41-1.41L10.59 13.17l6.01-6.01 1.41 1.41-7.42 7.42z" />
    </svg>
  );
}

// ── Card individual de conexão ────────────────────────────────────────────────

function ConnectionCard({
  connection,
  onManage,
}: {
  connection: MetaConnectionSafe;
  onManage: (c: MetaConnectionSafe) => void;
}) {
  const status     = STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.inactive;
  const method     = METHOD_BADGE[connection.connection_method] ?? METHOD_BADGE.manual;
  const healthCls  = HEALTH_COLOR[connection.health_status] ?? HEALTH_COLOR.unknown;

  const assets: string[] = [];
  if (connection.facebook_page_name || connection.facebook_page_id)
    assets.push(connection.facebook_page_name ?? `Page ${connection.facebook_page_id}`);
  if (connection.instagram_username || connection.instagram_account_id)
    assets.push(connection.instagram_username ? `@${connection.instagram_username.replace(/^@/, "")}` : `IG ${connection.instagram_account_id}`);
  if (connection.whatsapp_display_phone_number || connection.whatsapp_phone_number_id)
    assets.push(connection.whatsapp_display_phone_number ?? `Phone ${connection.whatsapp_phone_number_id}`);

  const validatedAt = connection.token_last_validated_at
    ? formatDistanceToNow(new Date(connection.token_last_validated_at), { addSuffix: true, locale: ptBR })
    : null;

  return (
    <Card className="card-surface border-border/50 hover:border-primary/30 transition-all">
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#1877F2]/15 flex items-center justify-center shrink-0">
              <svg className="h-4 w-4 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {connection.display_name ?? PROVIDER_LABEL[connection.provider] ?? connection.provider}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {PROVIDER_LABEL[connection.provider] ?? connection.provider}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge className={cn("text-[10px] border", method.className)}>
              {method.label}
            </Badge>
          </div>
        </div>

        {/* Assets */}
        {assets.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {assets.map((a) => (
              <Badge key={a} variant="outline" className="text-[10px] font-normal">
                {a}
              </Badge>
            ))}
          </div>
        )}

        {/* Status row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            <span className="text-muted-foreground">{status.label}</span>
            {connection.health_status !== "unknown" && (
              <span className={cn("ml-1", healthCls)}>
                · {connection.health_status}
              </span>
            )}
          </div>
          {connection.connection_environment !== "production" && (
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
              {connection.connection_environment}
            </Badge>
          )}
        </div>

        {/* Token info */}
        {connection.token_is_set && (
          <div className="text-[10px] text-muted-foreground font-mono">
            {connection.token_preview ?? "Token configurado"}
          </div>
        )}

        {/* Validated at */}
        {validatedAt && (
          <p className="text-[10px] text-muted-foreground">Validado {validatedAt}</p>
        )}

        {/* Needs reauthentication warning */}
        {connection.status === "needs_reauthentication" && (
          <div className="text-[10px] text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Esta conexão precisa de uma nova credencial.
          </div>
        )}

        {/* Gerenciar */}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-[11px] gap-1.5"
          onClick={() => onManage(connection)}
        >
          <Settings2 className="h-3 w-3" /> Gerenciar
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  /** slug do cliente para o redirect pós-OAuth */
  clientSlug?: string;
  clientId?: string | null;
  /** Quando usado dentro do modal de tenant, passar o organizationId do tenant */
  organizationId?: string;
}

export function MetaConnectionsList({ clientSlug = "", clientId = null, organizationId: externalOrgId }: Props) {
  const { role, isSupport } = useAuth();
  const isAdminOrOwner = canManageRole(role, isSupport);

  const { connections, isLoading, flags, refetch } = useMetaConnections(externalOrgId);

  const [manualModalOpen,  setManualModalOpen]  = useState(false);
  const [manageConnection, setManageConnection] = useState<MetaConnectionSafe | null>(null);
  const [isRefreshing,     setIsRefreshing]     = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleOAuth = () => {
    try {
      initiateMetaOAuth(clientId ?? "", clientSlug);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar conexão automática.");
    }
  };

  const showManualButton =
    isAdminOrOwner && (flags?.manual_enabled !== false);

  return (
    <div className="space-y-4">
      {/* Header com botões de ação */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Meta Connections</p>
          <p className="text-xs text-muted-foreground">
            {connections.length} {connections.length === 1 ? "conexão" : "conexões"} configuradas
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCcw className="h-3 w-3" />}
            Atualizar
          </Button>

          {/* Botão OAuth — não alterar comportamento existente */}
          {flags?.oauth_enabled !== false && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleOAuth}
            >
              <Zap className="h-3 w-3" />
              Conectar automaticamente
            </Button>
          )}

          {/* Botão Manual — apenas owner/admin */}
          {showManualButton && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white border-0"
              onClick={() => setManualModalOpen(true)}
            >
              <Wrench className="h-3 w-3" />
              Configuração manual
            </Button>
          )}
        </div>
      </div>

      {/* Lista de conexões */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando conexões...
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <p className="text-sm font-medium">Nenhuma conexão Meta configurada</p>
          <p className="text-xs text-muted-foreground">
            Use &quot;Conectar automaticamente&quot; para o fluxo OAuth oficial
            {showManualButton && ' ou "Configuração manual" para configurar credenciais diretamente.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              connection={c}
              onManage={setManageConnection}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      <MetaManualConnectModal
        open={manualModalOpen}
        onOpenChange={setManualModalOpen}
        organizationId={externalOrgId}
      />

      {manageConnection && (
        <MetaManageConnectionSheet
          connection={manageConnection}
          open={!!manageConnection}
          onOpenChange={(v) => { if (!v) setManageConnection(null); }}
          organizationId={externalOrgId}
        />
      )}
    </div>
  );
}

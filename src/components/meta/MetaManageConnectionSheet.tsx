/**
 * MetaManageConnectionSheet
 *
 * Sheet lateral para gerenciar uma conexão Meta individual.
 * Ações disponíveis:
 *   - Test connection (valida token + ativos)
 *   - Replace token (fluxo seguro: validar → criptografar → substituir)
 *   - Edit asset IDs (reabre o modal de configuração)
 *   - Disconnect (deactivate ou remove credentials)
 *   - Migrate to OAuth (quando manual → OAuth)
 *
 * O token NUNCA é exposto — apenas o preview mascarado é exibido.
 */

import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Eye, EyeOff,
  RefreshCcw, KeyRound, Pencil, Unlink, Zap, ShieldAlert,
  Facebook, Instagram, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, canManageRole } from "@/hooks/useAuth";
import {
  useMetaConnections,
  type MetaConnectionSafe,
  type ValidationResult,
} from "@/hooks/useMetaConnections";
import { MetaManualConnectModal } from "./MetaManualConnectModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-mono text-xs break-all">{value}</span>
    </div>
  );
}

function ValidationResultCard({ result }: { result: ValidationResult }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Resultado</p>
      <Separator />
      <div className="flex items-center gap-2">
        {result.token.valid
          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          : <XCircle     className="h-4 w-4 text-red-400" />}
        <span className="text-sm">Meta Token</span>
        <Badge className={cn("ml-auto text-[10px]",
          result.token.valid
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-red-500/15 text-red-400"
        )}>
          {result.token.valid ? "Válido" : "Inválido"}
        </Badge>
      </div>
      {result.facebook_page && (
        <div className="flex items-center gap-2">
          {result.facebook_page.accessible
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle     className="h-4 w-4 text-red-400" />}
          <span className="text-sm">Facebook Page</span>
          {result.facebook_page.name && (
            <span className="text-xs text-muted-foreground ml-1">{result.facebook_page.name}</span>
          )}
        </div>
      )}
      {result.instagram && (
        <div className="flex items-center gap-2">
          {result.instagram.accessible
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle     className="h-4 w-4 text-red-400" />}
          <span className="text-sm">Instagram</span>
          {result.instagram.username && (
            <span className="text-xs text-muted-foreground ml-1">@{result.instagram.username}</span>
          )}
        </div>
      )}
      {result.whatsapp_waba && (
        <div className="flex items-center gap-2">
          {result.whatsapp_waba.accessible
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle     className="h-4 w-4 text-red-400" />}
          <span className="text-sm">WhatsApp WABA</span>
        </div>
      )}
      {result.whatsapp_phone && (
        <div className="flex items-center gap-2">
          {result.whatsapp_phone.accessible
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle     className="h-4 w-4 text-red-400" />}
          <span className="text-sm">WhatsApp Phone</span>
          {result.whatsapp_phone.display_number && (
            <span className="text-xs text-muted-foreground ml-1">{result.whatsapp_phone.display_number}</span>
          )}
        </div>
      )}
      {result.errors.length > 0 && (
        <div className="pt-1 space-y-1">
          {result.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400 flex items-start gap-1">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" /> {e}
            </p>
          ))}
        </div>
      )}
      {result.token.permissions && result.token.permissions.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] text-muted-foreground mb-1">Permissões detectadas</p>
          <div className="flex flex-wrap gap-1">
            {result.token.permissions.slice(0, 10).map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] font-mono">{p}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  connection: MetaConnectionSafe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando usado dentro do modal de tenant */
  organizationId?: string;
}

export function MetaManageConnectionSheet({ connection, open, onOpenChange, organizationId: externalOrgId }: Props) {
  const { role, isSupport } = useAuth();
  const isAdminOrOwner = canManageRole(role, isSupport);

  const { validate, replaceToken, disconnect } = useMetaConnections(externalOrgId ?? connection.organization_id);

  // Test state
  const [isTesting,         setIsTesting]         = useState(false);
  const [testResult,        setTestResult]         = useState<ValidationResult | null>(null);

  // Replace token state
  const [showReplaceForm,   setShowReplaceForm]    = useState(false);
  const [newToken,          setNewToken]           = useState("");
  const [showNewToken,      setShowNewToken]       = useState(false);
  const [isTestingNewToken, setIsTestingNewToken]  = useState(false);
  const [newTokenTestResult, setNewTokenTestResult] = useState<ValidationResult | null>(null);
  const [isReplacingToken,  setIsReplacingToken]   = useState(false);

  // Edit IDs modal
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Disconnect state
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // ── Test connection ────────────────────────────────────────────────────────
  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await validate.mutateAsync({
        access_token:         "__use_stored__", // sinaliza para o backend usar o token armazenado
        provider:             connection.provider,
        facebook_page_id:     connection.facebook_page_id    ?? undefined,
        instagram_account_id: connection.instagram_account_id ?? undefined,
        waba_id:              connection.waba_id              ?? undefined,
        phone_number_id:      connection.whatsapp_phone_number_id ?? undefined,
        business_id:          connection.business_id          ?? undefined,
        ad_account_id:        connection.ad_account_id        ?? undefined,
      });
      setTestResult(result);
      if (result.token.valid) {
        toast.success("Conexão validada com sucesso!");
      } else {
        toast.error("Token inválido ou expirado.");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao testar conexão");
    } finally {
      setIsTesting(false);
    }
  };

  // ── Test new token (antes de substituir) ──────────────────────────────────
  const handleTestNewToken = async () => {
    if (!newToken.trim()) { toast.error("Informe o novo token."); return; }
    setIsTestingNewToken(true);
    setNewTokenTestResult(null);
    try {
      const result = await validate.mutateAsync({
        access_token:         newToken,
        provider:             connection.provider,
        facebook_page_id:     connection.facebook_page_id    ?? undefined,
        instagram_account_id: connection.instagram_account_id ?? undefined,
        waba_id:              connection.waba_id              ?? undefined,
        phone_number_id:      connection.whatsapp_phone_number_id ?? undefined,
      });
      setNewTokenTestResult(result);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao testar novo token");
    } finally {
      setIsTestingNewToken(false);
    }
  };

  // ── Replace token ─────────────────────────────────────────────────────────
  const handleReplaceToken = async () => {
    if (!newTokenTestResult?.token.valid) {
      toast.error("Valide o novo token antes de substituir.");
      return;
    }
    setIsReplacingToken(true);
    try {
      await replaceToken.mutateAsync({
        connection_id:  connection.id,
        access_token:   newToken,
        token_expires_at: newTokenTestResult.token.expires_at,
      });
      toast.success("Token substituído com sucesso!");
      // Limpa o token da memória
      setNewToken("");
      setNewTokenTestResult(null);
      setShowReplaceForm(false);
      setShowNewToken(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao substituir token");
    } finally {
      setIsReplacingToken(false);
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = async (mode: "deactivate" | "remove_credentials") => {
    setIsDisconnecting(true);
    try {
      await disconnect.mutateAsync({ connection_id: connection.id, mode });
      toast.success(mode === "deactivate" ? "Conexão desativada." : "Credenciais removidas.");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao desconectar");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const methodLabel = { oauth: "OAuth", manual: "Manual", embedded_signup: "Embedded Signup" }[connection.connection_method];
  const methodColor = { oauth: "text-blue-400", manual: "text-purple-400", embedded_signup: "text-cyan-400" }[connection.connection_method];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              {connection.display_name ?? connection.provider}
              <Badge variant="outline" className={cn("text-[10px]", methodColor)}>
                {methodLabel}
              </Badge>
            </SheetTitle>
            <SheetDescription>
              Gerenciar conexão Meta
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* ── Connection Information ─────────────────────────────────── */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Informações</p>
              <Separator />
              <InfoRow label="Método"      value={methodLabel} />
              <InfoRow label="Ambiente"    value={connection.connection_environment} />
              <InfoRow label="Status"      value={connection.status} />
              <InfoRow label="Provider"    value={connection.provider} />
              {connection.token_last_validated_at && (
                <InfoRow
                  label="Validado em"
                  value={format(new Date(connection.token_last_validated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                />
              )}
              {connection.token_expires_at && (
                <InfoRow
                  label="Expira em"
                  value={format(new Date(connection.token_expires_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                />
              )}
            </div>

            {/* ── Assets ──────────────────────────────────────────────────── */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ativos</p>
              <Separator />
              {connection.facebook_page_id && (
                <div className="flex items-center gap-2 py-1">
                  <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />
                  <div>
                    <p className="text-sm">{connection.facebook_page_name ?? "Facebook Page"}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{connection.facebook_page_id}</p>
                  </div>
                </div>
              )}
              {connection.instagram_account_id && (
                <div className="flex items-center gap-2 py-1">
                  <Instagram className="h-3.5 w-3.5 text-[#E1306C]" />
                  <div>
                    <p className="text-sm">{connection.instagram_username ? `@${connection.instagram_username}` : "Instagram"}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{connection.instagram_account_id}</p>
                  </div>
                </div>
              )}
              {connection.whatsapp_phone_number_id && (
                <div className="flex items-center gap-2 py-1">
                  <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" />
                  <div>
                    <p className="text-sm">{connection.whatsapp_display_phone_number ?? "WhatsApp"}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{connection.whatsapp_phone_number_id}</p>
                  </div>
                </div>
              )}
              {!connection.facebook_page_id && !connection.instagram_account_id && !connection.whatsapp_phone_number_id && (
                <p className="text-xs text-muted-foreground py-1">Nenhum ativo configurado</p>
              )}
            </div>

            {/* ── Token ────────────────────────────────────────────────────── */}
            {connection.token_is_set && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Token</p>
                <Separator />
                <p className="text-xs font-mono text-muted-foreground py-1">
                  {connection.token_preview ?? "Token configurado"}
                </p>
              </div>
            )}

            {/* Needs reauthentication alert */}
            {connection.status === "needs_reauthentication" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  Esta conexão precisa de uma nova credencial. Use "Substituir token" para atualizar.
                </p>
              </div>
            )}

            {/* ── Ações ─────────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ações</p>
              <Separator />

              {/* Test */}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={handleTest}
                disabled={isTesting}
              >
                {isTesting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCcw className="h-3.5 w-3.5" />}
                Testar conexão
              </Button>

              {testResult && <ValidationResultCard result={testResult} />}

              {/* Replace Token — apenas para conexões manuais ou quando admin */}
              {(connection.connection_method === "manual" || isAdminOrOwner) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => { setShowReplaceForm((v) => !v); setNewToken(""); setNewTokenTestResult(null); }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {showReplaceForm ? "Cancelar substituição" : "Substituir token"}
                  </Button>

                  {showReplaceForm && (
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <p className="text-xs font-semibold">Replace Access Token</p>
                      <div className="relative">
                        <Input
                          type={showNewToken ? "text" : "password"}
                          value={newToken}
                          onChange={(e) => { setNewToken(e.target.value); setNewTokenTestResult(null); }}
                          placeholder="Novo token..."
                          className="font-mono text-xs pr-10"
                          autoComplete="off"
                          data-lpignore="true"
                          data-form-type="other"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewToken((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showNewToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={handleTestNewToken}
                        disabled={isTestingNewToken || !newToken.trim()}
                      >
                        {isTestingNewToken
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCcw className="h-3.5 w-3.5" />}
                        Testar novo token
                      </Button>

                      {newTokenTestResult && <ValidationResultCard result={newTokenTestResult} />}

                      <Button
                        size="sm"
                        className="w-full gap-2"
                        onClick={handleReplaceToken}
                        disabled={isReplacingToken || !newTokenTestResult?.token.valid}
                      >
                        {isReplacingToken
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <KeyRound className="h-3.5 w-3.5" />}
                        Confirmar substituição
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Edit asset IDs */}
              {isAdminOrOwner && connection.connection_method === "manual" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setEditModalOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar IDs dos ativos
                </Button>
              )}

              {/* Migrate to OAuth */}
              {isAdminOrOwner && connection.connection_method === "manual" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                  onClick={() => toast.info("Para migrar para OAuth, use o botão 'Conectar automaticamente' — o sistema detectará o ativo e perguntará se deseja migrar.")}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Migrar para OAuth
                </Button>
              )}

              <Separator />

              {/* Disconnect */}
              {isAdminOrOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={isDisconnecting}
                    >
                      {isDisconnecting
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Unlink className="h-3.5 w-3.5" />}
                      Desconectar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desconectar conexão Meta</AlertDialogTitle>
                      <AlertDialogDescription>
                        Escolha como deseja desconectar esta conexão.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2">
                      <p className="text-sm text-muted-foreground">
                        <strong>Desativar:</strong> mantém configurações e histórico, apenas suspende a conexão. Pode ser reativada.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Remover credenciais:</strong> remove o token armazenado. Não apaga conversas, automações ou histórico.
                      </p>
                    </div>
                    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDisconnect("deactivate")}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        Desativar
                      </AlertDialogAction>
                      <AlertDialogAction
                        onClick={() => handleDisconnect("remove_credentials")}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Remover credenciais
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de edição de IDs */}
      <MetaManualConnectModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        editConnectionId={connection.id}
      />
    </>
  );
}

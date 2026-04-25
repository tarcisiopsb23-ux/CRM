/**
 * PinAuthDialog
 * Dialog de autorização com duas opções:
 * 1. PIN local (8 dígitos) — para quem está presente
 * 2. Autorização remota — cria solicitação para gestor aprovar de qualquer lugar
 *
 * Exigido apenas de usuários com role manager, admin ou owner para PIN local.
 * Qualquer usuário pode solicitar autorização remota.
 */
import { useState, useRef, useEffect } from "react";
import { KeyRound, Loader2, ShieldOff, Wifi, Clock, CheckCircle2, XCircle, Ban } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { usePendingAuthorizations } from "@/hooks/usePendingAuthorizations";
import { usePendingAuthContext } from "@/contexts/PendingAuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const PIN_ROLES = ["owner", "admin", "manager"];

interface PinAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  module?: string;
  onConfirm: () => Promise<void> | void;
  loading?: boolean;
}

export function PinAuthDialog({
  open,
  onOpenChange,
  title = "Confirmar com PIN",
  description = "Digite seu PIN de 8 dígitos para autorizar.",
  module = "geral",
  onConfirm,
  loading = false,
}: PinAuthDialogProps) {
  const { profile } = useAuth();
  const orgId = useOrganization();
  const { create: createAuth, cancel: cancelAuth } = usePendingAuthorizations();
  const { registerPendingAuth, clearPendingAuth } = usePendingAuthContext();

  const hasRole = PIN_ROLES.includes(profile?.role ?? "");

  // PIN local state
  const [digits, setDigits] = useState<string[]>(Array(8).fill(""));
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Remote auth state
  const [pendingAuthId, setPendingAuthId] = useState<string | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<"idle" | "waiting" | "approved" | "rejected">("idle");
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const tab = hasRole ? "pin" : "remote";

  useEffect(() => {
    if (open) {
      if (remoteStatus !== "waiting") {
        setDigits(Array(8).fill(""));
        setPinError(null);
        setRemoteStatus("idle");
        setRemoteError(null);
        setPendingAuthId(null);
      }
      if (hasRole && remoteStatus !== "waiting") setTimeout(() => refs.current[0]?.focus(), 50);
    }
  }, [open]);

  // Polling para aprovação remota — gerenciado pelo PendingAuthProvider global
  // (sobrevive a navegação e desmontagem do dialog)

  // ── PIN local ──────────────────────────────────────────────────────────────
  const pin = digits.join("");
  const isComplete = pin.length === 8 && digits.every(d => d !== "");

  const handleDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...digits];
    next[index] = value.slice(-1);
    setDigits(next);
    if (value && index < 7) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits]; next[index] = ""; setDigits(next);
      } else if (index > 0) refs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && isComplete) void handlePinSubmit();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    if (text.length === 8) { setDigits(text.split("")); refs.current[7]?.focus(); }
    e.preventDefault();
  };

  const handlePinSubmit = async () => {
    if (!isComplete) return;
    setPinError(null);
    setVerifying(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("verify_manager_pin", { p_pin: pin });
      if (rpcError || !data) {
        setPinError("PIN incorreto. Tente novamente.");
        setDigits(Array(8).fill(""));
        setTimeout(() => refs.current[0]?.focus(), 50);
        return;
      }
      await onConfirm();
      onOpenChange(false);
    } catch (e: unknown) {
      setPinError(e instanceof Error ? e.message : "Erro ao verificar PIN.");
    } finally {
      setVerifying(false);
    }
  };

  // ── Autorização remota ─────────────────────────────────────────────────────
  const handleRequestRemote = async () => {
    setRemoteError(null);
    try {
      const auth = await createAuth.mutateAsync({
        action_title: title,
        action_description: description ?? title,
        module,
      });
      setPendingAuthId(auth.id);
      setRemoteStatus("waiting");

      // Registra no provider global — polling continua mesmo se o dialog fechar
      registerPendingAuth({
        id: auth.id,
        onApproved: async () => {
          setRemoteStatus("approved");
          await onConfirm();
          onOpenChange(false);
        },
        onRejected: () => {
          setRemoteStatus("rejected");
        },
      });
    } catch (e: unknown) {
      setRemoteError(e instanceof Error ? e.message : "Erro ao criar solicitação.");
    }
  };

  const handleCancelRemote = () => {
    if (pendingAuthId) {
      cancelAuth.mutate(pendingAuthId);
      clearPendingAuth(pendingAuthId);
    }
    setRemoteStatus("idle");
    setPendingAuthId(null);
  };

  const busy = verifying || loading;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-[50%]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Tabs defaultValue={tab} className="w-full">
          <TabsList className="w-full">
            {hasRole && <TabsTrigger value="pin" className="flex-1">PIN Local</TabsTrigger>}
            <TabsTrigger value="remote" className="flex-1">
              <Wifi className="h-3.5 w-3.5 mr-1" />
              Autorização Remota
            </TabsTrigger>
          </TabsList>

          {/* ── Aba PIN ── */}
          {hasRole && (
            <TabsContent value="pin" className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground text-center">
                Digite seu PIN de 8 dígitos para confirmar.
              </p>
              <div className="flex gap-1.5 justify-center">
                {digits.map((d, i) => (
                  <Input
                    key={i}
                    ref={el => { refs.current[i] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(e, i)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    className="w-10 h-10 text-center text-lg p-0 font-mono"
                    disabled={busy}
                  />
                ))}
              </div>
              {pinError && (
                <Alert variant="destructive">
                  <AlertDescription>{pinError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
                <Button onClick={handlePinSubmit} disabled={!isComplete || busy}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verificando...</> : "Confirmar"}
                </Button>
              </DialogFooter>
            </TabsContent>
          )}

          {/* ── Aba Remota ── */}
          <TabsContent value="remote" className="space-y-4 pt-2">
            {remoteStatus === "idle" && (
              <>
                <p className="text-xs text-muted-foreground text-center">
                  Envie uma solicitação para um gestor, admin ou proprietário aprovar remotamente. A solicitação expira em 30 minutos.
                </p>
                {remoteError && (
                  <Alert variant="destructive">
                    <AlertDescription>{remoteError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button onClick={handleRequestRemote} disabled={createAuth.isPending}>
                    {createAuth.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</>
                      : <><Wifi className="h-4 w-4 mr-2" />Solicitar aprovação</>
                    }
                  </Button>
                </DialogFooter>
              </>
            )}

            {remoteStatus === "waiting" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="relative">
                    <Clock className="h-10 w-10 text-primary animate-pulse" />
                  </div>
                  <p className="text-sm font-medium text-center">Aguardando aprovação</p>
                  <p className="text-xs text-muted-foreground text-center">
                    Um gestor, admin ou proprietário precisa aprovar esta ação no painel de autorizações.
                  </p>
                  <Badge variant="outline" className="text-xs">
                    Expira em 30 minutos
                  </Badge>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCancelRemote} disabled={cancelAuth.isPending}>
                    <Ban className="h-4 w-4 mr-2" />
                    Cancelar solicitação
                  </Button>
                </DialogFooter>
              </div>
            )}

            {remoteStatus === "approved" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium">Aprovado! Executando ação...</p>
              </div>
            )}

            {remoteStatus === "rejected" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-4">
                  <XCircle className="h-10 w-10 text-destructive" />
                  <p className="text-sm font-medium">Solicitação rejeitada ou expirada</p>
                  <p className="text-xs text-muted-foreground text-center">
                    A ação não foi autorizada. Você pode tentar novamente.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                  <Button onClick={() => { setRemoteStatus("idle"); setPendingAuthId(null); }}>
                    Tentar novamente
                  </Button>
                </DialogFooter>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

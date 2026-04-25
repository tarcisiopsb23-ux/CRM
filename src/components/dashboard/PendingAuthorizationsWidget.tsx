/**
 * PendingAuthorizationsWidget
 * Widget do dashboard que exibe autorizações remotas pendentes.
 * Cada item mostra só o título em 1 linha; ao clicar expande para detalhes e ações.
 */
import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ShieldCheck, CheckCircle2, XCircle, Ban, KeyRound, Loader2, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { usePendingAuthorizations, type PendingAuthorization } from "@/hooks/usePendingAuthorizations";
import { useAuth } from "@/contexts/AuthContext";

const PIN_ROLES = ["owner", "admin", "manager"];

function AuthRow({ auth, isManager, onApprove, onReject, onCancel, cancelPending }: {
  auth: PendingAuthorization;
  isManager: boolean;
  onApprove: (a: PendingAuthorization) => void;
  onReject: (a: PendingAuthorization) => void;
  onCancel: (id: string) => void;
  cancelPending: boolean;
}) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const isOwn = auth.requested_by === profile?.id;

  return (
    <div className="rounded-md bg-white dark:bg-zinc-900 border border-amber-100 dark:border-amber-800 overflow-hidden">
      {/* Linha colapsada */}
      <button
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <p className="text-xs font-medium truncate flex-1">{auth.action_title}</p>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="px-3 pb-2 space-y-2 border-t border-amber-100 dark:border-amber-800 pt-2">
          <p className="text-xs text-muted-foreground">{auth.action_description}</p>
          <p className="text-xs text-muted-foreground">
            {auth.requester_name ?? "—"} •{" "}
            {formatDistanceToNow(parseISO(auth.requested_at), { addSuffix: true, locale: ptBR })}
          </p>
          <div className="flex gap-1.5">
            {isManager && (
              <>
                <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 px-2" onClick={() => onApprove(auth)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs text-destructive px-2" onClick={() => onReject(auth)}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeitar
                </Button>
              </>
            )}
            {isOwn && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground px-2" onClick={() => onCancel(auth.id)} disabled={cancelPending}>
                <Ban className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PendingAuthorizationsWidget() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { pending, approve, reject, cancel } = usePendingAuthorizations();
  const isManager = PIN_ROLES.includes(profile?.role ?? "");

  const [approveTarget, setApproveTarget] = useState<PendingAuthorization | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>(Array(8).fill(""));
  const [pinError, setPinError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingAuthorization | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  if (pending.length === 0) return null;

  const handleDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...pinDigits];
    next[index] = value.slice(-1);
    setPinDigits(next);
    if (value && index < 7)
      (document.getElementById(`widget-pin-${index + 1}`) as HTMLInputElement)?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace") {
      if (pinDigits[index]) {
        const next = [...pinDigits]; next[index] = ""; setPinDigits(next);
      } else if (index > 0) {
        (document.getElementById(`widget-pin-${index - 1}`) as HTMLInputElement)?.focus();
      }
    }
    if (e.key === "Enter" && pinDigits.every(d => d !== "")) void handleApprove();
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    const pin = pinDigits.join("");
    if (pin.length < 8) { setPinError("Digite todos os 8 dígitos."); return; }
    setPinError(null);
    try {
      await approve.mutateAsync({ id: approveTarget.id, pin });
      toast.success("Autorização aprovada.");
      setApproveTarget(null);
      setPinDigits(Array(8).fill(""));
    } catch (e: unknown) {
      setPinError(e instanceof Error ? e.message : "Erro ao aprovar.");
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({ id: rejectTarget.id, note: rejectNote.trim() || undefined });
      toast.success("Solicitação rejeitada.");
      setRejectTarget(null);
      setRejectNote("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao rejeitar.");
    }
  };

  const visible = pending.slice(0, 3);
  const extra = pending.length - visible.length;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <ShieldCheck className="h-4 w-4" />
              Autorizações Pendentes
              <Badge className="bg-amber-500 text-white text-xs">{pending.length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-amber-700 dark:text-amber-300 h-7" onClick={() => navigate("/authorizations")}>
              Ver todas <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-0">
          {visible.map((auth) => (
            <AuthRow
              key={auth.id}
              auth={auth}
              isManager={isManager}
              onApprove={(a) => { setApproveTarget(a); setPinDigits(Array(8).fill("")); setPinError(null); }}
              onReject={(a) => { setRejectTarget(a); setRejectNote(""); }}
              onCancel={(id) => cancel.mutate(id)}
              cancelPending={cancel.isPending}
            />
          ))}
          {extra > 0 && (
            <Button variant="ghost" size="sm" className="w-full text-xs text-amber-700 dark:text-amber-300" onClick={() => navigate("/authorizations")}>
              +{extra} mais — ver todas
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Aprovar com PIN */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o) { setApproveTarget(null); setPinDigits(Array(8).fill("")); setPinError(null); } }}>
        <DialogContent className="max-w-[40%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Aprovar com PIN
            </DialogTitle>
            <DialogDescription>{approveTarget?.action_title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground text-center">
              Digite seu PIN de 8 dígitos para aprovar.
            </p>
            <div className="flex gap-1.5 justify-center">
              {pinDigits.map((d, i) => (
                <Input
                  key={i}
                  id={`widget-pin-${i}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(e, i)}
                  className="w-10 h-10 text-center text-lg p-0 font-mono"
                  disabled={approve.isPending}
                />
              ))}
            </div>
            {pinError && <Alert variant="destructive"><AlertDescription>{pinError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={approve.isPending}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleApprove}
              disabled={pinDigits.some(d => !d) || approve.isPending}
            >
              {approve.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Aprovando...</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" />Aprovar</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rejeitar */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNote(""); } }}>
        <DialogContent className="max-w-[40%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Rejeitar solicitação
            </DialogTitle>
            <DialogDescription>{rejectTarget?.action_title}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input placeholder="Motivo (opcional)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
              {reject.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Rejeitando...</> : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, CheckCircle2, XCircle, Ban, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePendingAuthorizations, type PendingAuthorization } from "@/hooks/usePendingAuthorizations";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  expirado: "Expirado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "default",
  aprovado: "secondary",
  rejeitado: "destructive",
  cancelado: "outline",
  expirado: "outline",
};

const PIN_ROLES = ["owner", "admin", "manager"];

export default function AuthorizationsPage({ embedded = false }: { embedded?: boolean }) {
  const { profile } = useAuth();
  const { data: all = [], isLoading, pending, approve, reject, cancel } = usePendingAuthorizations();
  const isManager = PIN_ROLES.includes(profile?.role ?? "");

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<PendingAuthorization | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>(Array(8).fill(""));
  const [pinError, setPinError] = useState<string | null>(null);
  const pinRefs = Array.from({ length: 8 }, () => null as HTMLInputElement | null);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<PendingAuthorization | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const handleDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...pinDigits];
    next[index] = value.slice(-1);
    setPinDigits(next);
    if (value && index < 7) (document.getElementById(`pin-auth-${index + 1}`) as HTMLInputElement)?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace") {
      if (pinDigits[index]) {
        const next = [...pinDigits]; next[index] = ""; setPinDigits(next);
      } else if (index > 0) {
        (document.getElementById(`pin-auth-${index - 1}`) as HTMLInputElement)?.focus();
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

  const handleCancel = async (auth: PendingAuthorization) => {
    try {
      await cancel.mutateAsync(auth.id);
      toast.success("Solicitação cancelada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar.");
    }
  };

  const history = all.filter(a => a.status !== "pendente");

  const renderRow = (auth: PendingAuthorization) => {
    const isOwn = auth.requested_by === profile?.id;
    const isPending = auth.status === "pendente";
    const isExpired = auth.expires_at && new Date(auth.expires_at) < new Date();

    return (
      <TableRow key={auth.id}>
        <TableCell>
          <div>
            <p className="font-medium text-sm">{auth.action_title}</p>
            <p className="text-xs text-muted-foreground">{auth.action_description}</p>
          </div>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {auth.requester_name ?? "—"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatDistanceToNow(parseISO(auth.requested_at), { addSuffix: true, locale: ptBR })}
          {isPending && !isExpired && (
            <p className="text-amber-600 text-xs">
              Expira {formatDistanceToNow(parseISO(auth.expires_at), { addSuffix: true, locale: ptBR })}
            </p>
          )}
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[auth.status] ?? "outline"}>
            {STATUS_LABEL[auth.status] ?? auth.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex gap-1 justify-end">
            {isPending && isManager && (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                  onClick={() => { setApproveTarget(auth); setPinDigits(Array(8).fill("")); setPinError(null); }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive h-7 text-xs"
                  onClick={() => { setRejectTarget(auth); setRejectNote(""); }}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Rejeitar
                </Button>
              </>
            )}
            {isPending && isOwn && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => handleCancel(auth)}
                disabled={cancel.isPending}
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Cancelar
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className={embedded ? "space-y-4" : "space-y-6 p-6"}>
      {!embedded && (
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold">Autorizações</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie solicitações de autorização remota para ações sensíveis.
            </p>
          </div>
          {pending.length > 0 && (
            <Badge className="ml-auto bg-amber-500 text-white">
              {pending.length} pendente{pending.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pendentes
            {pending.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : pending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm">Nenhuma autorização pendente.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ação</TableHead>
                      <TableHead>Solicitado por</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{pending.map(renderRow)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Clock className="h-8 w-8" />
                  <p className="text-sm">Nenhum histórico ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ação</TableHead>
                      <TableHead>Solicitado por</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{history.map(renderRow)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Aprovar com PIN */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o) { setApproveTarget(null); setPinDigits(Array(8).fill("")); setPinError(null); } }}>
        <DialogContent className="max-w-[40%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Aprovar com PIN
            </DialogTitle>
            <DialogDescription>
              {approveTarget?.action_title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground text-center">
              Digite seu PIN de 8 dígitos para aprovar esta solicitação.
            </p>
            <div className="flex gap-1.5 justify-center">
              {pinDigits.map((d, i) => (
                <Input
                  key={i}
                  id={`pin-auth-${i}`}
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
            {pinError && (
              <Alert variant="destructive">
                <AlertDescription>{pinError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={approve.isPending}>
              Cancelar
            </Button>
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
            <DialogDescription>
              {rejectTarget?.action_title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Motivo (opcional)"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
              {reject.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Rejeitando...</>
                : "Confirmar rejeição"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

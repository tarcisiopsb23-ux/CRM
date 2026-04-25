import { useState } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Check, Pencil, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useC8Payments } from "@/hooks/useC8Payments";
import { useC8Tenants } from "@/hooks/useC8Tenants";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import type { Payment } from "@/types/crm";

interface C8PaymentsViewProps {
  organizationId: string;
  canEdit: boolean;
  canDelete: boolean;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const STATUS_BADGE: Record<string, string> = {
  pago: "bg-emerald-100 text-emerald-700",
  pendente: "bg-yellow-100 text-yellow-700",
  atrasado: "bg-red-100 text-red-700",
  cancelado: "bg-slate-100 text-slate-600",
};

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendente" },
  { value: "pago", label: "Pago" },
  { value: "atrasado", label: "Atrasado" },
  { value: "cancelado", label: "Cancelado" },
];

type PaymentWithLegacy = Payment & { isLegacy: boolean; client_name?: string };

export function C8PaymentsView({ organizationId, canEdit, canDelete }: C8PaymentsViewProps) {
  const qc = useQueryClient();
  const now = new Date();

  const [statusFilter, setStatusFilter] = useState("todos");
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

  const { data: tenants } = useC8Tenants(organizationId);

  const { payments, legacyPayments, isLoading } = useC8Payments({
    organizationId,
    statusFilter: statusFilter !== "todos" ? [statusFilter] : undefined,
    periodStart,
    periodEnd,
    limit: 100,
  });

  // Receive payment dialog
  const [receiveTarget, setReceiveTarget] = useState<PaymentWithLegacy | null>(null);
  const [receiveValue, setReceiveValue] = useState("");
  const [receiveDate, setReceiveDate] = useState(format(now, "yyyy-MM-dd"));
  const [isReceiving, setIsReceiving] = useState(false);

  // Edit payment dialog
  const [editTarget, setEditTarget] = useState<PaymentWithLegacy | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete payment dialog
  const [deleteTarget, setDeleteTarget] = useState<PaymentWithLegacy | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteJustification, setDeleteJustification] = useState("");
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["c8_payments", organizationId] });
    qc.invalidateQueries({ queryKey: ["payments", organizationId] });
  };

  const handleReceive = async () => {
    if (!receiveTarget) return;
    const val = parseFloat(receiveValue);
    if (isNaN(val) || val <= 0) { toast.error("Informe um valor válido."); return; }
    setIsReceiving(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          status: "pago",
          paid_at: new Date(receiveDate + "T12:00:00").toISOString(),
          value: val,
        })
        .eq("id", receiveTarget.id);
      if (error) throw error;
      toast.success("Recebimento registrado!");
      setReceiveTarget(null);
      invalidate();
    } catch {
      toast.error("Erro ao registrar recebimento.");
    } finally {
      setIsReceiving(false);
    }
  };

  const handleEditPayment = async () => {
    if (!editTarget) return;
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) { toast.error("Informe um valor válido."); return; }
    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({ value: val, due_date: editDueDate })
        .eq("id", editTarget.id);
      if (error) throw error;
      toast.success("Cobrança atualizada!");
      setEditTarget(null);
      invalidate();
    } catch {
      toast.error("Erro ao atualizar cobrança.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!deleteTarget) return;
    if (!deleteJustification.trim()) { toast.error("Informe a justificativa."); return; }
    if (!deletePassword.trim()) { toast.error("Informe a senha."); return; }
    setIsDeletingPayment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Usuário não autenticado.");
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (authErr) { toast.error("Senha incorreta."); setIsDeletingPayment(false); return; }
      const { error } = await supabase.from("payments").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Cobrança excluída.");
      setDeleteTarget(null);
      setDeletePassword("");
      setDeleteJustification("");
      invalidate();
    } catch (e: unknown) {
      const err = e as Error;
      toast.error(err?.message ?? "Erro ao excluir cobrança.");
    } finally {
      setIsDeletingPayment(false);
    }
  };

  // Build combined list with client names
  const tenantMap = Object.fromEntries(
    (tenants ?? []).map((t) => [t.client_id, t.client_name])
  );

  const getClientName = (p: Payment): string => {
    const clientData = (p as unknown as { clients?: { name?: string; company?: string } }).clients;
    return clientData?.name ?? clientData?.company ?? tenantMap[p.client_id] ?? "—";
  };

  const allPayments: PaymentWithLegacy[] = [
    ...payments.map((p) => ({ ...p, isLegacy: false, client_name: getClientName(p) })),
    ...legacyPayments.map((p) => ({ ...p, isLegacy: true, client_name: getClientName(p) })),
  ]
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx) // deduplicate by id
    .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));

  // Totals
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  const expectedMonthly = (tenants ?? [])
    .filter((t) => t.subscription_status === "ativo")
    .reduce((sum, t) => sum + t.plan_value, 0);

  const receivedThisMonth = [...payments, ...legacyPayments]
    .filter(
      (p) =>
        p.status === "pago" &&
        p.paid_at &&
        p.paid_at >= monthStart &&
        p.paid_at <= monthEnd + "T23:59:59"
    )
    .reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Receita Mensal Esperada</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtCurrency(expectedMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebido no Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{fmtCurrency(receivedThisMonth)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros</span>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Período — Início</Label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Período — Fim</Label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando pagamentos...
        </div>
      ) : allPayments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum pagamento encontrado para o período selecionado.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recebido em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.client_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {p.description}
                  </TableCell>
                  <TableCell>{fmtDate(p.due_date)}</TableCell>
                  <TableCell className="font-semibold">{fmtCurrency(p.value)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge className={STATUS_BADGE[p.status ?? ""] ?? "bg-muted text-muted-foreground"}>
                        {p.status ?? "—"}
                      </Badge>
                      {p.isLegacy && (
                        <Badge className="bg-slate-100 text-slate-500 text-xs">Legado</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{fmtDate(p.paid_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && p.status !== "pago" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-emerald-600 hover:text-emerald-700"
                          title="Registrar recebimento"
                          onClick={() => {
                            setReceiveTarget(p);
                            setReceiveValue(String(p.value));
                            setReceiveDate(
                              p.due_date
                                ? String(p.due_date).substring(0, 10)
                                : format(now, "yyyy-MM-dd")
                            );
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-500 hover:text-slate-700"
                          title="Editar cobrança"
                          onClick={() => {
                            setEditTarget(p);
                            setEditValue(String(p.value));
                            setEditDueDate(
                              p.due_date ? String(p.due_date).substring(0, 10) : ""
                            );
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          title="Excluir cobrança"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Receive dialog */}
      <Dialog open={!!receiveTarget} onOpenChange={(open) => { if (!open) setReceiveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              {receiveTarget?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor Recebido (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={receiveValue}
                onChange={(e) => setReceiveValue(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de Recebimento</Label>
              <Input
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>Cancelar</Button>
            <Button onClick={handleReceive} disabled={isReceiving}>
              {isReceiving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Check className="h-4 w-4 mr-1" />
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
            <DialogDescription>
              {editTarget?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de Vencimento</Label>
              <Input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEditPayment} disabled={isSavingEdit}>
              {isSavingEdit && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeletePassword(""); setDeleteJustification(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Cobrança</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Informe sua senha e a justificativa para prosseguir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Justificativa *</Label>
              <Textarea
                value={deleteJustification}
                onChange={(e) => setDeleteJustification(e.target.value)}
                placeholder="Motivo da exclusão..."
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Senha *</Label>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Sua senha de acesso"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeletePassword("");
                setDeleteJustification("");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePayment}
              disabled={isDeletingPayment || !deleteJustification.trim() || !deletePassword.trim()}
            >
              {isDeletingPayment && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
